"use client";

import { Check, ChevronDown, CircleAlert, LoaderCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useState } from "react";
import type { ToolStep } from "@/lib/api";
import { RichText } from "./rich-text";

export type AgentTurn = {
  role: "agent";
  key: string;
  turnId?: string;
  text?: string;
  steps: ToolStep[];
  intent?: string | null;
  latencyMs?: number;
  redacted?: string[];
  pending: boolean;
  error?: string;
  rating?: 1 | -1;
};

const INTENT_LABELS: Record<string, string> = {
  product_inquiry: "product question",
  contact_human_agent: "wants a person",
};

function intentLabel(intent: string) {
  return INTENT_LABELS[intent] ?? intent.replaceAll("_", " ");
}

export function AgentMessage({
  turn,
  onRate,
}: {
  turn: AgentTurn;
  onRate: (rating: 1 | -1, comment?: string) => Promise<void>;
}) {
  // Steps stay visible after the reply: showing the work is the point of the demo.
  const [stepsOpen, setStepsOpen] = useState(true);
  const [askComment, setAskComment] = useState(false);
  const [comment, setComment] = useState("");
  const [thanks, setThanks] = useState(false);
  const showSteps = turn.pending || stepsOpen;

  async function rate(r: 1 | -1) {
    if (r === -1 && !askComment && turn.rating !== -1) {
      setAskComment(true);
      await onRate(-1);
      return;
    }
    setAskComment(false);
    await onRate(r);
    if (r === 1) flashThanks();
  }

  async function sendComment() {
    await onRate(-1, comment.trim() || undefined);
    setAskComment(false);
    flashThanks();
  }

  function flashThanks() {
    setThanks(true);
    setTimeout(() => setThanks(false), 2200);
  }

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-wine font-display text-sm font-semibold text-wine-ink">
        C
      </span>
      <div className="min-w-0 flex-1">
        {(turn.intent || turn.steps.length > 0 || turn.pending) && (
          <div className="mb-2">
            <button
              onClick={() => setStepsOpen((o) => !o)}
              disabled={turn.pending || turn.steps.length === 0}
              aria-expanded={turn.steps.length > 0 ? showSteps : undefined}
              aria-label={turn.steps.length > 0 ? (showSteps ? "Hide steps" : "Show steps") : undefined}
              className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-2xl border border-line bg-surface-2 px-2.5 py-1 text-left text-xs text-ink-soft transition hover:border-line-strong disabled:cursor-default"
            >
              {turn.pending ? (
                <LoaderCircle className="size-3.5 animate-spin text-wine" />
              ) : (
                <Check className="size-3.5 text-ok" />
              )}
              {turn.intent ? (
                <span className="whitespace-nowrap">
                  Understood as <span className="font-medium text-ink">{intentLabel(turn.intent)}</span>
                </span>
              ) : (
                <span>Reading your message</span>
              )}
              {!turn.pending && turn.steps.length > 0 && (
                <>
                  <span className="text-muted">·</span>
                  <span className="whitespace-nowrap">
                    {turn.steps.length} step{turn.steps.length > 1 ? "s" : ""}
                  </span>
                </>
              )}
              {!turn.pending && turn.latencyMs !== undefined && (
                <>
                  <span className="text-muted">·</span>
                  <span className="whitespace-nowrap">{(turn.latencyMs / 1000).toFixed(1)}s</span>
                </>
              )}
              {!turn.pending && turn.steps.length > 0 && (
                <ChevronDown className={clsx("size-3 transition", stepsOpen && "rotate-180")} />
              )}
            </button>

            <AnimatePresence initial={false}>
              {showSteps && turn.steps.length > 0 && (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-3 overflow-hidden border-l border-line pl-4"
                >
                  {turn.steps.map((s) => (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2 py-1.5 text-[13px]"
                    >
                      {s.status === "running" && <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-wine" />}
                      {s.status === "ok" && <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />}
                      {s.status === "error" && <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />}
                      {/* Label and result wrap as units, so a long label never truncates the result. */}
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="text-ink-soft">{s.label}</span>
                        {s.detail && (
                          <span className={clsx("whitespace-nowrap text-xs", s.status === "error" ? "text-warn" : "text-muted")}>
                            {s.detail}
                          </span>
                        )}
                      </span>
                    </motion.li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        )}

        {turn.redacted && turn.redacted.length > 0 && (
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-gold-soft px-2.5 py-1 text-xs text-gold-ink">
            We masked the {turn.redacted.join(", ")} number in your message before the agent saw it.
          </p>
        )}

        {turn.pending && !turn.text && (
          <div className="flex h-6 items-center gap-1" aria-label="The agent is working">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot size-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}

        {turn.error && (
          <p className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{turn.error}</p>
        )}

        {turn.text && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[15px] leading-relaxed text-ink"
          >
            <RichText text={turn.text} />
          </motion.div>
        )}

        {turn.turnId && !turn.pending && (
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => rate(1)}
              aria-label="Helpful"
              aria-pressed={turn.rating === 1}
              className={clsx(
                "grid size-8 place-items-center rounded-md transition pointer-coarse:size-11",
                turn.rating === 1 ? "bg-ok-soft text-ok" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              onClick={() => rate(-1)}
              aria-label="Not helpful"
              aria-pressed={turn.rating === -1}
              className={clsx(
                "grid size-8 place-items-center rounded-md transition pointer-coarse:size-11",
                turn.rating === -1 ? "bg-bad-soft text-bad" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <ThumbsDown className="size-3.5" />
            </button>
            <AnimatePresence>
              {thanks && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="ml-1 text-xs text-muted"
                >
                  Thanks, that helps it improve.
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {askComment && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-xl border border-line bg-surface p-3">
                <label htmlFor={`c-${turn.key}`} className="text-xs font-medium text-ink-soft">
                  What should it have said or done? (optional)
                </label>
                <textarea
                  id={`c-${turn.key}`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="mt-1.5 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-wine"
                  placeholder="e.g. It should have given me the tracking number"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setAskComment(false)} className="rounded-lg px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2">
                    Skip
                  </button>
                  <button onClick={sendComment} className="rounded-lg bg-wine px-3 py-1.5 text-xs font-medium text-wine-ink hover:bg-wine-strong">
                    Send feedback
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
