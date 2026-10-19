"use client";

import Link from "next/link";
import { motion } from "motion/react";

export function Panel({
  title,
  description,
  action,
  delay = 0,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-xl border border-line bg-subtle p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] text-faint">{description}</p>}
        </div>
        {action && (
          <Link href={action.href} className="shrink-0 text-[12.5px] text-muted underline-offset-4 transition hover:text-fg hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </motion.section>
  );
}
