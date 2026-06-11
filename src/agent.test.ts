import { test } from "node:test";
import assert from "node:assert/strict";
import { isRemote, originOf } from "./agent.ts";

type Req = Parameters<typeof isRemote>[0];
const req = (headers: Record<string, string>, remoteAddress = "127.0.0.1"): Req =>
  ({ headers, socket: { remoteAddress } }) as unknown as Req;

test("direct loopback requests are trusted (not remote)", () => {
  assert.equal(isRemote(req({}, "127.0.0.1")), false);
  assert.equal(isRemote(req({}, "::1")), false);
  assert.equal(isRemote(req({}, "::ffff:127.0.0.1")), false);
  assert.equal(isRemote(req({}, "")), false);
});

test("non-loopback socket addresses are remote", () => {
  assert.equal(isRemote(req({}, "192.168.1.50")), true);
  assert.equal(isRemote(req({}, "10.0.0.3")), true);
});

test("tunnel forwarding headers mark a request remote even from localhost", () => {
  // cloudflared (behind `vibe share`) proxies from localhost but adds these.
  assert.equal(isRemote(req({ "cf-connecting-ip": "8.8.8.8" }, "127.0.0.1")), true);
  assert.equal(isRemote(req({ "cf-ray": "abc123" }, "127.0.0.1")), true);
  assert.equal(isRemote(req({ "x-forwarded-for": "8.8.8.8" }, "127.0.0.1")), true);
  assert.equal(isRemote(req({ "x-forwarded-host": "x.trycloudflare.com" }, "127.0.0.1")), true);
  assert.equal(isRemote(req({ forwarded: "for=8.8.8.8" }, "127.0.0.1")), true);
});

type Headers = Parameters<typeof originOf>[0]["headers"];
const oreq = (headers: Record<string, string>) => ({ headers: headers as Headers });

test("originOf builds an absolute origin from the Host header locally", () => {
  assert.equal(originOf(oreq({ host: "localhost:4545" }), 4545), "http://localhost:4545");
  // no host at all → fall back to the bound port
  assert.equal(originOf(oreq({}), 4545), "http://localhost:4545");
});

test("originOf prefers the tunnel's forwarded host + proto (for absolute og:image)", () => {
  assert.equal(
    originOf(oreq({ "x-forwarded-host": "abc.trycloudflare.com", "x-forwarded-proto": "https", host: "localhost:4545" }), 4545),
    "https://abc.trycloudflare.com",
  );
  // Cloudflare sets cf-ray but not always x-forwarded-proto → still https
  assert.equal(
    originOf(oreq({ "x-forwarded-host": "abc.trycloudflare.com", "cf-ray": "x" }), 4545),
    "https://abc.trycloudflare.com",
  );
});

test("originOf rejects a host that tries to smuggle a scheme/path", () => {
  // A spoofed Host with a slash must never leak into our absolute URLs.
  assert.equal(
    originOf(oreq({ host: "evil.com/path?x=1" }), 4545),
    "http://localhost:4545",
  );
  assert.equal(
    originOf(oreq({ "x-forwarded-host": "ok.example.com space" }), 4545),
    "http://localhost:4545",
  );
});
