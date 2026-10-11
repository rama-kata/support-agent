import { ArrowUpRight, Brain, ScanSearch, ShieldCheck, ShieldHalf, Wrench } from "lucide-react";
import Link from "next/link";
import { PersonaPicker } from "@/components/persona-picker";
import { GitHubMark, Logo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const REPO = "https://github.com/rama-kata/support-agent";

const STEPS = [
  {
    icon: ShieldHalf,
    name: "Guard",
    text: "Card numbers and SSNs are masked before any model sees them. Prompt injection is blocked.",
  },
  {
    icon: Brain,
    name: "Route",
    text: "One of 28 intents is picked in about 50ms and selects the playbook. Live here: a kNN router that learns from your feedback instantly.",
  },
  {
    icon: ScanSearch,
    name: "Retrieve",
    text: "Store policies and past resolutions come from a LlamaIndex index, so facts aren't guessed.",
  },
  {
    icon: Wrench,
    name: "Act",
    text: "Nine tools, scoped to your account in code. Refund limits and the 21+ rule are enforced there too.",
  },
  {
    icon: ShieldCheck,
    name: "Verify",
    text: "If the reply claims an action no tool performed, it's retried, then handed to a person. It never ships.",
  },
];

const RESULTS = [
  { value: "68/69", label: "test scenarios passed", note: "kNN router (live here); 69/69 fine-tuned" },
  { value: "98.6%", label: "tool-call accuracy", note: "checked against the database" },
  { value: "98.1%", label: "intent accuracy", note: "fine-tuned router, vs 80.7% prompted" },
  { value: "50ms", label: "routing latency", note: "2.5× faster than prompting" },
];

export default function Home() {
  return (
    <div className="paper min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="#how" className="hidden rounded-lg px-3 py-2 text-ink-soft hover:text-ink sm:block">
            How it works
          </Link>
          <Link href="/admin" className="rounded-lg px-3 py-2 text-ink-soft hover:text-ink">
            Admin
          </Link>
          <a
            href={REPO}
            className="grid size-9 pointer-coarse:size-11 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink"
            aria-label="Source code on GitHub"
          >
            <GitHubMark className="size-4" />
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid gap-10 pb-16 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-14">
          <div className="flex flex-col justify-center">
            <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-ink-soft backdrop-blur">
              <span className="size-1.5 rounded-full bg-ok" />
              Portfolio demo · runs on local models
            </p>
            <h1 className="font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl">
              A support agent that does the work, <em className="text-wine">and proves it.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Ask about an order, cancel one, request a refund or check whether something&apos;s in
              stock. Watch each step happen, then rate the answer: your feedback is what it learns
              from.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span>LangGraph</span>
              <span>LlamaIndex</span>
              <span>QLoRA fine-tuning</span>
              <span>MCP</span>
              <span>Qwen on Ollama</span>
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-surface-2/70 p-4 shadow-float backdrop-blur sm:p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Sign in as a customer</h2>
            <p className="mb-5 mt-1 text-sm text-ink-soft">
              Each has real order history. Changes reset regularly, so go ahead and cancel things.
            </p>
            <PersonaPicker />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-4">
          {RESULTS.map((r) => (
            <div key={r.label} className="bg-surface p-5">
              <p className="font-display text-3xl font-semibold tracking-tight text-wine">{r.value}</p>
              <p className="mt-1 text-sm font-medium text-ink">{r.label}</p>
              <p className="mt-0.5 text-xs text-muted">{r.note}</p>
            </div>
          ))}
        </section>

        <section id="how" className="scroll-mt-8 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-gold-ink">How a turn works</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Code where an action must happen. The model where judgment helps.
            </h2>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.name} className="relative rounded-2xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-lg bg-wine-soft text-wine">
                    <s.icon className="size-4" />
                  </span>
                  <span className="font-mono text-xs text-muted">0{i + 1}</span>
                </div>
                <p className="mt-4 font-medium text-ink">{s.name}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Cellar &amp; Co. is fictional. Products and sales history are real (Montgomery County, MD
            open data); customers and orders are synthetic.
          </p>
          <a href={REPO} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink">
            Source, evals and write-up <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
