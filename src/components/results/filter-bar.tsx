"use client";

import { Search, X } from "lucide-react";
import clsx from "clsx";
import { SEVERITIES, type Filters } from "@/lib/results-derive";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx(
            "rounded px-2.5 py-1 text-[12.5px] capitalize transition-colors",
            value === o.value ? "bg-elevated text-fg shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
        <input
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search findings, quotes, documents"
          className="w-full rounded-md border border-line-strong bg-bg py-2 pl-9 pr-8 text-[13px] outline-none transition placeholder:text-faint focus:border-accent"
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => set("query", "")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>

      <Segmented
        label="Status"
        value={filters.status}
        onChange={(v) => set("status", v)}
        options={[
          { value: "open", label: "Open" },
          { value: "resolved", label: "Resolved" },
          { value: "all", label: "All" },
        ]}
      />
      <Segmented
        label="Severity"
        value={filters.severity}
        onChange={(v) => set("severity", v)}
        options={[{ value: "all", label: "Any" }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]}
      />
      <label className="inline-flex items-center gap-2 text-[12.5px] text-muted">
        Sort
        <select
          value={filters.sort}
          onChange={(e) => set("sort", e.target.value as Filters["sort"])}
          className="rounded-md border border-line-strong bg-bg px-2.5 py-1.5 text-[12.5px] text-fg outline-none transition focus:border-accent"
        >
          <option value="severity">Severity</option>
          <option value="confidence">Confidence</option>
          <option value="documents">Documents affected</option>
        </select>
      </label>
    </div>
  );
}
