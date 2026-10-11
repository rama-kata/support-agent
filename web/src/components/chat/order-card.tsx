import type { CardOrder } from "@/lib/api";
import { StatusPill } from "@/components/ui/brand";

const money = (n: number) => `$${n.toFixed(2)}`;

/** Catalog names are distributor shorthand in capitals ("CK MONDAVI CAB - 1.5L"). */
export function itemName(raw: string) {
  const [name, size] = raw.split(" - ");
  const pretty = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return size ? `${pretty} · ${size}` : pretty;
}

function placed(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The order the agent looked at or changed, as it is in the database right now. */
export function OrderCard({ order }: { order: CardOrder }) {
  const cancelled = order.status === "cancelled";
  const refund = order.refunds.at(-1);
  return (
    <div className="max-w-md overflow-hidden rounded-2xl border border-line bg-surface" aria-label={`Order ${order.id}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="font-mono text-sm font-medium text-ink">{order.id}</span>
        <span className="text-xs text-muted">Placed {placed(order.placed)}</span>
      </div>
      <ul className={cancelled ? "text-muted line-through decoration-1" : "text-ink"}>
        {order.items.map((i) => (
          <li key={i.name} className="flex justify-between gap-4 px-4 py-2 text-[15px]">
            <span className="min-w-0">
              {itemName(i.name)}
              {i.quantity > 1 && <span className="text-muted"> × {i.quantity}</span>}
            </span>
            <span className="tabular-nums">{money(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line-strong px-4 py-2.5 text-sm">
        <span className="text-muted">
          {refund
            ? `Refund ${money(refund.amount)} · ${refund.status.replace("_", " ")}`
            : order.tracking
              ? <>Tracking <span className="font-mono text-ink">{order.tracking}</span></>
              : `Total ${money(order.total)}`}
        </span>
        <StatusPill status={order.status} />
      </div>
    </div>
  );
}
