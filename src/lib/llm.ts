import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./hash.ts";

/**
 * The only place Sherlock calls a model. Every result is cached at
 * data/cache/<prompt_version>/<sha256 of the request>.json. With SHERLOCK_OFFLINE=1
 * only the cache is used and a missing entry is an error.
 */

export const MODEL = process.env.SHERLOCK_MODEL ?? "claude-sonnet-5-5";

export interface ModelResult<T> {
  output: T;
  model: string;
  promptVersion: string;
  cached: boolean;
}

interface CacheFile<T> {
  model: string;
  prompt_version: string;
  request_sha256: string;
  created_at: string;
  output: T;
}

let client: Anthropic | undefined;

export async function structuredCall<T>(req: {
  promptVersion: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<ModelResult<T>> {
  const key = sha256(canonicalJson({ system: req.system, user: req.user, schema: req.schema }));
  const file = path.join(process.cwd(), "data", "cache", req.promptVersion, `${key}.json`);

  if (existsSync(file)) {
    const hit = JSON.parse(readFileSync(file, "utf8")) as CacheFile<T>;
    return { output: hit.output, model: hit.model, promptVersion: hit.prompt_version, cached: true };
  }
  if (process.env.SHERLOCK_OFFLINE === "1") {
    throw new Error(`Offline mode: no cached ${req.promptVersion} result for request ${key.slice(0, 12)}.`);
  }

  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: req.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: req.schema } },
  });

  if (response.stop_reason === "refusal") throw new Error(`${req.promptVersion}: the model declined this request.`);
  if (response.stop_reason === "max_tokens") throw new Error(`${req.promptVersion}: output was cut off at max_tokens.`);
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`${req.promptVersion}: no text in the response.`);
  const output = JSON.parse(text.text) as T;

  const entry: CacheFile<T> = {
    model: response.model,
    prompt_version: req.promptVersion,
    request_sha256: key,
    created_at: new Date().toISOString(),
    output,
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(entry, null, 2));
  return { output, model: response.model, promptVersion: req.promptVersion, cached: false };
}
