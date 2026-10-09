import type { createClient } from "@supabase/supabase-js";

/**
 * No-op WebSocket transport for server-side Supabase clients.
 *
 * supabase-js ALWAYS constructs a RealtimeClient, and realtime-js resolves a
 * global `WebSocket` at construction time — one Node only ships from 22+.
 * On Node 18 or 20 (this repo's floor) `createClient()` therefore throws
 * before a single query can run, which would take down every page instead of
 * letting the app fall back to demo mode. Passing a transport skips that
 * lookup entirely (realtime-js: `options?.transport ?? getWebSocketConstructor()`).
 *
 * DigSync never subscribes to a realtime channel — it only issues PostgREST
 * queries — so an instance that never connects is exactly right, and this
 * avoids adding a `ws` dependency for a feature we do not use.
 */

type Transport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>["realtime"]
>["transport"];

/** Behaves like a socket that is already closed and can never open. */
class NoopWebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url: string;
  readonly protocol = "";

  onopen: unknown = null;
  onmessage: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;

  constructor(address: string | URL) {
    this.url = String(address);
  }

  close(): void {
    /* already closed */
  }
  send(): void {
    /* a realtime subscription would never have been opened */
  }
  addEventListener(): void {
    /* no events are ever dispatched */
  }
  removeEventListener(): void {
    /* nothing was ever added */
  }
  dispatchEvent(): boolean {
    return false;
  }
}

export const NOOP_WEBSOCKET_TRANSPORT = NoopWebSocket as unknown as Transport;
