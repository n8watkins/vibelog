var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/keys.ts
var SNAPSHOT_KEY = "snapshot:nate";

// src/worker.ts
var LANDING_URL = "https://vibelogs.dev/";
function timingSafeEqualStr(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i) || 0;
    const cb = b.charCodeAt(i) || 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
__name(timingSafeEqualStr, "timingSafeEqualStr");
function routeKind(method, pathname) {
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (m === "POST" && p === "/publish") return "publish";
  if (m === "GET" && p === "/state.json") return "state";
  if (m === "GET" && p === "/api/profile.json") return "profile";
  if (m === "GET" && p === "/api/theme.json") return "theme";
  if (m === "GET" && (p === "/" || p === "/landing")) return "home";
  if (m === "GET" && p === "/live") return "page";
  if (m === "GET" && p === "/embed") return "embed";
  return "not_found";
}
__name(routeKind, "routeKind");
function extractState(snap, opts = {}) {
  const state = snap.state ?? {};
  const stats = state.stats;
  if (opts.showCost || !stats || typeof stats !== "object" || !("costUsd" in stats)) {
    return JSON.stringify(state);
  }
  const { costUsd: _hidden, ...publicStats } = stats;
  return JSON.stringify({ ...state, stats: publicStats });
}
__name(extractState, "extractState");
function extractProfile(snap) {
  return JSON.stringify({ profile: snap.profile ?? {} });
}
__name(extractProfile, "extractProfile");
function extractTheme(snap) {
  return JSON.stringify({ vars: snap.theme ?? {} });
}
__name(extractTheme, "extractTheme");
var EMPTY_STATE = JSON.stringify({});
var EMPTY_PROFILE = JSON.stringify({ profile: {} });
var EMPTY_THEME = JSON.stringify({ vars: {} });
var SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
function finalize(res, opts) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  if (!opts.framable) headers.set("X-Frame-Options", "DENY");
  return new Response(opts.head ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}
__name(finalize, "finalize");
var JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=30"
};
function jsonResponse(body, status = 200) {
  return new Response(body, { status, headers: JSON_HEADERS });
}
__name(jsonResponse, "jsonResponse");
async function cachedJson(request, ctx, build) {
  const hasEdgeCache = typeof caches !== "undefined" && !!caches.default;
  if (!hasEdgeCache) return jsonResponse(await build());
  const cache = caches.default;
  const keyUrl = new URL(request.url);
  keyUrl.search = "";
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = jsonResponse(await build());
  const put = cache.put(cacheKey, res.clone());
  if (ctx?.waitUntil) ctx.waitUntil(put);
  else await put;
  return res;
}
__name(cachedJson, "cachedJson");
function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(errorResponse, "errorResponse");
var MAX_BODY_BYTES = 256 * 1024;
async function handlePublish(request, env) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeEqualStr(token, env.PUBLISH_TOKEN)) {
    return errorResponse(403, "Forbidden");
  }
  const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Payload too large");
  }
  let bodyText;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse(400, "Empty body");
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          return errorResponse(413, "Payload too large");
        }
        chunks.push(value);
      }
    }
    bodyText = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.byteLength + c.byteLength);
        merged.set(acc, 0);
        merged.set(c, acc.byteLength);
        return merged;
      }, new Uint8Array(0))
    );
  } catch {
    return errorResponse(400, "Failed to read body");
  }
  let snapshot;
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || !("state" in parsed) || !("profile" in parsed) || !("theme" in parsed)) {
      return errorResponse(400, "Body must be JSON with state, profile, theme fields");
    }
    snapshot = parsed;
  } catch {
    return errorResponse(400, "Invalid JSON");
  }
  await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return new Response(null, { status: 204 });
}
__name(handlePublish, "handlePublish");
async function getSnapshot(env) {
  const raw = await env.SNAPSHOTS.get(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
__name(getSnapshot, "getSnapshot");
var worker_default = {
  // ctx is optional only so the round-trip tests can call fetch(req, env) under
  // plain Node; the Workers runtime always passes it. A 3-arg fn is assignable
  // to ExportedHandler's required-ctx signature.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const kind = routeKind(request.method, url.pathname);
    const res = await route(kind, request, env, ctx);
    return finalize(res, { head: request.method.toUpperCase() === "HEAD", framable: kind === "embed" });
  }
};
async function route(kind, request, env, ctx) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  switch (kind) {
    case "publish":
      return handlePublish(request, env);
    case "state":
      return cachedJson(request, ctx, async () => {
        const snap = await getSnapshot(env);
        return snap ? extractState(snap, { showCost: env.PUBLIC_SHOW_COST === "true" }) : EMPTY_STATE;
      });
    case "profile":
      return cachedJson(request, ctx, async () => {
        const snap = await getSnapshot(env);
        return snap ? extractProfile(snap) : EMPTY_PROFILE;
      });
    case "theme":
      return cachedJson(request, ctx, async () => {
        const snap = await getSnapshot(env);
        return snap ? extractTheme(snap) : EMPTY_THEME;
      });
    case "home":
      return Response.redirect(LANDING_URL, 301);
    case "page":
    case "embed": {
      const file = kind === "embed" ? "/embed.html" : "/live.html";
      const assetUrl = new URL(request.url);
      assetUrl.pathname = file;
      const assetReq = new Request(assetUrl.toString(), { method: "GET", headers: request.headers });
      const assetRes = await env.ASSETS.fetch(assetReq);
      const headers = new Headers(assetRes.headers);
      headers.set("Cache-Control", "public, max-age=30");
      return new Response(assetRes.body, {
        status: assetRes.status,
        headers
      });
    }
    default:
      return errorResponse(404, "Not found");
  }
}
__name(route, "route");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-OsEyrS/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-OsEyrS/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  extractProfile,
  extractState,
  extractTheme,
  finalize,
  routeKind,
  timingSafeEqualStr
};
//# sourceMappingURL=worker.js.map
