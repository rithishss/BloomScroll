"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Layers,
  MessageCircleQuestion,
  RefreshCcw,
  Trash2,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceDrawer } from "@/components/feed/source-drawer";
import { documentAccent } from "@/components/screens/library-screen";
import { useDataProvider } from "@/lib/data/provider-context";
import {
  CARD_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentDetail,
  type StudyCard,
} from "@/lib/types";
import { formatBytes, formatPageRange, formatRelativeTime } from "@/lib/utils";

const PROCESSING_STATUSES = new Set([
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "generating",
]);

export function DocumentScreen({ basePath, documentId }: { basePath: string; documentId: string }) {
  const provider = useDataProvider();
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourceCard, setSourceCard] = useState<StudyCard | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const detail = await provider.getDocument(documentId);
      setDoc(detail);
    } catch {
      setNotFound(true);
    }
  }, [provider, documentId]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // Live progress while processing.
  useEffect(() => {
    if (!doc || !PROCESSING_STATUSES.has(doc.status)) return;
    const interval = setInterval(refresh, 1500);
    return () => clearInterval(interval);
  }, [doc, refresh]);

  const handleOpenPdf = async () => {
    try {
      const { url, note } = await provider.getDocumentUrl(documentId);
      if (url) {
        window.open(url, "_blank", "noopener");
      } else {
        toast.info(note ?? "A link to this PDF cannot be produced right now.");
      }
    } catch {
      toast.error("The PDF link could not be created.");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await provider.deleteDocument(documentId);
      toast.success("Document deleted");
      router.push(`${basePath}/library`);
    } catch {
      toast.error("The document could not be deleted.");
      setDeleting(false);
    }
  };

  const handleReprocess = async () => {
    try {
      await provider.retryProcessing(documentId);
      toast.success("Processing restarted");
      refresh();
    } catch {
      toast.error("Reprocessing failed to start.");
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">That document doesn&apos;t exist (anymore).</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`${basePath}/library`}>
            <ArrowLeft aria-hidden /> Back to library
          </Link>
        </Button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-32 w-full" />
        <Skeleton className="mt-4 h-56 w-full" />
      </div>
    );
  }

  const processing = PROCESSING_STATUSES.has(doc.status);
  const isDemoUpload = provider.mode === "demo" && doc.status === "ready" && doc.cardCount === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <Link
        href={`${basePath}/library`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Library
      </Link>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="h-2" style={{ background: documentAccent(doc) }} aria-hidden />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold">{doc.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {doc.originalFilename} · {formatBytes(doc.fileSizeBytes)}
                {doc.pageCount != null ? ` · ${doc.pageCount} pages` : ""} ·{" "}
                {doc.chunkCount > 0 ? `${doc.chunkCount} passages · ` : ""}
                added {formatRelativeTime(doc.createdAt)}
              </p>
            </div>
            <Badge
              variant={
                doc.status === "ready" ? "leaf" : doc.status === "failed" ? "blossom" : "pollen"
              }
            >
              {DOCUMENT_STATUS_LABELS[doc.status]}
            </Badge>
          </div>

          {processing && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-leaf">{DOCUMENT_STATUS_LABELS[doc.status]}…</span>
                <span className="text-muted-foreground">{doc.processingProgress}%</span>
              </div>
              <Progress value={doc.processingProgress} className="mt-1.5" />
            </div>
          )}

          {doc.status === "failed" && (
            <div className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {doc.errorMessage ?? "Processing failed."}
            </div>
          )}

          {isDemoUpload && (
            <div className="mt-4 rounded-xl border border-pollen/40 bg-pollen/10 px-4 py-3 text-sm leading-relaxed">
              This demo upload was simulated locally — the file never left your browser and no AI
              was called, so no cards were generated. Connect Supabase and OpenAI (see the README)
              to process real PDFs end-to-end.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {doc.cardCount > 0 && (
              <>
                <Button asChild size="sm">
                  <Link href={`${basePath}/feed`}>
                    <Layers aria-hidden /> Study this document
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${basePath}/ask?doc=${doc.id}`}>
                    <MessageCircleQuestion aria-hidden /> Ask this document
                  </Link>
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleOpenPdf}>
              <ExternalLink aria-hidden /> View PDF
            </Button>
            {(doc.status === "failed" || doc.status === "ready") && provider.mode === "real" && (
              <Button variant="outline" size="sm" onClick={handleReprocess}>
                <RefreshCcw aria-hidden /> Reprocess
              </Button>
            )}
            {doc.status === "failed" && provider.mode === "demo" && (
              <Button variant="outline" size="sm" onClick={handleReprocess}>
                <RefreshCcw aria-hidden /> Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        </div>
      </div>

      {doc.topicBreakdown.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold">Topics</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {doc.topicBreakdown.map((t) => (
              <li
                key={t.topic}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{t.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.cardCount} card{t.cardCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={t.masteryAvg * 100} className="w-20" aria-hidden />
                  <span className="w-9 text-right text-xs text-muted-foreground">
                    {Math.round(t.masteryAvg * 100)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.previewCards.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold">Card preview</h2>
          <ul className="mt-3 space-y-2">
            {doc.previewCards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSourceCard(card);
                    setSourceOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{card.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CARD_TYPE_LABELS[card.cardType]} · {card.topic} ·{" "}
                      {formatPageRange(card.pageStart, card.pageEnd)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-leaf">View source</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{doc.title}”?</DialogTitle>
            <DialogDescription>
              This removes the document, its stored source text, and all {doc.cardCount} generated
              cards. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SourceDrawer card={sourceCard} open={sourceOpen} onOpenChange={setSourceOpen} />
    </div>
  );
}
