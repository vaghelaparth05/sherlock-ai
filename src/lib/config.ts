import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** Classification scheme in data/taxonomy.yaml, owned by the IM team. */
export interface Taxonomy {
  regions: Record<string, { name: string }>;
  units: Record<string, { region: string; serves: string }>;
  functions: Record<string, { owner: string; related: string[]; consequence: number }>;
  subjects: Record<string, { label: string; value: string }>;
}

/** Weights, lookups and bands in config/scoring.yaml, owned by the IM team. */
export interface ScoringConfig {
  weights: { provenance: number; currency: number; corroboration: number; integrity: number };
  authority: { owner: number; related: number; other: number };
  custody: Record<string, number>;
  currency: {
    later_declared_version: number;
    review_current: number;
    review_missing_or_passed: number;
    superseded_penalty: number;
  };
  corroboration: {
    contradicted: number;
    unsupported: number;
    two_or_more: number;
    one: number;
    none: number;
    provisional_confidence: number;
  };
  integrity: Record<string, number>;
  likelihood: { min: number; level: number; label: string }[];
  risk_bands: { max: number; band: string }[];
  blocked_bands: string[];
  echo_similarity: number;
  bias: { group_by: "region" | "unit"; concentration_high: number };
}

function load<T>(file: string): T {
  return YAML.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as T;
}

let tax: Taxonomy | undefined;
let cfg: ScoringConfig | undefined;

export const taxonomy = (): Taxonomy => (tax ??= load<Taxonomy>("data/taxonomy.yaml"));
export const scoringConfig = (): ScoringConfig => (cfg ??= load<ScoringConfig>("config/scoring.yaml"));
