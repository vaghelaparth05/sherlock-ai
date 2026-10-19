import { Suspense } from "react";
import { SourceDetailView } from "@/components/source-detail-view";

export const metadata = { title: "Source · Sherlock.ai" };

export default function SourcePage({ params }: PageProps<"/sources/[slug]">) {
  return <Suspense fallback={null}>{params.then(({ slug }) => <SourceDetailView slug={slug} />)}</Suspense>;
}
