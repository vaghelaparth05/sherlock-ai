import type { FindingStatus, Severity } from "@/lib/types";

const STATUS: Record<FindingStatus, { label: string; color: string; bg: string }> = {
  open: { label: "Needs review", color: "var(--misinfo)", bg: "var(--misinfo-soft)" },
  confirmed: { label: "Confirmed", color: "var(--success)", bg: "var(--success-soft)" },
  dismissed: { label: "Dismissed", color: "var(--fg-muted)", bg: "var(--bg-elevated)" },
};

export function StatusPill({ status }: { status: FindingStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ background: s.bg, color: s.color }}>
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

const SEV: Record<Severity, { label: string; color: string }> = {
  high: { label: "High", color: "var(--danger)" },
  medium: { label: "Medium", color: "var(--warning)" },
  low: { label: "Low", color: "var(--fg-faint)" },
};

export function SeverityDot({ severity, withLabel = true }: { severity: Severity; withLabel?: boolean }) {
  const s = SEV[severity];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
      <span className="size-2 rounded-full" style={{ background: s.color }} />
      {withLabel && s.label}
    </span>
  );
}

export { SEV as SEVERITY_META };

const CLAIM: Record<string, { label: string; color: string; bg: string }> = {
  corroborated: { label: "Corroborated", color: "var(--success)", bg: "var(--success-soft)" },
  current: { label: "Current", color: "var(--success)", bg: "var(--success-soft)" },
  single: { label: "Single source", color: "var(--fg-muted)", bg: "var(--bg-elevated)" },
  review: { label: "Under review", color: "var(--misinfo)", bg: "var(--misinfo-soft)" },
  superseded: { label: "Superseded", color: "var(--disinfo)", bg: "var(--disinfo-soft)" },
};

export function ClaimStatusPill({ status }: { status: string }) {
  const s = CLAIM[status] ?? CLAIM.single;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ background: s.bg, color: s.color }}>
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
