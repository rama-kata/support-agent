"use client";

import { ArrowRight, LoaderCircle, Lock, PlugZap } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type Persona } from "@/lib/api";
import { THREAD_KEY, TOKEN_KEY, writeStore } from "@/lib/session";

export function PersonaPicker() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [signingIn, setSigningIn] = useState<number | null>(null);

  useEffect(() => {
    api.personas().then(setPersonas).catch(() => setOffline(true));
  }, []);

  async function signIn(id: number) {
    setSigningIn(id);
    try {
      const { token } = await api.login(id);
      writeStore(TOKEN_KEY, token);
      writeStore(THREAD_KEY, null);
      router.push("/chat");
    } catch (e) {
      setSigningIn(null);
      if (e instanceof ApiError && e.status === 0) setOffline(true);
    }
  }

  if (offline) {
    return (
      <div className="flex max-w-2xl items-start gap-3 rounded-2xl border border-dashed border-ink p-5">
        <PlugZap className="mt-0.5 size-5 shrink-0 text-ink" />
        <div>
          <p className="font-semibold text-ink">The agent is offline right now</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
            It runs on local models on a home GPU, so it&apos;s only available while that machine is on.
            The code, evals and results are on GitHub.
          </p>
        </div>
      </div>
    );
  }

  if (!personas) {
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[184px] animate-pulse rounded-2xl border border-line bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {personas.map((p, i) => (
        <motion.button
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={() => signIn(p.id)}
          disabled={signingIn !== null}
          className="group grid content-start gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-ink disabled:opacity-60"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border border-ink font-display text-lg font-extrabold text-ink">
              {p.first_name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{p.name}</span>
              <span className="block text-[13px] text-muted">
                {p.age} · {p.address.split(", ").at(-2)}
              </span>
            </span>
            {signingIn === p.id ? (
              <LoaderCircle className="size-4 animate-spin text-ink" />
            ) : (
              <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
            )}
          </span>
          {p.under_age && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-dashed border-ink px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-ink">
              <Lock className="size-3" /> Under 21
            </span>
          )}
          <span className="border-t border-dashed border-line-strong pt-3 text-[15px] leading-snug text-ink-soft">
            <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-muted">Try</span>
            {p.blurb}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
