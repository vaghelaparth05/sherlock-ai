import Link from "next/link";
import { TopNav } from "@/components/top-nav";

export const metadata = { title: "Scanning · Sherlock.ai" };

export default function ScanPage() {
  return (
    <div className="min-h-screen">
      <TopNav active={1} />
      <main className="mx-auto grid max-w-6xl place-items-center px-5 py-32 text-center">
        <div>
          <p className="text-[12px] text-faint">Step 2 of 5</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">The scanning screen comes next</h1>
          <p className="mx-auto mt-3 max-w-md text-[14px] text-muted">
            This is a placeholder so the import page has somewhere to go. We build this screen after the import page is
            approved.
          </p>
          <Link
            href="/import"
            className="mt-6 inline-block rounded-md border border-line-strong px-4 py-2 text-[13px] transition hover:bg-hover"
          >
            Back to import
          </Link>
        </div>
      </main>
    </div>
  );
}
