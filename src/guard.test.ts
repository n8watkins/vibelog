import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWrite, hostnameOf, isAllowedHost } from "./guard.ts";

test("hostnameOf strips the port and IPv6 brackets and rejects junk", () => {
  assert.equal(hostnameOf("localhost:4545"), "localhost");
  assert.equal(hostnameOf("LOCALHOST"), "localhost");
  assert.equal(hostnameOf("[::1]:4545"), "::1");
  assert.equal(hostnameOf("example.com."), "example.com");
  assert.equal(hostnameOf("evil.com/path"), null);
  assert.equal(hostnameOf("a b"), null);
  assert.equal(hostnameOf("[nope]:1"), null);
});

test("loopback names and IP literals are allowed hosts", () => {
  for (const h of ["localhost:4545", "127.0.0.1:4545", "[::1]:4545", "vibe.localhost:4545", "192.168.1.20:4545", "172.29.1.5"]) {
    assert.equal(isAllowedHost(h), true, h);
  }
});

test("a DNS-rebinding hostname is not an allowed host", () => {
  assert.equal(isAllowedHost("rebind.evil.example"), false);
  assert.equal(isAllowedHost("rebind.evil.example:4545"), false);
  assert.equal(isAllowedHost("localhost.evil.example:4545"), false);
  assert.equal(isAllowedHost("evil.com/x"), false);
});

test("hosts listed in config allowedHosts are allowed", () => {
  assert.equal(isAllowedHost("studio-pc.lan:4545", ["studio-pc.lan"]), true);
  assert.equal(isAllowedHost("STUDIO-PC.LAN", ["studio-pc.lan."]), true);
  assert.equal(isAllowedHost("other.lan", ["studio-pc.lan"]), false);
});

test("a missing Host (non-browser HTTP/1.0 tool) passes", () => {
  assert.equal(isAllowedHost(undefined), true);
});

const json = { "content-type": "application/json", host: "127.0.0.1:4545" };

test("CLI / hook / MCP writes (JSON, no Origin) are allowed", () => {
  assert.equal(checkWrite(json), null);
  assert.equal(checkWrite({ ...json, "content-type": "application/json; charset=utf-8" }), null);
});

test("the dashboard's own same-origin write is allowed", () => {
  assert.equal(
    checkWrite({ "content-type": "application/json", host: "localhost:4545", origin: "http://localhost:4545", "sec-fetch-site": "same-origin" }),
    null,
  );
});

test("a CORS-simple text/plain write is refused before it is parsed", () => {
  assert.deepEqual(checkWrite({ ...json, "content-type": "text/plain" }), { status: 415, error: "writes must be application/json" });
  assert.equal(checkWrite({ host: "127.0.0.1:4545" })?.status, 415);
  assert.equal(checkWrite({ ...json, "content-type": "application/x-www-form-urlencoded" })?.status, 415);
});

test("a cross-site or foreign-origin write is refused even as JSON", () => {
  assert.equal(checkWrite({ ...json, origin: "https://evil.example" })?.status, 403);
  assert.equal(checkWrite({ ...json, origin: "null" })?.status, 403);
  // Another local dev server is same-site but not same-origin.
  assert.equal(checkWrite({ ...json, origin: "http://127.0.0.1:3000" })?.status, 403);
  assert.equal(checkWrite({ ...json, "sec-fetch-site": "cross-site" })?.status, 403);
  assert.equal(checkWrite({ ...json, "sec-fetch-site": "same-site" })?.status, 403);
});
