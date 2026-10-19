"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { CloudUpload, FolderOpen } from "lucide-react";
import clsx from "clsx";
import { ACCEPT_ATTR } from "@/lib/format";

export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    if (list && list.length) onFiles(Array.from(list));
  };

  return (
    <motion.div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      animate={{ scale: dragging ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={clsx(
        "relative overflow-hidden rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
        dragging ? "sweep border-accent bg-accent-soft" : "border-line-strong bg-subtle hover:border-muted",
      )}
    >
      <motion.div
        animate={{ y: dragging ? -4 : 0, scale: dragging ? 1.08 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-line-strong bg-elevated"
      >
        <CloudUpload className={clsx("size-5 transition-colors", dragging ? "text-accent" : "text-muted")} />
      </motion.div>

      <p className="text-[15px] font-medium">{dragging ? "Release to add these documents" : "Drag documents here"}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
        PDF, Word, HTML, email, text or Markdown. Scans and photos are kept for OCR. Up to 25 MB each.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-md bg-fg px-3.5 py-2 text-[13px] font-medium text-bg transition hover:bg-white active:scale-[0.97]"
        >
          Choose files
        </button>
        <button
          type="button"
          onClick={() => folderInput.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3.5 py-2 text-[13px] text-fg transition hover:bg-hover active:scale-[0.97]"
        >
          <FolderOpen className="size-3.5" />
          Choose a folder
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
