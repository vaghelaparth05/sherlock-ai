import clsx from "clsx";

/** Risk band and gate status, always as words as well as colour. */

const BAND: Record<string, string> = {
  Low: "border-success/30 bg-success-soft text-success",
  Medium: "border-warning/40 bg-warning-soft text-warning",
  High: "border-danger/40 bg-danger-soft text-danger",
  Extreme: "border-danger bg-danger text-white",
};

export function BandBadge({ band, risk }: { band: string | null; risk?: number | null }) {
  if (!band) return <span className="text-[12px] text-faint">Not scored</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium tabular-nums", BAND[band])}>
      {band}
      {risk != null && <span className="opacity-75">· {risk}</span>}
    </span>
  );
}

const GATE: Record<string, string> = {
  allowed: "text-success",
  blocked: "text-danger",
  quarantined: "text-warning",
};

export function GateBadge({ gate }: { gate: string }) {
  return <span className={clsx("text-[12px] font-medium capitalize", GATE[gate])}>{gate}</span>;
}
