import { Suspense } from "react";
import { SourceDetailRoute } from "@/components/source-detail-route";

export const metadata = { title: "Source · Sherlock.ai" };

// The slug is known only at request time, so the route's useParams/usePathname suspend: prerender the fallback.
export default function SourcePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5 text-center">
          <p className="text-[14px] text-muted">Loading source…</p>
        </main>
      }
    >
      <SourceDetailRoute />
    </Suspense>
  );
}
