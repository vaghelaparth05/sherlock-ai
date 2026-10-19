import { handle, json } from "@/lib/http";
import { loadNaaSample } from "@/lib/samples";

export function POST() {
  return handle(async () => json(await loadNaaSample()));
}
