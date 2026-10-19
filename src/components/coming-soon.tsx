import Link from "next/link";
import { TopNav } from "@/components/top-nav";

/** Placeholder for screens that are not built yet, so every link has somewhere to go. */
export function ComingSoon({ step, title, active }: { step: string; title: string; active: number }) {
  return (
    <div className="min-h-screen">
      <TopNav active={active} />
      <main className="mx-auto grid max-w-6xl place-items-center px-5 py-32 text-center">
        <div>
          <p className="text-[12px] text-faint">{step}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mx-auto mt-3 max-w-md text-[14px] text-muted">
            This screen is a placeholder so links have somewhere to go. It gets built after the import page and
            dashboard are approved.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
            >
              Back to dashboard
            </Link>
            <Link href="/import" className="rounded-md border border-line-strong px-4 py-2 text-[13px] transition hover:bg-hover">
              Import
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
