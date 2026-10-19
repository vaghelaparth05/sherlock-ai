"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useDashboard } from "@/components/live-provider";

const W = 640;
const H = 220;
const PAD = { l: 30, r: 12, t: 14, b: 26 };

export function TrendChart() {
  const TREND = useDashboard().trend;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = TREND.labels.length;
  const max = Math.max(5, Math.ceil(Math.max(...TREND.found, ...TREND.resolved) / 5) * 5);
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const line = (data: number[]) => data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = (data: number[]) => `${line(data)} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const ticks = [0, max / 3, (2 * max) / 3, max].map(Math.round);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded bg-fg-faint" style={{ background: "var(--fg-muted)" }} />
          Found
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded" style={{ background: "var(--success)" }} />
          Resolved
        </span>
      </div>

      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Findings found and resolved over the last eight weeks"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--fg-faint)">
                {t}
              </text>
            </g>
          ))}
          {TREND.labels.map((l, i) => (
            <text key={l} x={x(i)} y={H - 6} textAnchor={i === n - 1 ? "end" : "middle"} fontSize="10.5" fill={hover === i ? "var(--fg)" : "var(--fg-faint)"}>
              {l}
            </text>
          ))}

          <motion.path
            d={area(TREND.resolved)}
            fill="var(--success)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
          />
          <motion.path
            d={line(TREND.found)}
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.2, ease: "easeOut" }}
          />
          <motion.path
            d={line(TREND.resolved)}
            fill="none"
            stroke="var(--success)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.35, ease: "easeOut" }}
          />

          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--border-strong)" />
              <circle cx={x(hover)} cy={y(TREND.found[hover])} r={4} fill="var(--bg)" stroke="var(--fg-muted)" strokeWidth={2} />
              <circle cx={x(hover)} cy={y(TREND.resolved[hover])} r={4} fill="var(--bg)" stroke="var(--success)" strokeWidth={2} />
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-line-strong bg-elevated px-2.5 py-1.5 text-[11.5px] shadow-lg"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > n / 2 ? "-108%" : "8%"})`,
            }}
          >
            <p className="mb-1 text-faint">{TREND.labels[hover]}</p>
            <p className="text-muted">
              Found <span className="font-medium text-fg tabular-nums">{TREND.found[hover]}</span>
            </p>
            <p className="text-muted">
              Resolved <span className="font-medium tabular-nums" style={{ color: "var(--success)" }}>{TREND.resolved[hover]}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
