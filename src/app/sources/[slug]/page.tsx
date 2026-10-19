import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceDetailView } from "@/components/source-detail-view";
import { DOCS, FINDINGS } from "@/lib/results-data";
import { slugOf, sourceDetail, sourceSlugs } from "@/lib/results-derive";

export function generateStaticParams() {
  return sourceSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/sources/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const name = DOCS.find((d) => slugOf(d.source) === slug)?.source;
  return { title: name ? `${name} · Sources · Sherlock.ai` : "Source not found · Sherlock.ai" };
}

export default async function SourcePage(props: PageProps<"/sources/[slug]">) {
  const { slug } = await props.params;
  const detail = sourceDetail(FINDINGS, slug);
  if (!detail) notFound();
  return <SourceDetailView detail={detail} />;
}
