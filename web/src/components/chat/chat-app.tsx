"use client";

import { ArrowUp, Menu, PlugZap, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  streamChat,
  streamConfirm,
  type AgentStatus,
  type Decision,
  type Order,
  type Persona,
  type StreamHandlers,
} from "@/lib/api";
import { readStore, THREAD_KEY, TOKEN_KEY, writeStore } from "@/lib/session";
import { Bottles, Logo } from "@/components/ui/brand";
import { AgentStatusBadge } from "@/components/ui/agent-status";
import { AgentMessage, type AgentTurn } from "./agent-message";
import { OrderSidebar } from "./order-sidebar";

type CustomerTurn = { role: "customer"; key: string; text: string };
type Turn = CustomerTurn | AgentTurn;

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function suggestions(customer: Persona, orders: Order[]): string[] {
  const shipped = orders.find((o) => o.status === "shipped");
  const processing = orders.find((o) => o.status === "processing");
  const delivered = orders.find((o) => o.status === "delivered");
  const out: string[] = [];
  if (shipped) out.push(`Where is my order ${shipped.id}?`);
  if (processing) out.push(`Cancel ${processing.id}, I ordered it by mistake`);
  if (delivered) out.push(`A bottle in ${delivered.id} was corked, can I get $20 back?`);
  out.push(customer.under_age ? "Do you have any cheap vodka?" : "Is the Corona 18 pack in stock? Will it last the week?");
  out.push("How much is express shipping?");
  return out.slice(0, 4);
}

export function ChatApp() {
  const router = useRouter();
  // Never rendered, so reading storage during the first render can't cause a mismatch.
  const [token] = useState<string | null>(() => readStore(TOKEN_KEY));
  const [customer, setCustomer] = useState<Persona | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("ready");
  const [drawer, setDrawer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const signOut = useCallback(() => {
    writeStore(TOKEN_KEY, null);
    writeStore(THREAD_KEY, null);
    router.push("/");
  }, [router]);

  const loadAccount = useCallback(
    async (t: string, previous?: Order[]) => {
      const me = await api.me(t);
      setCustomer(me.customer);
      setOrders(me.orders);
      if (previous) {
        const before = new Map(previous.map((o) => [o.id, JSON.stringify(o)]));
        const diff = new Set(me.orders.filter((o) => before.get(o.id) !== JSON.stringify(o)).map((o) => o.id));
        setChanged(diff);
        if (diff.size) setTimeout(() => setChanged(new Set()), 4000);
      }
    },
    [],
  );

  useEffect(() => {
    const t = token;
    if (!t) {
      router.replace("/");
      return;
    }
    api
      .health()
      .then((h) => {
        setStatus(h.agent);
        if (h.agent === "offline") setOffline(true);
      })
      .catch(() => setOffline(true));
    api
      .me(t)
      .then(async (me) => {
        setCustomer(me.customer);
        setOrders(me.orders);
        const saved = readStore(THREAD_KEY);
        if (!saved) return;
        const history = await api.thread(t, saved).catch(() => null);
        if (!history?.messages.length) return;
        setThreadId(saved);
        const restored: Turn[] = history.messages.map((m) =>
          m.role === "customer"
            ? { role: "customer", key: nextKey(), text: m.text }
            : {
                role: "agent",
                key: nextKey(),
                turnId: m.turn_id,
                text: m.text,
                steps: m.steps ?? [],
                cards: m.cards ?? [],
                verified: m.verified,
                intent: m.intent,
                latencyMs: m.latency_ms ?? undefined,
                pending: false,
              },
        );
        // A confirmation the customer hadn't answered yet comes back with the conversation.
        const last = restored.at(-1);
        if (history.pending && last?.role === "agent") {
          last.confirm = { actions: history.pending.actions };
          last.turnId = undefined;
        }
        setTurns(restored);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) signOut();
        else setOffline(true);
      });
  }, [token, router, signOut]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const updateAgent = (key: string, patch: (t: AgentTurn) => AgentTurn) =>
    setTurns((all) => all.map((t) => (t.key === key && t.role === "agent" ? patch(t) : t)));

  const awaiting = turns.some((t) => t.role === "agent" && t.confirm && !t.confirm.decided);

  /** Stream handlers that fill one agent turn; shared by new messages and confirmations. */
  function handlersFor(agentKey: string): StreamHandlers {
    return {
      onStart: (id) => {
        setThreadId(id);
        writeStore(THREAD_KEY, id);
      },
      onIntent: (intent) => updateAgent(agentKey, (t) => ({ ...t, intent })),
      onGuard: (redacted) => updateAgent(agentKey, (t) => ({ ...t, redacted })),
      onToolStart: (step) => updateAgent(agentKey, (t) => ({ ...t, steps: [...t.steps, step] })),
      onToolEnd: (id, ok, detail) =>
        updateAgent(agentKey, (t) => ({
          ...t,
          steps: t.steps.map((s) => (s.id === id ? { ...s, status: ok ? "ok" : "error", detail } : s)),
        })),
      // One card per order: a later state (e.g. cancelled) replaces the earlier one.
      onCard: (order) =>
        updateAgent(agentKey, (t) => ({ ...t, cards: [...t.cards.filter((c) => c.id !== order.id), order] })),
      // The action itself hasn't run: its step waits on the customer, not on the server.
      onConfirm: (actions) =>
        updateAgent(agentKey, (t) => ({
          ...t,
          pending: false,
          confirm: { actions },
          steps: t.steps.map((s) =>
            s.status === "running" ? { ...s, status: "waiting", detail: "waiting for your OK" } : s,
          ),
        })),
      onReply: (r) =>
        updateAgent(agentKey, (t) => ({
          ...t,
          pending: false,
          text: r.text,
          turnId: r.turn_id,
          intent: r.intent ?? t.intent,
          latencyMs: r.latency_ms,
          verified: r.verified,
          steps: t.steps.map((s) => (s.status === "running" ? { ...s, status: "ok" } : s)),
        })),
      onError: (msg) => updateAgent(agentKey, (t) => ({ ...t, pending: false, error: msg })),
    };
  }

  async function run(agentKey: string, start: (signal: AbortSignal) => Promise<void>) {
    const before = orders;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    await start(controller.signal);
    abortRef.current = null;
    setBusy(false);
    loadAccount(token!, before).catch(() => {});
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || awaiting || !token) return;
    setInput("");
    setDrawer(false);
    const agentKey = nextKey();
    setTurns((all) => [
      ...all,
      { role: "customer", key: nextKey(), text: message },
      { role: "agent", key: agentKey, steps: [], cards: [], pending: true },
    ]);
    await run(agentKey, (signal) => streamChat(token, message, threadId, handlersFor(agentKey), signal));
  }

  async function decide(agentKey: string, decision: Decision) {
    if (!token || !threadId || busy) return;
    updateAgent(agentKey, (t) => ({
      ...t,
      pending: true,
      confirm: t.confirm && { ...t.confirm, decided: decision },
      // The paused step runs (or is declined) in the resumed stream, which reports its result.
      steps: t.steps.map((s) => (s.status === "waiting" ? { ...s, status: "running", detail: undefined } : s)),
    }));
    await run(agentKey, (signal) => streamConfirm(token, threadId, decision, handlersFor(agentKey), signal));
  }

  /** Stop: abandon the stream. Lookups may have run; nothing irreversible runs unconfirmed. */
  function stop() {
    abortRef.current?.abort();
    setTurns((all) =>
      all.map((t) =>
        t.role === "agent" && t.pending
          ? {
              ...t,
              pending: false,
              stopped: true,
              steps: t.steps.map((s) => (s.status === "running" ? { ...s, status: "error", detail: "stopped" } : s)),
            }
          : t,
      ),
    );
  }

  async function rate(turn: AgentTurn, rating: 1 | -1, comment?: string) {
    if (!token || !turn.turnId) return;
    updateAgent(turn.key, (t) => ({ ...t, rating }));
    await api.feedback(token, turn.turnId, rating, comment).catch(() => {});
  }

  function newChat() {
    setTurns([]);
    setThreadId(null);
    writeStore(THREAD_KEY, null);
    setDrawer(false);
    inputRef.current?.focus();
  }

  const prompts = useMemo(() => (customer ? suggestions(customer, orders) : []), [customer, orders]);

  if (offline) {
    return (
      <div className="paper grid min-h-screen place-items-center px-4">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-warn-soft text-warn">
            <PlugZap className="size-5" />
          </span>
          <AgentStatusBadge status="offline" className="mt-4" />
          <h1 className="mt-3 font-display text-xl font-semibold">The agent is offline</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            It runs on local models on a home GPU, so it&apos;s only reachable while that machine is on.
          </p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-wine px-4 py-2 text-sm font-medium text-wine-ink">
            Back to the start
          </Link>
        </div>
      </div>
    );
  }

  const sidebar = customer && (
    <OrderSidebar
      customer={customer}
      orders={orders}
      changed={changed}
      onNewChat={newChat}
      onSignOut={signOut}
      onAsk={send}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <aside className="hidden w-80 shrink-0 border-r border-line bg-surface-2/60 lg:block">{sidebar}</aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-bg-deep/80 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-40 w-[86vw] max-w-80 border-r border-line bg-surface shadow-float lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <button
                onClick={() => setDrawer(false)}
                className="absolute right-2 top-2 grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawer(true)}
              className="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 lg:hidden"
              aria-label="Show orders"
            >
              <Menu className="size-4" />
            </button>
            <Link href="/" aria-label="Home">
              <Logo />
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <AgentStatusBadge status={status} className="hidden sm:inline-flex" />
          </div>
        </header>

        <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 xl:max-w-[1040px]">
            {turns.length === 0 && customer && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-6 sm:pt-12 xl:ml-[240px]">
                <p className="inline-flex items-center gap-2 text-sm text-muted">
                  <Bottles className="h-4 w-auto text-ink" /> Signed in as {customer.first_name}
                </p>
                <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  How can we help today?
                </h1>
                <p className="mt-3 max-w-lg text-ink-soft">
                  I can track and cancel orders, change addresses, handle refunds and check stock.
                  Beside every answer, I note where it came from, and I ask before changing anything.
                </p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {prompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-[15px] text-ink-soft transition hover:border-ink hover:text-ink"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            <div className="space-y-7">
              {turns.map((t) =>
                t.role === "customer" ? (
                  <motion.div
                    key={t.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end xl:ml-[240px]"
                  >
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-base leading-relaxed text-bg">
                      {t.text}
                    </p>
                  </motion.div>
                ) : (
                  <AgentMessage
                    key={t.key}
                    turn={t}
                    onRate={(r, c) => rate(t, r, c)}
                    onDecide={(d) => decide(t.key, d)}
                  />
                ),
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line bg-bg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3 xl:max-w-[1040px] xl:pl-[276px]"
          >
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <textarea
              id="composer"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={1000}
              disabled={awaiting}
              placeholder={
                awaiting ? "Answer the card above first" : busy ? "Working on it… you can stop me" : "Ask about an order or a product"
              }
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink disabled:opacity-60 sm:text-[15px]"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="grid size-[46px] shrink-0 place-items-center rounded-2xl border border-ink text-ink transition hover:bg-surface-2"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={awaiting || !input.trim()}
                aria-label="Send"
                className="grid size-[46px] shrink-0 place-items-center rounded-2xl bg-ink text-bg transition hover:bg-ink-soft disabled:opacity-40"
              >
                <ArrowUp className="size-5" />
              </button>
            )}
          </form>
          <p className="pb-3 text-center text-xs text-muted">
            Demo store. Orders are synthetic and reset regularly.
          </p>
        </div>
      </main>
    </div>
  );
}
