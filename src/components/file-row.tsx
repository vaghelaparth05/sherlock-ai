"use client";

import { motion } from "motion/react";
import {
  AlertCircle,
  Check,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Table,
  X,
} from "lucide-react";
import { formatBytes, shortHash, type ImportItem } from "@/lib/format";

function IconFor({ ext }: { ext: string }) {
  const cls = "size-4 text-muted";
  if (ext === "table") return <Table className={cls} />;
  if (ext === "csv" || ext === "xls" || ext === "xlsx") return <FileSpreadsheet className={cls} />;
  if (ext === "json") return <FileJson className={cls} />;
  if (ext === "html" || ext === "htm") return <FileCode className={cls} />;
  return <FileText className={cls} />;
}

export function FileRow({
  item,
  onRemove,
  onRetry,
}: {
  item: ImportItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const meta = formatBytes(item.size);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group relative flex items-center gap-3 overflow-hidden border-b border-line px-4 py-3 last:border-b-0"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-elevated">
        <IconFor ext={item.ext} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{item.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-faint">
          <span>{meta}</span>
          {item.status === "ready" && item.hash && (
            <span className="font-mono text-[11px] text-faint" title={`SHA-256 ${item.hash}`}>
              {shortHash(item.hash)}
            </span>
          )}
          {item.status === "error" && <span className="text-danger">{item.error}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {item.status === "uploading" && (
          <div className="h-1 w-24 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(8, item.progress * 100)}%` }}
              transition={{ ease: "easeOut", duration: 0.25 }}
            />
          </div>
        )}
        {item.status === "ready" && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="grid size-5 place-items-center rounded-full bg-success-soft"
            aria-label="Ready"
          >
            <Check className="size-3 text-success" strokeWidth={3} />
          </motion.span>
        )}
        {item.status === "error" && (
          <>
            <AlertCircle className="size-4 text-danger" aria-label="Failed" />
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="rounded p-1 text-muted transition hover:bg-hover hover:text-fg"
              aria-label={`Retry ${item.name}`}
            >
              <RotateCcw className="size-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded p-1 text-faint opacity-0 transition hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Remove ${item.name}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}
