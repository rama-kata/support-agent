"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { api, type AgentStatus } from "@/lib/api";

const LABELS: Record<AgentStatus, string> = {
  ready: "Agent online",
  slow: "Running slowly",
  offline: "Agent offline",
};
const DOTS: Record<AgentStatus, string> = {
  ready: "bg-live-on",
  slow: "bg-live-slow",
  offline: "bg-live-off",
};

/** Status pill with the site's only colored element: green, amber or red dot. */
export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span
      role="status"
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink",
        className,
      )}
    >
      <span className={clsx("size-2 rounded-full", DOTS[status])} aria-hidden />
      {LABELS[status]}
    </span>
  );
}

/** The badge, fetching the status itself (for pages that don't already have it). */
export function LiveAgentStatus({ className }: { className?: string }) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  useEffect(() => {
    api
      .health()
      .then((h) => setStatus(h.agent))
      .catch(() => setStatus("offline"));
  }, []);
  return status ? <AgentStatusBadge status={status} className={className} /> : null;
}
