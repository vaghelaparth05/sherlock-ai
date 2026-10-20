import { chooseProvider, runScanJob, type ScanJob } from "../../src/lib/scanner/index";

/**
 * Netlify Background Function (the "-background" suffix): Netlify answers 202 straight away and lets this run
 * for up to 15 minutes. The site's API calls it after it has created the scan record.
 */
export default async (req: Request) => {
  if (!process.env.SCAN_SECRET || req.headers.get("x-scan-secret") !== process.env.SCAN_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const job = (await req.json()) as ScanJob;
  await runScanJob(job.scanId, job.collectionId, chooseProvider(job.provider), job.fresh);
  return new Response("done");
};
