import { test } from "node:test";
import assert from "node:assert/strict";
import { isRemote } from "./agent.ts";

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
