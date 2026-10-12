"use client";

import { ArrowLeft, Check, KeyRound, LoaderCircle, LogOut, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ADMIN_KEY, readStore, writeStore } from "@/lib/session";
import { Logo } from "@/components/ui/brand";
import { LiveAgentStatus } from "@/components/ui/agent-status";

type FeedbackRow = {
  id: number;
  created_at: string;
  message: string;
  reply: string;
  intent: string | null;
  tools: string[];
  rating: number;
  comment: string | null;
  label: string | null;
  status: "new" | "labeled" | "applied";
};
type Stats = {
  turns: number;
  avg_latency_ms: number;
  thumbs_up: number;
  thumbs_down: number;
  tickets: { id: number; reason: string; summary: string; created_at: string }[];
};
type Intents = {
  builtin: Record<string, string>;
  learned: Record<string, string>;
  learned_examples: number;
  learned_policies: string[];
  router: string;
  router_learns_live: boolean;
};
type EvalSummary = Record<string, unknown> & { file: string };
type Filter = "new" | "labeled" | "applied" | "all";

function loadAll(t: string) {
  return Promise.all([
    api.admin<FeedbackRow[]>(t, "feedback"),
    api.admin<Stats>(t, "stats"),
    api.admin<Intents>(t, "intents"),
    api.admin<Record<string, EvalSummary>>(t, "evals"),
  ]);
}

const pct = (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "–");
const outlineBtn =
  "inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-40 pointer-coarse:min-h-11";
const field =
  "w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base text-ink outline-none placeholder:text-muted focus:border-ink sm:text-sm";

export function AdminApp() {
  const [token, setToken] = useState<string | null>(() => readStore(ADMIN_KEY));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [intents, setIntents] = useState<Intents | null>(null);
  const [evals, setEvals] = useState<Record<string, EvalSummary>>({});
  const [filter, setFilter] = useState<Filter>("new");
  const [improving, setImproving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [chosen, setChosen] = useState(false);
  const apply = useCallback(([f, s, i, e]: Awaited<ReturnType<typeof loadAll>>) => {
    setFeedback(f);
    // Open on the first tab with something in it, until the admin picks one.
    setFilter((cur) => {
      if (chosen) return cur;
      const order: Filter[] = ["new", "labeled", "applied"];
      return order.find((st) => f.some((x) => x.status === st)) ?? "new";
    });
    setStats(s);
    setIntents(i);
    setEvals(e);
  }, [chosen]);

  const refresh = useCallback((t: string) => loadAll(t).then(apply), [apply]);

  useEffect(() => {
    if (!token) return;
    loadAll(token).then(apply).catch((e) => {
      if (e instanceof ApiError && e.status === 403) {
        writeStore(ADMIN_KEY, null);
        setToken(null);
        setError("That admin token wasn't accepted.");
      } else {
        setError(e instanceof Error ? e.message : "Couldn't reach the server.");
      }
    });
  }, [token, apply]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }

  async function improve() {
    if (!token) return;
    setImproving(true);
    try {
      const r = await api.admin<{ applied_feedback: number; examples: number; intents: string[]; policies: string[] }>(
        token,
        "improve",
        { method: "POST" },
      );
      flash(
        `Applied ${r.applied_feedback} labels: the router learned ${r.examples} example${r.examples === 1 ? "" : "s"}` +
          (r.intents.length ? `, new intents ${r.intents.join(", ")}` : "") +
          (r.policies.length ? `, new policies "${r.policies.join('", "')}"` : "") +
          ". Live now.",
      );
      await refresh(token);
    } finally {
      setImproving(false);
    }
  }

  async function reset() {
    if (!token) return;
    await api.admin(token, "reset-demo", { method: "POST" });
    flash("Demo orders restored to their original state.");
  }

  function signOut() {
    writeStore(ADMIN_KEY, null);
    setToken(null);
  }

  if (!token) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            writeStore(ADMIN_KEY, draft.trim());
            setError(null);
            setToken(draft.trim());
          }}
          className="w-full max-w-sm rounded-3xl border border-line p-7"
        >
          <Logo />
          <h1 className="mt-7 font-display text-3xl font-extrabold text-ink">Admin</h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            Review feedback and teach the agent. The token is in{" "}
            <code className="font-mono text-[13px] text-ink">data/demo/.admin_token</code> on the server.
          </p>
          <label htmlFor="admin-token" className="mt-6 block text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Admin token
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line-strong px-3 focus-within:border-ink">
            <KeyRound className="size-4 text-muted" />
            <input
              id="admin-token"
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-transparent py-2.5 text-base outline-none"
              autoComplete="off"
            />
          </div>
          {error && <p className="mt-2 rounded-lg border border-dashed border-ink px-3 py-2 text-sm text-ink">{error}</p>}
          <button className="mt-5 min-h-11 w-full rounded-full bg-ink text-[15px] font-semibold text-bg transition hover:bg-ink-soft">
            Continue
          </button>
          <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-ink">
            Back to the demo
          </Link>
        </form>
      </div>
    );
  }

  const count = (f: Filter) => (f === "all" ? feedback.length : feedback.filter((x) => x.status === f).length);
  const shown = feedback.filter((f) => filter === "all" || f.status === filter);
  const labeledCount = count("labeled");
  const allIntents = intents ? [...Object.keys(intents.builtin), ...Object.keys(intents.learned)] : [];
  const rated = stats ? stats.thumbs_up + stats.thumbs_down : 0;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-4 sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3">
          <Link href="/" className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface-2 pointer-coarse:size-11" aria-label="Back to the demo">
            <ArrowLeft className="size-4" />
          </Link>
          <Logo />
          <span className="rounded-full border border-ink px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink">Admin</span>
          <LiveAgentStatus className="ml-2 hidden md:inline-flex" />
          <div className="ml-auto flex items-center gap-2">
            <button onClick={reset} className={clsx(outlineBtn, "hidden sm:inline-flex")}>
              <RotateCcw className="size-4" /> Reset demo orders
            </button>
            <button onClick={signOut} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface-2 pointer-coarse:size-11" aria-label="Sign out of admin">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {error && <p className="mb-6 rounded-xl border border-dashed border-ink px-4 py-3 text-sm text-ink">{error}</p>}

        {/* The loop this page exists for, as the real three steps. */}
        <section className="grid items-end gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Feedback loop</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.02] text-ink sm:text-5xl">Teach the agent</h1>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              ["Rate", "Customers mark answers helpful or not in the chat."],
              ["Label", "Give a thumbs-down the right intent, or a new policy."],
              ["Apply", "The router and policy index learn it instantly."],
            ].map(([name, text], i) => (
              <li key={name} className="grid grid-cols-[32px_1fr] gap-x-3 gap-y-1">
                <span className={clsx("row-span-2 grid size-8 place-items-center rounded-full border-2 border-ink font-mono text-xs font-semibold", i === 2 ? "bg-ink text-bg" : "text-ink")}>
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{name}</span>
                <span className="text-sm text-ink-soft">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Activity" className="mt-10 grid overflow-hidden rounded-2xl border border-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            [stats?.turns ?? "–", "conversation turns"],
            [stats ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : "–", "average response time"],
            [rated ? `${stats!.thumbs_up}/${rated}` : "–", "rated helpful"],
            [stats?.tickets.length ?? "–", "handed to a person"],
          ].map(([value, label]) => (
            <div key={label} className="grid gap-1 border-b border-line p-5 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(2n)]:border-r lg:last:border-r-0">
              <b className="font-display text-4xl font-extrabold tabular-nums text-ink">{value}</b>
              <span className="text-sm text-muted">{label}</span>
            </div>
          ))}
        </section>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.55fr_1fr]">
          <section aria-labelledby="queue-h">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="queue-h" className="font-display text-2xl font-extrabold text-ink">Feedback</h2>
                <p className="mt-1 text-[15px] text-ink-soft">Label what the agent got wrong, then apply it.</p>
              </div>
              <button
                onClick={improve}
                disabled={!labeledCount || improving}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-bg transition hover:bg-ink-soft disabled:opacity-35"
              >
                {improving && <LoaderCircle className="size-4 animate-spin" />}
                Apply {labeledCount || ""} labeled
              </button>
            </div>

            <div role="tablist" aria-label="Filter feedback" className="mt-5 flex gap-6 border-b border-line text-[15px]">
              {(["new", "labeled", "applied", "all"] as const).map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => {
                    setChosen(true);
                    setFilter(f);
                  }}
                  className={clsx(
                    "-mb-px min-h-11 border-b-2 capitalize transition",
                    filter === f ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {f} <span className="ml-1 font-mono text-xs">{count(f)}</span>
                </button>
              ))}
            </div>

            <ul className="divide-y divide-line">
              {shown.length === 0 && (
                <li className="py-12 text-center text-[15px] text-muted">
                  Nothing here. Rate some answers in the chat, then come back.
                </li>
              )}
              {shown.map((f) => (
                <FeedbackRowView key={f.id} row={f} intents={allIntents} token={token} onSaved={() => refresh(token)} />
              ))}
            </ul>
          </section>

          <aside className="grid content-start gap-10">
            <Learned intents={intents} />
            <Evals evals={evals} liveRouter={intents?.router} />
            <section aria-labelledby="handoffs-h">
              <h2 id="handoffs-h" className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Recent handoffs</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {stats?.tickets.slice(0, 6).map((t) => (
                  <li key={t.id} className="grid gap-0.5 py-3 text-sm">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">#{t.id}</span>
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-ink">{t.reason.replaceAll("_", " ")}</span>
                    </span>
                    <span className="line-clamp-2 text-ink-soft">{t.summary}</span>
                  </li>
                ))}
                {stats?.tickets.length === 0 && <li className="py-3 text-sm text-muted">No handoffs yet.</li>}
              </ul>
            </section>
          </aside>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-5 left-1/2 z-30 flex w-[min(92vw,560px)] -translate-x-1/2 items-start gap-2 rounded-2xl bg-ink px-4 py-3 text-[15px] text-bg"
          >
            <Check className="mt-0.5 size-4 shrink-0" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Learned({ intents }: { intents: Intents | null }) {
  if (!intents) return null;
  return (
    <section aria-labelledby="learned-h">
      <h2 id="learned-h" className="text-xs font-medium uppercase tracking-[0.14em] text-muted">What it has learned</h2>
      <dl className="mt-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-line">
        {[
          [intents.learned_examples, "examples"],
          [Object.keys(intents.learned).length, "new intents"],
          [intents.learned_policies.length, "policies"],
        ].map(([v, label]) => (
          <div key={label} className="border-r border-line px-3 py-3 last:border-r-0">
            <dd className="font-display text-2xl font-extrabold tabular-nums text-ink">{v}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-soft">
        Router <span className="font-mono text-[13px] text-ink">{intents.router}</span>
        {intents.router_learns_live ? " learns from applied feedback immediately." : " needs retraining to learn."}
      </p>
      {(Object.keys(intents.learned).length > 0 || intents.learned_policies.length > 0) && (
        <ul className="mt-3 grid gap-1.5 text-sm">
          {Object.entries(intents.learned).map(([name, desc]) => (
            <li key={name} className="flex items-baseline gap-2">
              <span className="rounded border border-ink px-1.5 font-mono text-xs text-ink">{name}</span>
              <span className="text-ink-soft">{desc}</span>
            </li>
          ))}
          {intents.learned_policies.map((p) => (
            <li key={p} className="flex items-baseline gap-2">
              <span className="rounded border border-dashed border-ink px-1.5 text-xs text-ink">policy</span>
              <span className="text-ink-soft">{p}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Before and after bars for the feedback-loop eval: outline is v1, filled is v2. */
function Bar({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-[13px] text-ink">
          {pct(before)} <span className="text-muted">→</span> <b>{pct(after)}</b>
        </span>
      </div>
      <div className="grid gap-1" aria-hidden>
        {/* A 0% bar draws nothing: a stub would read as a value. */}
        <span className={clsx("h-2 rounded-full", before > 0 && "border border-line-strong")} style={{ width: `${before * 100}%` }} />
        <span className={clsx("h-2 rounded-full", after > 0 && "bg-ink")} style={{ width: `${after * 100}%` }} />
      </div>
    </div>
  );
}

function Evals({ evals, liveRouter }: { evals: Record<string, EvalSummary>; liveRouter?: string }) {
  const routers = Object.entries(evals).filter(([k]) => /^(prompt|knn|finetuned|lora):/.test(k));
  const agents = Object.entries(evals).filter(([k]) => k.startsWith("agent:"));
  const fly = evals.flywheel as (EvalSummary & { v1: Record<string, number>; v2: Record<string, number> }) | undefined;
  const liveKind = liveRouter?.split(":")[0];
  return (
    <section aria-labelledby="evals-h" className="grid gap-5">
      <h2 id="evals-h" className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Latest evals</h2>
      {fly && (
        <div className="grid gap-4 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold text-ink">Topics the store didn&apos;t cover, before and after 15 labels each</p>
          <Bar label="Answered correctly" before={fly.v1.answered} after={fly.v2.answered} />
          <Bar label="Routed correctly" before={fly.v1.routed} after={fly.v2.routed} />
        </div>
      )}
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="pb-2 font-normal">Router</th>
            <th className="pb-2 text-right font-normal">Accuracy</th>
            <th className="pb-2 text-right font-normal">p50</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {routers.map(([k, v]) => {
            const kind = k.split(":")[0];
            return (
              <tr key={k}>
                <td className="py-2">
                  <span className="font-mono text-[13px] text-ink">{kind}</span>
                  {kind === liveKind && <span className="ml-2 rounded-full bg-ink px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-bg">live</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{pct(v.accuracy)}</td>
                <td className="py-2 text-right tabular-nums text-muted">{String(v.p50_ms ?? "–")}ms</td>
              </tr>
            );
          })}
          {agents.map(([k, v]) => (
            <tr key={k}>
              <td className="py-2 text-ink-soft">Agent, {k.replace("agent:", "").split(":")[0]} router</td>
              <td className="py-2 text-right tabular-nums font-semibold text-ink">{pct(v.pass_rate)}</td>
              <td className="py-2 text-right text-muted">scenarios</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STATUS_CHIP: Record<FeedbackRow["status"], string> = {
  new: "border border-line-strong text-ink",
  labeled: "border border-dashed border-ink text-ink",
  applied: "bg-ink text-bg",
};

function FeedbackRowView({
  row,
  intents,
  token,
  onSaved,
}: {
  row: FeedbackRow;
  intents: string[];
  token: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState(row.label ?? row.intent ?? "");
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [desc, setDesc] = useState("");
  const [policyTitle, setPolicyTitle] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.admin(token, `feedback/${row.id}/label`, {
        method: "POST",
        body: JSON.stringify({
          intent: isNew ? newName : intent,
          intent_description: isNew ? desc : null,
          policy_title: policyTitle || null,
          policy_text: policyText || null,
        }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const helpful = row.rating > 0;
  return (
    <li className="py-5">
      <div className="grid grid-cols-[32px_1fr] gap-x-3.5">
        <span
          className={clsx("grid size-8 place-items-center rounded-full", helpful ? "border border-line-strong text-ink" : "bg-ink text-bg")}
          aria-label={helpful ? "Rated helpful" : "Rated not helpful"}
        >
          {helpful ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">&ldquo;{row.message}&rdquo;</p>
          {/* Preview only: drop markdown emphasis so "**name**" doesn't show its asterisks. */}
          <p className="mt-1 line-clamp-2 text-[15px] text-ink-soft">{row.reply.replace(/\*\*(.+?)\*\*/g, "$1")}</p>
          {row.comment && (
            <p className="mt-2.5 border-l-2 border-ink pl-3 text-[15px] text-ink">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">Customer said</span>
              <br />
              {row.comment}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">
              routed as <span className="font-mono text-[13px] text-ink">{row.intent ?? "–"}</span>
            </span>
            {row.label && (
              <span className="text-muted">
                · labeled <span className="font-mono text-[13px] text-ink">{row.label}</span>
              </span>
            )}
            <span className={clsx("rounded-full px-2 py-0.5 font-medium capitalize", STATUS_CHIP[row.status])}>{row.status}</span>
            {row.status !== "applied" && (
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="ml-auto min-h-9 rounded-full border border-line-strong px-3.5 text-[13px] font-medium text-ink transition hover:border-ink pointer-coarse:min-h-11"
              >
                {open ? "Close" : row.label ? "Edit label" : "Label"}
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-4 grid gap-3 rounded-2xl border border-line p-4">
                  <div className="grid gap-1.5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-3">
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted" htmlFor={`intent-${row.id}`}>
                      Correct intent
                    </label>
                    <select
                      id={`intent-${row.id}`}
                      value={isNew ? "__new" : intent}
                      onChange={(e) => {
                        setIsNew(e.target.value === "__new");
                        if (e.target.value !== "__new") setIntent(e.target.value);
                      }}
                      className={clsx(field, "font-mono")}
                    >
                      {intents.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                      <option value="__new">+ new intent…</option>
                    </select>
                  </div>
                  {isNew && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        aria-label="New intent name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                        placeholder="intent_name"
                        className={clsx(field, "font-mono")}
                      />
                      <input aria-label="Intent description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" className={field} />
                    </div>
                  )}
                  <details>
                    <summary className="min-h-8 cursor-pointer text-sm font-medium text-ink-soft hover:text-ink">
                      Add a store policy (if the store had no answer)
                    </summary>
                    <div className="mt-2 grid gap-2">
                      <input aria-label="Policy title" value={policyTitle} onChange={(e) => setPolicyTitle(e.target.value)} placeholder="Policy title, e.g. Gift cards" className={field} />
                      <textarea
                        aria-label="Policy text"
                        value={policyText}
                        onChange={(e) => setPolicyText(e.target.value)}
                        rows={3}
                        placeholder="What customers should be told"
                        className={clsx(field, "resize-none")}
                      />
                    </div>
                  </details>
                  {err && <p className="rounded-lg border border-dashed border-ink px-3 py-2 text-sm text-ink">{err}</p>}
                  <div className="flex justify-end">
                    <button
                      onClick={save}
                      disabled={saving || (isNew ? !newName || !desc : !intent)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-bg transition hover:bg-ink-soft disabled:opacity-35"
                    >
                      {saving && <LoaderCircle className="size-4 animate-spin" />} Save label
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}
