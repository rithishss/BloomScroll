"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileWarning, RefreshCcw, Search, Trash2, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/lib/data/provider-context";
import { DOCUMENT_STATUS_LABELS, type DocumentSummary } from "@/lib/types";
import { formatBytes, formatRelativeTime, hash01 } from "@/lib/utils";

const PROCESSING_STATUSES = new Set([
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "generating",
]);

/** Stable botanical accent per document, derived from its id. */
export function documentAccent(doc: Pick<DocumentSummary, "id">): string {
  const hues = [158, 22, 42, 96, 350, 200];
  const hue = hues[Math.floor(hash01(doc.id) * hues.length)] ?? 158;
  return `hsl(${hue} 32% 46%)`;
}

export function LibraryScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const docs = await provider.listDocuments();
      setDocuments(docs);
      setError(null);
      return docs;
    } catch {
      setError("Your library could not be loaded.");
      return [];
    }
  }, [provider]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // Poll while any document is processing so progress is visible live.
  useEffect(() => {
    const anyProcessing = (documents ?? []).some((d) => PROCESSING_STATUSES.has(d.status));
    if (anyProcessing && !pollRef.current) {
      pollRef.current = setInterval(refresh, 1500);
    }
    if (!anyProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, refresh]);

  const filtered = useMemo(() => {
    if (!documents) return null;
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.topics.some((t) => t.toLowerCase().includes(q)) ||
        d.originalFilename.toLowerCase().includes(q),
    );
  }, [documents, query]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await provider.deleteDocument(deleteTarget.id);
      toast.success(`Deleted “${deleteTarget.title}”`);
      setDeleteTarget(null);
      await refresh();
    } catch {
      toast.error("The document could not be deleted. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleRetry = async (doc: DocumentSummary) => {
    try {
      await provider.retryProcessing(doc.id);
      toast.success("Processing restarted");
      await refresh();
    } catch {
      toast.error("Retry failed. Please try again.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every document you&apos;ve planted, and how it&apos;s growing.
          </p>
        </div>
        <Button asChild>
          <Link href={`${basePath}/upload`}>
            <UploadCloud aria-hidden /> Upload PDF
          </Link>
        </Button>
      </header>

      <div className="relative mt-5 max-w-sm">
        <Search
          className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents or topics…"
          className="pl-10"
          aria-label="Search documents"
        />
      </div>

      {error ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={() => refresh()}>
            Try again
          </Button>
        </div>
      ) : filtered === null ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground">
            {query ? "No documents match that search." : "Your library is empty so far."}
          </p>
          {!query && (
            <Button asChild className="mt-4">
              <Link href={`${basePath}/upload`}>Upload your first PDF</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((doc) => (
            <li key={doc.id}>
              <DocumentCard
                doc={doc}
                basePath={basePath}
                onDelete={() => setDeleteTarget(doc)}
                onRetry={() => handleRetry(doc)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.title}”?</DialogTitle>
            <DialogDescription>
              This removes the document, its stored source text, and all{" "}
              {deleteTarget?.cardCount ?? 0} generated reels. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentCard({
  doc,
  basePath,
  onDelete,
  onRetry,
}: {
  doc: DocumentSummary;
  basePath: string;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const accent = documentAccent(doc);
  const processing = PROCESSING_STATUSES.has(doc.status);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-card">
      <div className="h-2 w-full" style={{ background: accent }} aria-hidden />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`${basePath}/library/${doc.id}`}
            className="font-display text-lg font-semibold leading-snug hover:underline"
          >
            {doc.title}
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {doc.status === "failed" && (
              <Button variant="ghost" size="iconSm" aria-label="Retry processing" onClick={onRetry}>
                <RefreshCcw aria-hidden />
              </Button>
            )}
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={`Delete ${doc.title}`}
              onClick={onDelete}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {doc.pageCount != null ? `${doc.pageCount} pages · ` : ""}
          {formatBytes(doc.fileSizeBytes)} · added {formatRelativeTime(doc.createdAt)}
        </p>

        {processing ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-leaf">{DOCUMENT_STATUS_LABELS[doc.status]}…</span>
              <span className="text-muted-foreground">{doc.processingProgress}%</span>
            </div>
            <Progress value={doc.processingProgress} className="mt-1.5" />
          </div>
        ) : doc.status === "failed" ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive">
            <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{doc.errorMessage ?? "Processing failed."}</span>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {doc.topics.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span>
            {doc.cardCount} reel{doc.cardCount === 1 ? "" : "s"}
          </span>
          <span>Last studied {formatRelativeTime(doc.lastStudiedAt)}</span>
        </div>
      </div>
    </div>
  );
}
