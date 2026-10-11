"use client";

import { Check, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import type { CardOrder } from "@/lib/api";
import { OrderCard } from "@/components/chat/order-card";

// A real order from the demo store (Hana Deng, ORD-10072), shown before and after.
const ORDER: CardOrder = {
  id: "ORD-10072",
  status: "processing",
  placed: "2026-09-30T19:00",
  total: 59.99,
  tracking: null,
  items: [{ name: "CK MONDAVI CAB - 1.5L", quantity: 1, price: 59.99 }],
  refunds: [],
};
const CANCELLED: CardOrder = {
  ...ORDER,
  status: "cancelled",
  refunds: [{ amount: 59.99, status: "approved", created_at: "2026-10-11" }],
};

type Frame =
  | { kind: "me"; text: string }
  | { kind: "steps"; steps: [string, string, boolean?][] }
  | { kind: "card"; order: CardOrder }
  | { kind: "reply"; text: string }
  | { kind: "confirm" }
  | { kind: "checked" };

const FRAMES: Frame[] = [
  { kind: "me", text: "Will my order make Saturday?" },
  { kind: "steps", steps: [["Opened", "ORD-10072"], ["Checked stock", "0 on hand", true]] },
  { kind: "card", order: ORDER },
  { kind: "reply", text: "Not this one. The wine is back October 22. I can cancel it for a full refund, or keep it so it ships when it arrives." },
  { kind: "me", text: "Cancel it" },
  { kind: "confirm" },
  { kind: "card", order: CANCELLED },
  { kind: "reply", text: "Done. $59.99 is on its way back to your card." },
  { kind: "checked" },
];
const DELAYS = [400, 900, 700, 900, 1100, 900, 1300, 700, 600];
// At rest: the end of the story, so the first still frame already shows the point.
const REST = [0, 1, 4, 6, 7, 8];

function FrameView({ f }: { f: Frame }) {
  switch (f.kind) {
    case "me":
      return (
        <p className="ml-auto w-fit max-w-[84%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[15px] text-bg">
          {f.text}
        </p>
      );
    case "steps":
      return (
        <ul className="space-y-0.5 border-l-2 border-ink pl-3 text-[13px] text-muted">
          {f.steps.map(([a, b, flag]) => (
            <li key={a}>
              {a}{" "}
              <span className={flag ? "rounded border border-dashed border-ink px-1.5 font-mono text-xs text-ink" : "font-mono text-xs text-ink"}>
                {b}
              </span>
            </li>
          ))}
        </ul>
      );
    case "card":
      return <OrderCard order={f.order} />;
    case "reply":
      return <p className="text-[15px] leading-relaxed text-ink">{f.text}</p>;
    case "confirm":
      return (
        <div className="grid gap-2 rounded-xl border-2 border-ink p-3.5">
          <b className="font-display text-base font-extrabold">Cancel ORD-10072?</b>
          <span className="text-sm text-ink">$59.99 back to your card.</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Lock className="size-3" /> This can&apos;t be undone.
          </span>
          <span className="flex gap-2 text-[13px] font-semibold">
            <span className="rounded-lg bg-ink px-3 py-1.5 text-bg">Cancel order</span>
            <span className="rounded-lg border border-line-strong px-3 py-1.5">Keep it</span>
          </span>
        </div>
      );
    case "checked":
      return (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px]">
          <Check className="size-3.5" /> Checked against your account
        </span>
      );
  }
}

/** The product working is the hero's evidence: one real conversation, replayable. */
export function HeroDemo() {
  const [shown, setShown] = useState<number[]>(REST);
  const run = useRef(0);

  async function replay() {
    const id = ++run.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setShown([]);
    for (let i = 0; i < FRAMES.length; i++) {
      await new Promise((r) => setTimeout(r, reduce ? 0 : DELAYS[i]));
      if (id !== run.current) return;
      // The order card updates in place: the cancelled card replaces the open one.
      setShown((s) => (i === 6 ? [...s.filter((k) => k !== 2), i] : [...s, i]));
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[13px] text-muted">
        <span>Hana Deng · Gaithersburg</span>
        <button
          type="button"
          onClick={replay}
          className="min-h-8 rounded-full border border-line px-3 transition hover:border-ink hover:text-ink pointer-coarse:min-h-11"
        >
          Replay
        </button>
      </div>
      <div className="grid min-h-[30rem] content-start gap-3 p-4 sm:p-5" aria-live="polite">
        <AnimatePresence initial={false}>
          {shown.map((i) => (
            <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <FrameView f={FRAMES[i]} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
