import { vi } from "vitest";

export type Call = { method: string; url: string; body: unknown };
type Reply = { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
type Handler = (call: Call) => Reply | undefined;

/**
 * Stubs global fetch with a router: the first handler returning a reply wins. Every call is
 * recorded so tests can assert which requests were (not) made.
 */
export function mockFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply = await handler(call);
    if (!reply) return new Response(JSON.stringify({ error: `unmocked ${call.method} ${call.url}` }), { status: 500 });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

/** A promise that the test resolves later, to observe state while a request is in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
