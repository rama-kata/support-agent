export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export type Persona = {
  id: number;
  name: string;
  first_name: string;
  age: number;
  under_age: boolean;
  address: string;
  blurb: string;
};

export type OrderItem = { sku: string; name: string; quantity: number; unit_price: number };
export type Order = {
  id: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  created_at: string;
  shipping_address: string;
  tracking_number: string | null;
  total: number;
  items: OrderItem[];
  refunds: { amount: number; status: string; created_at: string }[];
};

export type ToolStep = {
  id: string;
  name: string;
  label: string;
  status: "running" | "ok" | "error";
  detail?: string;
};

export type Reply = {
  turn_id: string;
  text: string;
  intent: string | null;
  tools: string[];
  latency_ms: number;
  blocked: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError("The agent's server is offline right now.", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export const api = {
  personas: () => request<Persona[]>("/api/personas"),
  login: (customer_id: number) =>
    request<{ token: string; customer: Persona }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ customer_id }),
    }),
  me: (token: string) => request<{ customer: Persona; orders: Order[] }>("/api/me", { token }),
  thread: (token: string, id: string) =>
    request<{ thread_id: string; messages: { role: "customer" | "agent"; text: string; turn_id: string }[] }>(
      `/api/threads/${id}`,
      { token },
    ),
  feedback: (token: string, turn_id: string, rating: 1 | -1, comment?: string) =>
    request<{ ok: boolean }>("/api/feedback", {
      method: "POST",
      token,
      body: JSON.stringify({ turn_id, rating, comment }),
    }),
  admin: <T>(token: string, path: string, init: RequestInit = {}) =>
    request<T>(`/api/admin/${path}`, { ...init, token }),
};

export type StreamHandlers = {
  onStart?: (threadId: string) => void;
  onIntent?: (intent: string) => void;
  onGuard?: (redacted: string[]) => void;
  onToolStart?: (step: ToolStep) => void;
  onToolEnd?: (id: string, ok: boolean, detail?: string) => void;
  onReply?: (reply: Reply) => void;
  onError?: (message: string) => void;
};

/** POST a message and parse the Server-Sent Events stream (EventSource can't POST). */
export async function streamChat(
  token: string,
  message: string,
  threadId: string | null,
  h: StreamHandlers,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, thread_id: threadId }),
    });
  } catch {
    h.onError?.("The agent's server is offline right now.");
    return;
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    h.onError?.(body.detail ?? `Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || !data) continue;
      const d = JSON.parse(data);
      if (event === "start") h.onStart?.(d.thread_id);
      else if (event === "intent") h.onIntent?.(d.intent);
      else if (event === "guard") h.onGuard?.(d.redacted);
      else if (event === "tool_start")
        h.onToolStart?.({ id: d.id, name: d.name, label: d.label, status: "running" });
      else if (event === "tool_end") h.onToolEnd?.(d.id, d.ok, d.detail);
      else if (event === "reply") h.onReply?.(d);
      else if (event === "error") h.onError?.(d.message);
    }
  }
}
