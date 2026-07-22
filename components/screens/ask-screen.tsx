"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { SourceDrawer } from "@/components/feed/source-drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/lib/data/provider-context";
import type { Citation, DocumentSummary, StudyCard } from "@/lib/types";
import { cn, formatPageRange } from "@/lib/utils";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  insufficient?: boolean;
}

/**
 * Ask Bloom: retrieval-grounded Q&A across selected documents. Answers carry
 * page-level citations rendered as interactive chips; clicking a chip opens
 * the underlying stored passage.
 */
export function AskScreen() {
  const provider = useDataProvider();
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [citationCard, setCitationCard] = useState<StudyCard | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    provider
      .listDocuments()
      .then((docs) => {
        if (cancelled) return;
        const ready = docs.filter((d) => d.status === "ready" && d.chunkCount > 0);
        setDocuments(ready);
        const preselect = searchParams.get("doc");
        if (preselect && ready.some((d) => d.id === preselect)) {
          setSelectedDocs(new Set([preselect]));
        } else {
          setSelectedDocs(new Set(ready.map((d) => d.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const q = question.trim();
    if (q.length < 3 || asking) return;
    if (selectedDocs.size === 0) {
      toast.error("Select at least one document to ask against.");
      return;
    }
    setAsking(true);
    setQuestion("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: q, citations: [] },
    ]);
    try {
      const result = await provider.ask({
        question: q,
        documentIds: [...selectedDocs],
        threadId,
      });
      setThreadId(result.threadId);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-a`,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          insufficient: result.insufficientEvidence,
        },
      ]);
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(q);
      toast.error(err instanceof Error ? err.message : "Your question could not be answered.");
    } finally {
      setAsking(false);
    }
  };

  const openCitation = (citation: Citation) => {
    // Reuse the source drawer by shaping the citation as a minimal card.
    setCitationCard({
      id: `citation-${citation.chunkId}`,
      documentId: citation.documentId,
      documentTitle: citation.documentTitle,
      cardType: "key_point",
      topic: "",
      title: "",
      explanation: "",
      question: null,
      answer: null,
      takeaway: null,
      difficulty: "core",
      sourceChunkIds: [citation.chunkId],
      sourceExcerpt: citation.excerpt,
      pageStart: citation.pageStart,
      pageEnd: citation.pageEnd,
      createdAt: new Date().toISOString(),
    });
    setCitationOpen(true);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-3xl flex-col px-4 py-6 sm:py-8 md:min-h-[calc(100dvh-2rem)]">
      <header>
        <h1 className="font-display text-2xl font-semibold">Ask Bloom</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Answers come strictly from your uploaded material, with page-level citations.
        </p>
      </header>

      {documents === null ? (
        <Skeleton className="mt-4 h-9 w-full max-w-md" />
      ) : documents.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted-foreground">
          No processed documents yet — upload a PDF first, then ask questions about it here.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Documents to search">
          {documents.map((doc) => {
            const active = selectedDocs.has(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleDoc(doc.id)}
                aria-pressed={active}
                className={cn(
                  "cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-surface",
                )}
              >
                {doc.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex-1 space-y-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <BloomMark className="size-12 text-leaf" progress={0.6} />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Try “Why does SJF minimize average waiting time?” or “What is the Nyquist rate?” —
              Bloom will answer from your notes and cite the exact pages.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card shadow-soft",
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.insufficient && (
                <p className="mt-2 rounded-lg bg-pollen/15 px-3 py-2 text-xs text-gold-foreground dark:text-pollen">
                  Bloom answers only from your material — it won&apos;t guess beyond it.
                </p>
              )}
              {message.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Citations">
                  {message.citations.map((citation, i) => (
                    <button
                      key={citation.chunkId + i}
                      type="button"
                      onClick={() => openCitation(citation)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-leaf/40 bg-leaf/10 px-2.5 py-1 text-xs font-medium text-leaf hover:bg-leaf/20"
                    >
                      [{i + 1}] {citation.documentTitle.split("—")[0].trim()} ·{" "}
                      {formatPageRange(citation.pageStart, citation.pageEnd)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {asking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching your notes…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-20 mt-6 flex items-end gap-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything about your selected documents…"
          aria-label="Your question"
          className="min-h-12 flex-1 resize-none bg-card shadow-soft"
          rows={1}
          disabled={documents !== null && documents.length === 0}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={asking || question.trim().length < 3}
        >
          <Send aria-hidden />
        </Button>
      </form>

      <SourceDrawer card={citationCard} open={citationOpen} onOpenChange={setCitationOpen} />
    </div>
  );
}
