"use client";

import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Ticket,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ADMIN_KEY, readStore, writeStore } from "@/lib/session";
import { Logo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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

function loadAll(t: string) {
  return Promise.all([
    api.admin<FeedbackRow[]>(t, "feedback"),
    api.admin<Stats>(t, "stats"),
    api.admin<Intents>(t, "intents"),
    api.admin<Record<string, EvalSummary>>(t, "evals"),
  ]);
}

export function AdminApp() {
  const [token, setToken] = useState<string | null>(() => readStore(ADMIN_KEY));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [intents, setIntents] = useState<Intents | null>(null);
  const [evals, setEvals] = useState<Record<string, EvalSummary>>({});
  const [filter, setFilter] = useState<"new" | "labeled" | "applied" | "all">("new");
  const [improving, setImproving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const apply = useCallback(([f, s, i, e]: Awaited<ReturnType<typeof loadAll>>) => {
    setFeedback(f);
    setStats(s);
    setIntents(i);
    setEvals(e);
  }, []);

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

  if (!token) {
    return (
      <div className="paper grid min-h-screen place-items-center px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            writeStore(ADMIN_KEY, draft.trim());
            setError(null);
            setToken(draft.trim());
          }}
          className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-float"
        >
          <Logo />
          <h1 className="mt-6 font-display text-2xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review feedback and teach the agent. The token is in <code className="font-mono text-xs">data/demo/.admin_token</code> on the server.
          </p>
          <label htmlFor="admin-token" className="mt-5 block text-xs font-medium text-ink-soft">
            Admin token
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 focus-within:border-wine">
            <KeyRound className="size-4 text-muted" />
            <input
              id="admin-token"
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              autoComplete="off"
            />
          </div>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          <button className="mt-4 w-full rounded-xl bg-wine py-2.5 text-sm font-medium text-wine-ink hover:bg-wine-strong">
            Continue
          </button>
          <Link href="/" className="mt-3 block text-center text-xs text-muted hover:text-ink">
            Back to the demo
          </Link>
        </form>
      </div>
    );
  }

  const shown = feedback.filter((f) => filter === "all" || f.status === filter);
  const labeledCount = feedback.filter((f) => f.status === "labeled").length;
  const allIntents = intents ? [...Object.keys(intents.builtin), ...Object.keys(intents.learned)] : [];

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-surface-2" aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
            <Logo />
            <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">Admin</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-surface-2 hover:text-ink sm:inline-flex">
              <RotateCcw className="size-4" /> Reset demo orders
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={MessageSquare} label="Conversation turns" value={stats?.turns ?? "–"} />
          <Stat icon={Timer} label="Avg response time" value={stats ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : "–"} />
          <Stat
            icon={ThumbsUp}
            label="Rated helpful"
            value={stats ? `${stats.thumbs_up} / ${stats.thumbs_up + stats.thumbs_down}` : "–"}
          />
          <Stat icon={Ticket} label="Handed to a person" value={stats?.tickets.length ?? "–"} />
        </section>

        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold">Feedback</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Label a thumbs-down with the right intent, and add a policy if the store had no answer.
                </p>
              </div>
              <button
                onClick={improve}
                disabled={!labeledCount || improving}
                className="inline-flex items-center gap-2 rounded-xl bg-wine px-4 py-2.5 text-sm font-medium text-wine-ink shadow-card transition hover:bg-wine-strong disabled:opacity-40"
              >
                {improving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Apply {labeledCount || ""} labeled
              </button>
            </div>

            <div className="mt-4 flex gap-1 rounded-xl border border-line bg-surface-2 p-1 text-sm">
              {(["new", "labeled", "applied", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx(
                    "flex-1 rounded-lg px-3 py-1.5 capitalize transition",
                    filter === f ? "bg-surface font-medium text-ink shadow-card" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {f}
                  <span className="ml-1.5 text-xs text-muted">
                    {f === "all" ? feedback.length : feedback.filter((x) => x.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            <ul className="mt-4 space-y-3">
              {shown.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
                  Nothing here yet. Rate some answers in the chat, then come back.
                </li>
              )}
              {shown.map((f) => (
                <FeedbackCard key={f.id} row={f} intents={allIntents} token={token} onSaved={() => refresh(token)} />
              ))}
            </ul>
          </section>

          <aside className="space-y-6">
            <Panel icon={Brain} title="What the agent has learned">
              {intents && (
                <div className="space-y-4 text-sm">
                  <p className="text-ink-soft">
                    Router <span className="font-mono text-xs text-ink">{intents.router}</span>
                    {intents.router_learns_live ? " learns from applied feedback immediately." : " needs retraining to learn."}
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <Mini label="examples" value={intents.learned_examples} />
                    <Mini label="new intents" value={Object.keys(intents.learned).length} />
                    <Mini label="policies" value={intents.learned_policies.length} />
                  </dl>
                  {Object.entries(intents.learned).map(([name, desc]) => (
                    <p key={name} className="flex items-baseline gap-2">
                      <span className="rounded bg-wine-soft px-1.5 py-0.5 font-mono text-xs text-wine">{name}</span>
                      <span className="text-ink-soft">{desc}</span>
                    </p>
                  ))}
                  {intents.learned_policies.map((p) => (
                    <p key={p} className="flex items-center gap-2 text-ink-soft">
                      <BookOpen className="size-3.5 text-gold" /> {p}
                    </p>
                  ))}
                </div>
              )}
            </Panel>

            <EvalsPanel evals={evals} />

            <Panel icon={Ticket} title="Recent handoffs">
              <ul className="space-y-2.5 text-sm">
                {stats?.tickets.slice(0, 6).map((t) => (
                  <li key={t.id} className="border-b border-line pb-2.5 last:border-0">
                    <p className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">#{t.id}</span>
                      <span className="text-xs text-gold">{t.reason.replaceAll("_", " ")}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-ink-soft">{t.summary}</p>
                  </li>
                ))}
                {stats?.tickets.length === 0 && <li className="text-muted">No handoffs yet.</li>}
              </ul>
            </Panel>
          </aside>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-5 left-1/2 z-30 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-float"
          >
            <Check className="mr-2 inline size-4 text-ok" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Brain; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <Icon className="size-4 text-gold" />
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 py-2">
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-xl font-semibold text-wine">{value}</dd>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function Panel({ icon: Icon, title, children }: { icon: typeof Brain; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 font-medium">
        <Icon className="size-4 text-gold" /> {title}
      </h3>
      {children}
    </section>
  );
}

function pct(v: unknown) {
  return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "–";
}

function EvalsPanel({ evals }: { evals: Record<string, EvalSummary> }) {
  const routers = Object.entries(evals).filter(([k]) => /^(prompt|knn|finetuned|lora):/.test(k));
  const agents = Object.entries(evals).filter(([k]) => k.startsWith("agent:"));
  const fly = evals.flywheel as (EvalSummary & { v1: Record<string, number>; v2: Record<string, number> }) | undefined;
  return (
    <Panel icon={Sparkles} title="Latest evals">
      <div className="space-y-4 text-sm">
        {fly && (
          <div className="rounded-xl bg-wine-soft/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-wine">Feedback loop, new topics</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted">Answered correctly</p>
                <p className="font-display text-lg font-semibold">
                  {pct(fly.v1.answered)} <span className="text-muted">→</span> <span className="text-wine">{pct(fly.v2.answered)}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Routed correctly</p>
                <p className="font-display text-lg font-semibold">
                  {pct(fly.v1.routed)} <span className="text-muted">→</span> <span className="text-wine">{pct(fly.v2.routed)}</span>
                </p>
              </div>
            </div>
          </div>
        )}
        <table className="w-full text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="pb-1.5 font-normal">Router</th>
              <th className="pb-1.5 text-right font-normal">Accuracy</th>
              <th className="pb-1.5 text-right font-normal">p50</th>
            </tr>
          </thead>
          <tbody>
            {routers.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 font-mono text-xs">{k.split(":")[0]}</td>
                <td className="py-1.5 text-right">{pct(v.accuracy)}</td>
                <td className="py-1.5 text-right text-ink-soft">{String(v.p50_ms ?? "–")}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.map(([k, v]) => (
          <p key={k} className="flex justify-between border-t border-line pt-2 text-ink-soft">
            <span>Agent with {k.replace("agent:", "").split(":")[0]} router</span>
            <span className="font-medium text-ink">{pct(v.pass_rate)}</span>
          </p>
        ))}
      </div>
    </Panel>
  );
}

function FeedbackCard({
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

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "grid size-8 shrink-0 place-items-center rounded-full",
            row.rating > 0 ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad",
          )}
        >
          {row.rating > 0 ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">&ldquo;{row.message}&rdquo;</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{row.reply}</p>
          {row.comment && (
            <p className="mt-2 rounded-lg bg-gold-soft px-3 py-1.5 text-sm text-gold">Customer: {row.comment}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
              routed as <span className="font-mono text-ink-soft">{row.intent ?? "–"}</span>
            </span>
            {row.label && (
              <span className="rounded-full bg-wine-soft px-2 py-0.5 text-wine">
                labeled <span className="font-mono">{row.label}</span>
              </span>
            )}
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 capitalize",
                row.status === "applied" ? "bg-ok-soft text-ok" : row.status === "labeled" ? "bg-gold-soft text-gold" : "bg-surface-2 text-muted",
              )}
            >
              {row.status}
            </span>
            {row.status !== "applied" && (
              <button onClick={() => setOpen((o) => !o)} className="ml-auto font-medium text-wine hover:underline">
                {open ? "Close" : row.label ? "Edit label" : "Label"}
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-medium text-ink-soft" htmlFor={`intent-${row.id}`}>
                  Correct intent
                </label>
                <select
                  id={`intent-${row.id}`}
                  value={isNew ? "__new" : intent}
                  onChange={(e) => {
                    setIsNew(e.target.value === "__new");
                    if (e.target.value !== "__new") setIntent(e.target.value);
                  }}
                  className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs outline-none focus:border-wine"
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
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="intent_name"
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-wine"
                  />
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Short description"
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none focus:border-wine"
                  />
                </div>
              )}
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-ink-soft">
                  Add a store policy (if the store had no answer)
                </summary>
                <div className="mt-2 space-y-2">
                  <input
                    value={policyTitle}
                    onChange={(e) => setPolicyTitle(e.target.value)}
                    placeholder="Policy title, e.g. Gift cards"
                    className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none focus:border-wine"
                  />
                  <textarea
                    value={policyText}
                    onChange={(e) => setPolicyText(e.target.value)}
                    rows={3}
                    placeholder="What customers should be told"
                    className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none focus:border-wine"
                  />
                </div>
              </details>
              {err && <p className="text-xs text-bad">{err}</p>}
              <div className="flex justify-end">
                <button
                  onClick={save}
                  disabled={saving || (isNew ? !newName || !desc : !intent)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-wine px-3 py-1.5 text-xs font-medium text-wine-ink hover:bg-wine-strong disabled:opacity-40"
                >
                  {saving && <LoaderCircle className="size-3.5 animate-spin" />} Save label
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
