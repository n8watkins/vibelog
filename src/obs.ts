import { createHash } from "node:crypto";

/**
 * Minimal obs-websocket v5 client to learn exactly when streaming starts/stops.
 * Fully local, no API keys — VibeLog connects to OBS's built-in websocket
 * (Tools → WebSocket Server Settings, default ws://127.0.0.1:4455) and gets
 * authoritative live state + duration. Uses Node 22's global WebSocket, so no
 * dependency. Reconnects forever, silently, so it "just works" once OBS is up.
 *
 * Protocol: Hello(op 0) → Identify(op 1, with sha256 auth if a password is set)
 * → Identified(op 2). We subscribe to the Outputs event category and react to
 * StreamStateChanged(op 5); on connect we also request GetStreamStatus(op 6).
 */

export type OBSHandle = { close: () => void };

const OUTPUTS_EVENTS = 1 << 6; // EventSubscription.Outputs

export function connectOBS(opts: {
  url: string;
  password?: string;
  onLive: (active: boolean) => void;
  onLog?: (msg: string) => void;
  reconnectMs?: number;
}): OBSHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const reconnectMs = opts.reconnectMs ?? 10_000;
  const log = opts.onLog ?? (() => {});

  function authString(salt: string, challenge: string, password: string): string {
    const secret = createHash("sha256").update(password + salt).digest("base64");
    return createHash("sha256").update(secret + challenge).digest("base64");
  }

  function schedule(): void {
    if (closed || retry) return;
    retry = setTimeout(() => {
      retry = null;
      open();
    }, reconnectMs);
  }

  function send(obj: unknown): void {
    try {
      ws?.send(JSON.stringify(obj));
    } catch {
      // socket not open — the close handler will reconnect
    }
  }

  function handle(raw: string): void {
    let msg: { op?: number; d?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const d = (msg.d ?? {}) as Record<string, any>;
    if (msg.op === 0) {
      const identify: { op: 1; d: Record<string, unknown> } = {
        op: 1,
        d: { rpcVersion: 1, eventSubscriptions: OUTPUTS_EVENTS },
      };
      if (d.authentication && opts.password) {
        identify.d.authentication = authString(d.authentication.salt, d.authentication.challenge, opts.password);
      }
      send(identify);
    } else if (msg.op === 2) {
      log("connected to OBS");
      send({ op: 6, d: { requestType: "GetStreamStatus", requestId: "init" } });
    } else if (msg.op === 7) {
      if (d.requestId === "init") opts.onLive(!!d.responseData?.outputActive);
    } else if (msg.op === 5) {
      if (d.eventType === "StreamStateChanged") opts.onLive(!!d.eventData?.outputActive);
    }
  }

  function open(): void {
    if (closed) return;
    try {
      ws = new WebSocket(opts.url);
    } catch {
      return schedule();
    }
    ws.addEventListener("message", (ev) => handle(String((ev as MessageEvent).data)));
    ws.addEventListener("close", () => schedule());
    ws.addEventListener("error", () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    });
  }

  open();
  return {
    close: () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
