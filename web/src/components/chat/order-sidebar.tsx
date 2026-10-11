"use client";

import { ChevronDown, Lock, LogOut, MapPin, Package, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useState } from "react";
import type { Order, Persona } from "@/lib/api";
import { StatusPill } from "@/components/ui/brand";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function OrderSidebar({
  customer,
  orders,
  changed,
  onNewChat,
  onSignOut,
  onAsk,
}: {
  customer: Persona;
  orders: Order[];
  changed: Set<string>;
  onNewChat: () => void;
  onSignOut: () => void;
  onAsk: (text: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-wine-soft font-display text-lg font-semibold text-wine">
            {customer.first_name[0]}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-ink">
              {customer.name}
              {customer.under_age && <Lock className="size-3.5 text-gold" aria-label="Under 21" />}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              <MapPin className="size-3" /> {customer.address.split(", ").slice(-2).join(", ")}
            </p>
          </div>
        </div>
        {customer.under_age && (
          <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-xs leading-relaxed text-gold-ink">
            This account is under 21. The agent can help with orders and account questions, but
            won&apos;t share product or stock information.
          </p>
        )}
        <button
          onClick={onNewChat}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card transition hover:border-line-strong"
        >
          <Plus className="size-4" /> New conversation
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
        <p className="px-1 pb-2 pt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Recent orders
        </p>
        <ul className="space-y-1.5">
          {orders.map((o) => (
            <li key={o.id}>
              <motion.div
                layout
                className={clsx(
                  "rounded-xl border bg-surface transition",
                  changed.has(o.id) ? "border-wine/40 ring-2 ring-wine/15" : "border-line",
                )}
              >
                <button
                  onClick={() => setOpen(open === o.id ? null : o.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                  aria-expanded={open === o.id}
                >
                  <Package className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] text-ink">{o.id}</p>
                    <p className="text-xs text-muted">
                      {day(o.created_at)} · {money(o.total)}
                    </p>
                  </div>
                  <StatusPill status={o.status} />
                  <ChevronDown className={clsx("size-3.5 text-muted transition", open === o.id && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open === o.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 border-t border-line px-3 py-2.5 text-xs">
                        <ul className="space-y-1 text-ink-soft">
                          {o.items.map((it) => (
                            <li key={it.sku} className="flex justify-between gap-2">
                              <span className="truncate">
                                {it.quantity}× {it.name.split(" - ")[0].toLowerCase()}
                              </span>
                              <span className="shrink-0 text-muted">{money(it.unit_price * it.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                        {o.tracking_number && (
                          <p className="text-muted">
                            Tracking <span className="font-mono text-ink-soft">{o.tracking_number}</span>
                          </p>
                        )}
                        {o.refunds.map((r, i) => (
                          <p key={i} className="text-muted">
                            Refund {money(r.amount)} · <span className="text-ink-soft">{r.status.replace("_", " ")}</span>
                          </p>
                        ))}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <AskChip onClick={() => onAsk(`Where is my order ${o.id}?`)}>Where is it?</AskChip>
                          {o.status === "processing" && (
                            <AskChip onClick={() => onAsk(`Please cancel ${o.id}`)}>Cancel it</AskChip>
                          )}
                          {o.status === "delivered" && (
                            <AskChip onClick={() => onAsk(`A bottle in ${o.id} arrived broken, can I get a refund?`)}>
                              Report a problem
                            </AskChip>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="size-4" /> Switch customer
        </button>
      </div>
    </div>
  );
}

function AskChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine/40 hover:text-wine"
    >
      {children}
    </button>
  );
}
