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
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
          <PlugZap className="size-4" />
        </span>
        <div>
          <p className="font-medium text-ink">The agent is offline right now</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            It runs on local models on a home GPU, so it&apos;s only available while that machine
            is on. The code, evals and results are on GitHub.
          </p>
        </div>
      </div>
    );
  }

  if (!personas) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-2xl border border-line bg-surface/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {personas.map((p, i) => (
        <motion.button
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={() => signIn(p.id)}
          disabled={signingIn !== null}
          className="group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-wine-soft font-display text-lg font-semibold text-accent">
              {p.first_name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium text-ink">
                {p.name}
                {p.under_age && <Lock className="size-3.5 text-gold" aria-label="Under 21" />}
              </p>
              <p className="text-xs text-muted">
                Age {p.age} · {p.address.split(", ").at(-2)}
              </p>
            </div>
            {signingIn === p.id ? (
              <LoaderCircle className="size-4 animate-spin text-accent" />
            ) : (
              <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
            )}
          </div>
          <p className="text-sm leading-snug text-ink-soft">{p.blurb}</p>
        </motion.button>
      ))}
    </div>
  );
}
