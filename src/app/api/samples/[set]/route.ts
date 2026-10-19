import { fail, handle, json } from "@/lib/http";
import { isSampleSet, loadSample } from "@/lib/samples";

export function POST(_request: Request, ctx: RouteContext<"/api/samples/[set]">) {
  return handle(async () => {
    const { set } = await ctx.params;
    if (!isSampleSet(set)) return fail("Unknown sample set.", 404);
    return json(await loadSample(set));
  });
}
