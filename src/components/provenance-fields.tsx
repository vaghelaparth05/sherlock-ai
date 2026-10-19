"use client";

import { useApi } from "@/components/live-provider";

/** Provenance captured at upload: who created the record, how it reached us, its status and function. */

export interface Provenance {
  unit: string;
  function: string;
  custody: string;
  record_status: string;
}

export const EMPTY_PROVENANCE: Provenance = { unit: "unknown", function: "", custody: "team_site", record_status: "final" };

const CUSTODY_LABEL: Record<string, string> = {
  records_system: "Records system",
  regional_records_system: "Regional records system",
  team_site: "Team site",
  email: "Email",
  personal_drive: "Personal drive",
  business_system: "Business system",
  external: "From outside the organisation",
};
const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function ProvenanceFields({ value, onChange }: { value: Provenance; onChange: (p: Provenance) => void }) {
  const { data } = useApi<{ units: string[]; functions: string[]; custody: string[]; statuses: string[] }>("/api/taxonomy");
  const field = "mt-1.5 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-[13px] text-fg outline-none transition focus:border-accent";
  const set = (k: keyof Provenance) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-[12px] text-muted">
        Who created it
        <select value={value.unit} onChange={set("unit")} className={field}>
          <option value="unknown">Unknown or external</option>
          {data?.units.map((u) => <option key={u}>{u}</option>)}
        </select>
      </label>
      <label className="text-[12px] text-muted">
        Business function
        <select value={value.function} onChange={set("function")} className={field} required>
          <option value="">Choose…</option>
          {data?.functions.map((f) => <option key={f} value={f}>{words(f)}</option>)}
        </select>
      </label>
      <label className="text-[12px] text-muted">
        How it reached you
        <select value={value.custody} onChange={set("custody")} className={field}>
          {data?.custody.map((c) => <option key={c} value={c}>{CUSTODY_LABEL[c] ?? words(c)}</option>)}
          <option value="external,team_site">Forwarded from outside, saved to a team site</option>
          <option value="external,email">Forwarded from outside by email</option>
        </select>
      </label>
      <label className="text-[12px] text-muted">
        Record status
        <select value={value.record_status} onChange={set("record_status")} className={field}>
          {data?.statuses.map((s) => <option key={s} value={s}>{words(s)}</option>)}
        </select>
      </label>
    </div>
  );
}
