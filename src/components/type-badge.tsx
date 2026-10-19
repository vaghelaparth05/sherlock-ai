import { Scale, ShieldAlert, TriangleAlert, Activity } from "lucide-react";
import { TYPE_META } from "@/lib/meta";
import type { FindingType } from "@/lib/types";

export function TypeIcon({ type, className = "size-3.5" }: { type: FindingType | "system"; className?: string }) {
  if (type === "bias") return <Scale className={className} />;
  if (type === "misinformation") return <TriangleAlert className={className} />;
  if (type === "disinformation") return <ShieldAlert className={className} />;
  return <Activity className={className} />;
}

export function TypeBadge({ type }: { type: FindingType }) {
  const m = TYPE_META[type];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ background: m.soft, color: m.color }}
    >
      <TypeIcon type={type} className="size-3" />
      {m.label}
    </span>
  );
}
