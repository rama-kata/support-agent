import { Wine } from "lucide-react";
import clsx from "clsx";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-wine text-wine-ink shadow-card">
        <Wine className="size-4" strokeWidth={2.2} aria-hidden />
      </span>
      {!compact && (
        <span className="font-display text-[1.15rem] font-semibold tracking-tight text-ink">
          Cellar <span className="text-gold">&amp;</span> Co.
        </span>
      )}
    </span>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const STATUS_STYLES: Record<string, string> = {
  processing: "bg-gold-soft text-gold",
  shipped: "bg-wine-soft text-wine",
  delivered: "bg-ok-soft text-ok",
  cancelled: "bg-surface-2 text-muted line-through decoration-1",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize tracking-wide",
        STATUS_STYLES[status] ?? "bg-surface-2 text-muted",
      )}
    >
      {status}
    </span>
  );
}
