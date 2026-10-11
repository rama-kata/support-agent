"use client";

import { Check, ChevronDown, CircleAlert, Lock, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useState } from "react";
import type { CardOrder, ConfirmAction, Decision, ToolStep } from "@/lib/api";
import { Bottles } from "@/components/ui/brand";
import { OrderCard } from "./order-card";
import { RichText } from "./rich-text";

export type AgentTurn = {
  role: "agent";
  key: string;
  turnId?: string;
  text?: string;
  steps: ToolStep[];
  cards: CardOrder[];
  confirm?: { actions: ConfirmAction[]; decided?: Decision };
  verified?: string[];
  intent?: string | null;
  latencyMs?: number;
  redacted?: string[];
  pending: boolean;
  stopped?: boolean;
  error?: string;
  rating?: 1 | -1;
};

const INTENT_LABELS: Record<string, string> = {
  product_inquiry: "a product question",
  contact_human_agent: "a request for a person",
};
const intentLabel = (i: string) => INTENT_LABELS[i] ?? i.replaceAll("_", " ");

/** Margin notes: the evidence for a reply, set beside it like notes on a wine list.
 * Desktop: its own column, right-aligned against a rule. Narrower: inline above the reply. */
function Notes({ turn }: { turn: AgentTurn }) {
  const [open, setOpen] = useState(true);
  if (!turn.intent && turn.steps.length === 0) return <div className="hidden xl:block" />;
  return (
    <aside
      aria-label="How I know"
      className="mb-3 border-l-2 border-ink pl-3 xl:mb-0 xl:border-l-0 xl:border-r xl:border-line xl:pl-0 xl:pr-5 xl:text-right"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={turn.pending}
        className="inline-flex min-h-7 items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted disabled:cursor-default xl:flex-row-reverse"
      >
        How I know
        {!turn.pending && <ChevronDown className={clsx("size-3 transition", open && "rotate-180")} />}
      </button>
      {(open || turn.pending) && (
        <ol className="mt-1.5 space-y-2">
          {turn.intent && (
            <li className="text-[13px] leading-snug text-muted">
              Understood as <span className="text-ink">{intentLabel(turn.intent)}</span>
            </li>
          )}
          {turn.steps.map((s) => (
            <li key={s.id} className="grid gap-0.5 text-[13px] leading-snug xl:justify-items-end">
              <span className="flex items-start gap-1.5 text-ink-soft xl:flex-row-reverse">
                {s.status === "running" && (
                  <span className="mt-0.5 size-3 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" />
                )}
                {s.status === "ok" && <Check className="mt-0.5 size-3.5 shrink-0" />}
                {s.status === "waiting" && <Lock className="mt-0.5 size-3.5 shrink-0" />}
                {s.status === "error" && <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
                {/* Non-breaking hyphen keeps order IDs on one line in the narrow margin. */}
                <span>{s.label.replace(/\b(ORD|INV)-(\d+)/g, "$1\u2011$2")}</span>
              </span>
              {s.detail && (
                <span
                  className={clsx(
                    "w-fit font-mono text-xs",
                    s.status === "error" || s.status === "waiting"
                      ? "rounded border border-dashed border-ink px-1.5 text-ink"
                      : "text-muted",
                  )}
                >
                  {s.detail}
                </span>
              )}
            </li>
          ))}
          {!turn.pending && turn.latencyMs !== undefined && (
            <li className="font-mono text-xs text-muted">{(turn.latencyMs / 1000).toFixed(1)}s</li>
          )}
        </ol>
      )}
    </aside>
  );
}

function ConfirmCard({
  action,
  decided,
  onDecide,
}: {
  action: ConfirmAction;
  decided?: Decision;
  onDecide: (d: Decision) => void;
}) {
  return (
    <div role="group" aria-label="Confirm before I act" className="grid max-w-lg gap-3 rounded-2xl border-2 border-ink bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Before I do this</p>
      <h3 className="font-display text-xl font-extrabold leading-tight text-ink">{action.title}</h3>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        {action.lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {action.warning && (
        <p className="flex items-center gap-2 border-t border-dashed border-line-strong pt-3 text-sm text-ink">
          <Lock className="size-3.5 shrink-0" /> {action.warning}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => onDecide("confirm")}
          disabled={!!decided}
          aria-pressed={decided === "confirm"}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink bg-ink px-5 text-[15px] font-semibold text-bg transition hover:bg-ink-soft disabled:cursor-default disabled:opacity-45 aria-pressed:opacity-100"
        >
          {decided === "confirm" && <Check className="size-4" />}
          {action.confirm_label}
        </button>
        <button
          type="button"
          onClick={() => onDecide("decline")}
          disabled={!!decided}
          aria-pressed={decided === "decline"}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-5 text-[15px] font-semibold text-ink transition hover:border-ink disabled:cursor-default disabled:opacity-45 aria-pressed:opacity-100"
        >
          {decided === "decline" && <Check className="size-4" />}
          {action.decline_label}
        </button>
      </div>
    </div>
  );
}

function Verified({ checks }: { checks: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-ink transition hover:border-ink pointer-coarse:min-h-11"
      >
        <Check className="size-3.5" /> Checked against your account
      </button>
      {open && (
        <ul className="max-w-md space-y-1 rounded-xl border border-line px-3.5 py-2.5 text-[13px] text-muted">
          <li className="font-medium text-ink">Confirmed in our records before this reply was sent</li>
          {checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentMessage({
  turn,
  onRate,
  onDecide,
}: {
  turn: AgentTurn;
  onRate: (rating: 1 | -1, comment?: string) => Promise<void>;
  onDecide: (d: Decision) => void;
}) {
  const [askComment, setAskComment] = useState(false);
  const [comment, setComment] = useState("");
  const [thanks, setThanks] = useState(false);
  const running = turn.steps.find((s) => s.status === "running");
  const awaiting = turn.confirm && !turn.confirm.decided;

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
    <div className="xl:grid xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-x-10">
      <Notes turn={turn} />

      <div className="grid min-w-0 gap-3">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted">
          <Bottles className="h-3.5 w-auto text-ink" /> cellar · AI assistant
        </p>

        {turn.redacted && turn.redacted.length > 0 && (
          <p className="w-fit rounded-lg border border-dashed border-ink px-2.5 py-1 text-xs text-ink">
            We masked the {turn.redacted.join(", ")} number in your message before the agent saw it.
          </p>
        )}

        {turn.pending && !turn.text && !awaiting && (
          <p className="flex items-center gap-2.5 text-[15px] text-muted" aria-live="polite">
            <span className="flex h-5 items-center gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot size-1.5 rounded-full bg-ink" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            {running ? `${running.label}…` : "Reading your message…"}
          </p>
        )}

        {turn.cards.map((o) => (
          <motion.div key={`${o.id}-${o.status}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            <OrderCard order={o} />
          </motion.div>
        ))}

        {turn.confirm?.actions.map((a) => (
          <ConfirmCard key={a.call_id} action={a} decided={turn.confirm?.decided} onDecide={onDecide} />
        ))}

        {turn.error && (
          <p className="flex items-start gap-2 rounded-xl border border-dashed border-ink px-4 py-3 text-sm text-ink">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {turn.error}
          </p>
        )}

        {turn.text && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-base leading-relaxed text-ink" aria-live="polite">
            <RichText text={turn.text} />
          </motion.div>
        )}

        {turn.stopped && (
          <p className="flex items-center gap-2 text-[15px] text-muted">
            <Square className="size-3.5 fill-current" /> Stopped. Nothing irreversible happens without your confirmation.
          </p>
        )}

        {turn.verified && turn.verified.length > 0 && <Verified checks={turn.verified} />}

        {turn.turnId && !turn.pending && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => rate(1)}
              aria-label="Helpful"
              aria-pressed={turn.rating === 1}
              className={clsx(
                "grid size-8 place-items-center rounded-md transition pointer-coarse:size-11",
                turn.rating === 1 ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink",
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
                turn.rating === -1 ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <ThumbsDown className="size-3.5" />
            </button>
            <AnimatePresence>
              {thanks && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ml-1 text-xs text-muted">
                  Thanks, that helps it improve.
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {askComment && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="rounded-xl border border-line bg-surface p-3">
                <label htmlFor={`c-${turn.key}`} className="text-xs font-medium text-ink-soft">
                  What should it have said or done? (optional)
                </label>
                <textarea
                  id={`c-${turn.key}`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="mt-1.5 w-full resize-none rounded-lg border border-line-strong bg-bg px-3 py-2 text-base text-ink outline-none placeholder:text-muted focus:border-ink sm:text-sm"
                  placeholder="e.g. It should have given me the tracking number"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setAskComment(false)} className="min-h-9 rounded-lg px-3 text-xs text-ink-soft hover:bg-surface-2">
                    Skip
                  </button>
                  <button onClick={sendComment} className="min-h-9 rounded-lg bg-ink px-3 text-xs font-medium text-bg hover:bg-ink-soft">
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
