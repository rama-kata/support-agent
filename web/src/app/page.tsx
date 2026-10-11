import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { HeroDemo } from "@/components/landing/hero-demo";
import { PersonaPicker } from "@/components/persona-picker";
import { GitHubMark, Logo } from "@/components/ui/brand";

const REPO = "https://github.com/rama-kata/support-agent";

// Every number here comes from an eval run; keep it in step with the README.
const RESULTS = [
  { value: "77/79", label: "test conversations passed", note: "multi-turn, adversarial and wine-knowledge cases" },
  { value: "98.7%", label: "tool calls correct", note: "the right action on the right order" },
  { value: "98.1%", label: "intent accuracy", note: "fine-tuned 3B model, vs 80.7% prompted" },
  { value: "50ms", label: "to understand a message", note: "2.5× faster than prompting the same model" },
];

// A real sequence: every message goes through these steps in this order.
const STEPS = [
  { name: "Guard", text: "Card numbers are masked before any model sees them. Prompt injection is blocked." },
  { name: "Understand", text: "A router trained on 22,000 support messages works out what you need in about 50ms." },
  { name: "Look up", text: "Store policies come from a search index, so answers aren't guessed." },
  { name: "Act", text: "Nine tools, locked to your account. Anything irreversible waits for your OK." },
  { name: "Verify", text: "If a reply claims an action that didn't happen, it never reaches you." },
];

const PROMISES = [
  { title: "Say it did something it didn't", text: "Claims are checked against what actually happened before you see the reply." },
  { title: "Act without asking", text: "Cancellations, refunds and address changes wait for your confirmation." },
  { title: "Show you someone else's order", text: "Your account comes from your session, never from the conversation." },
  { title: "Approve big refunds alone", text: "Anything over $100 goes to a supervisor." },
  { title: "Sell to under-21s", text: "Product information is withheld for underage accounts." },
  { title: "Make up a vintage", text: "If the store doesn't publish it, the agent says so." },
];

function SectionHead({ eyebrow, title, text, id }: { eyebrow: string; title: string; text: string; id: string }) {
  return (
    <div className="mb-9 grid items-end gap-6 md:grid-cols-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
        <h2 id={id} className="mt-3 font-display text-4xl font-extrabold leading-[1.02] text-ink sm:text-5xl">
          {title}
        </h2>
      </div>
      <p className="max-w-[52ch] text-ink-soft">{text}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg px-4 sm:px-6">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-7">
          <Link href="/" aria-label="cellar, home">
            <Logo />
          </Link>
          <div className="ml-auto hidden items-center gap-6 text-[15px] text-muted md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#results" className="hover:text-ink">Results</a>
            <Link href="/admin" className="hover:text-ink">Admin</Link>
            <a href={REPO} className="inline-flex items-center gap-1.5 hover:text-ink">
              <GitHubMark className="size-4" /> GitHub
            </a>
          </div>
          <a
            href="#people"
            className="ml-auto inline-flex min-h-10 items-center rounded-full border border-ink bg-ink px-5 text-[15px] font-semibold text-bg transition hover:bg-bg hover:text-ink md:ml-0"
          >
            Try the demo
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-14 py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Portfolio demo · runs on two home GPUs
            </p>
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.98] text-ink sm:text-7xl">
              Support that checks its own work. <span className="block text-muted">Then shows you.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg text-ink-soft">
              An AI agent for a wine shop that looks up orders, cancels and refunds within limits, and
              checks stock. It asks before anything it can&apos;t undo, and it never says it did
              something it didn&apos;t.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#people" className="inline-flex min-h-12 items-center rounded-full border border-ink bg-ink px-6 font-semibold text-bg transition hover:bg-bg hover:text-ink">
                Try the demo
              </a>
              <a href="#how" className="inline-flex min-h-12 items-center rounded-full border border-line-strong px-6 font-semibold text-ink transition hover:border-ink">
                See how it works
              </a>
            </div>
            <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span>LangGraph</span><span>LlamaIndex</span><span>QLoRA fine-tuning</span><span>MCP</span><span>Qwen on Ollama</span>
            </p>
          </div>
          <HeroDemo />
        </section>

        <section id="people" aria-labelledby="people-h" className="scroll-mt-20 border-t border-line py-16 sm:py-20">
          <SectionHead
            id="people-h"
            eyebrow="Try it"
            title="Be one of our customers"
            text="Each has real order history. Cancel things, ask for refunds, try to break it. Orders reset regularly."
          />
          <PersonaPicker />
        </section>

        <section id="results" aria-labelledby="results-h" className="scroll-mt-20 border-t border-line py-16 sm:py-20">
          <SectionHead
            id="results-h"
            eyebrow="Results"
            title="Measured, not claimed"
            text="Every number comes from an eval run checked against the store's database, not from reading replies and deciding they look right."
          />
          <div className="grid overflow-hidden rounded-2xl border border-line sm:grid-cols-2 lg:grid-cols-4">
            {RESULTS.map((r) => (
              <div key={r.label} className="grid content-start gap-1.5 border-b border-line p-6 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(2n)]:border-r lg:last:border-r-0">
                <b className="font-display text-5xl font-extrabold tabular-nums text-ink">{r.value}</b>
                <span className="font-semibold text-ink">{r.label}</span>
                <small className="text-[13px] text-muted">{r.note}</small>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-[80ch] text-sm text-muted">
            The two failures are written up in the README: a message with two requests in it, and picking
            the right order when a newer one is still processing.
          </p>
        </section>

        <section id="how" aria-labelledby="how-h" className="scroll-mt-20 border-t border-line py-16 sm:py-20">
          <SectionHead
            id="how-h"
            eyebrow="How a turn works"
            title="Code where an action must happen. The model where judgment helps."
            text="Every message goes through the same five steps. The last one is why the agent can be trusted with your orders."
          />
          <ol className="relative grid gap-6 before:absolute before:bottom-0 before:left-[19px] before:top-0 before:w-0.5 before:bg-ink md:grid-cols-5 md:gap-0 md:before:inset-x-0 md:before:bottom-auto md:before:top-[19px] md:before:h-0.5 md:before:w-auto">
            {STEPS.map((s, i) => (
              <li key={s.name} className="relative grid grid-cols-[40px_1fr] gap-x-4 gap-y-2.5 md:grid-cols-1 md:pr-5">
                <span
                  className={`relative row-span-2 grid size-10 place-items-center rounded-full border-2 border-ink font-mono text-sm font-semibold md:row-span-1 ${
                    i === STEPS.length - 1 ? "bg-ink text-bg" : "bg-bg text-ink"
                  }`}
                >
                  {i + 1}
                </span>
                <h3 className="font-display text-2xl font-extrabold text-ink">{s.name}</h3>
                <p className="text-[15px] text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="promise-h" className="border-t border-line py-16 sm:py-20">
          <SectionHead
            id="promise-h"
            eyebrow="What it won't do"
            title="The rules it can't talk its way around"
            text="These are enforced in code, not asked for in a prompt, and each one has a test."
          />
          <div className="grid border-t border-ink sm:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title} className="grid gap-1.5 border-b border-line py-5 pr-6">
                <h3 className="font-semibold text-ink">{p.title}</h3>
                <p className="text-[15px] text-ink-soft">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Try the demo" className="pb-16 sm:pb-20">
          <div className="grid items-center gap-6 rounded-3xl bg-ink p-8 text-bg sm:p-10 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">Go ahead, cancel something.</h2>
              <p className="mt-2 opacity-75">It runs on local models on a home machine, so replies take a few seconds.</p>
            </div>
            <a href="#people" className="inline-flex min-h-12 w-fit items-center rounded-full border border-bg bg-bg px-6 font-semibold text-ink transition hover:bg-ink hover:text-bg">
              Try the demo
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Cellar is fictional. Products and sales history are real (Montgomery County, MD open data);
            customers and orders are synthetic.
          </p>
          <a href={REPO} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink">
            Source, evals and write-up <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
