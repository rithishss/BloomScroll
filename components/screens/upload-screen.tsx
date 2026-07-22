"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataProvider } from "@/lib/data/provider-context";
import type { DocumentSummary } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

const MAX_MB = 20;

/**
 * Drag-and-drop + keyboard-accessible PDF upload. After the document record
 * is created, processing continues server-side (or as a labeled simulation
 * in demo mode) and the user is free to navigate away — the library shows
 * live progress.
 */
export function UploadScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<DocumentSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      setUploaded(null);
      if (!/\.pdf$/i.test(file.name)) {
        setErrorMessage("Only PDF files are accepted.");
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setErrorMessage(`That file is ${formatBytes(file.size)} — the limit is ${MAX_MB} MB.`);
        return;
      }
      setUploading(true);
      try {
        const doc = await provider.uploadDocument(file);
        setUploaded(doc);
        toast.success("Upload received — processing has started");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "The upload failed. Please try again.",
        );
      } finally {
        setUploading(false);
      }
    },
    [provider],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl font-semibold">Upload course material</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        PDF only, up to {MAX_MB} MB. Text-based PDFs work best — scanned image PDFs have no
        extractable text and can&apos;t be processed (OCR isn&apos;t supported yet).
      </p>

      {provider.mode === "demo" && (
        <p className="mt-3 rounded-xl border border-pollen/40 bg-pollen/10 px-4 py-3 text-sm leading-relaxed">
          In the demo workspace, uploads are <strong>simulated in your browser</strong>: your file
          is validated locally, never leaves your machine, and no AI is called. You&apos;ll see the
          same processing timeline the real pipeline reports.
        </p>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF: press Enter to open the file picker, or drop a file here"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "mt-6 flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-leaf bg-leaf/10"
            : "border-input bg-card hover:border-leaf/60 hover:bg-surface/60",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-leaf" aria-hidden />
            <p className="text-sm font-medium">Uploading…</p>
          </>
        ) : (
          <>
            <FileUp className="size-8 text-leaf" aria-hidden />
            <div>
              <p className="text-sm font-medium">Drop a PDF here, or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Lecture notes, textbook chapters, study guides
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      {uploaded && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2 text-leaf">
            <CheckCircle2 className="size-5" aria-hidden />
            <p className="text-sm font-medium">“{uploaded.title}” is processing</p>
          </div>
          <ol className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            {[
              "Uploading",
              "Extracting text",
              "Organizing concepts",
              "Generating cards",
              "Ready",
            ].map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.65rem] font-semibold",
                    i === 0 ? "bg-leaf text-white" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            You can keep browsing — progress is visible in your library and the document will join
            the feed filters when it&apos;s ready.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild size="sm">
              <Link href={`${basePath}/library`}>Watch progress in library</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${basePath}/feed`}>Back to feed</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
