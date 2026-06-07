import { test } from "node:test";
import assert from "node:assert/strict";
import { sumUsage, aggregate, labelProjects, type Row } from "./claude-projects.ts";

test("sumUsage adds all four token kinds", () => {
  assert.equal(
    sumUsage({
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 5,
      cache_read_input_tokens: 100,
    }),
    135,
  );
  assert.equal(sumUsage(undefined), 0);
  assert.equal(sumUsage({ input_tokens: 7 }), 7);
});

const row = (over: Partial<Row>): Row => ({
  cwd: "/home/u/proj-a",
  file: "s1.jsonl",
  usage: { output_tokens: 100 },
  ...over,
});

test("groups by cwd and sorts by tokens desc", () => {
  const out = aggregate([
    row({ cwd: "/home/u/proj-a", usage: { output_tokens: 100 } }),
    row({ cwd: "/home/u/proj-b", usage: { output_tokens: 300 } }),
    row({ cwd: "/home/u/proj-a", usage: { output_tokens: 50 } }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.project, "proj-b");
  assert.equal(out[0]!.tokens, 300);
  assert.equal(out[1]!.project, "proj-a");
  assert.equal(out[1]!.tokens, 150);
});

test("counts distinct transcript files as sessions", () => {
  const out = aggregate([
    row({ file: "s1.jsonl" }),
    row({ file: "s2.jsonl" }),
    row({ file: "s2.jsonl" }),
  ]);
  assert.equal(out[0]!.sessions, 2);
});

test("dedupes by id:requestId", () => {
  const out = aggregate([
    row({ id: "m1", requestId: "r1", usage: { output_tokens: 100 } }),
    row({ id: "m1", requestId: "r1", usage: { output_tokens: 100 } }), // dup
    row({ id: "m2", requestId: "r1", usage: { output_tokens: 100 } }),
  ]);
  assert.equal(out[0]!.tokens, 200);
});

test("labelProjects uses shortest unique path suffix", () => {
  const labels = labelProjects([
    "/home/u/proj-a",
    "/home/u/tools/tube-vault/extension",
    "/home/u/tools/extensions/tube-vault/extension",
    "/home/u/tools/extensions/piper-tts/extension",
  ]);
  assert.equal(labels.get("/home/u/proj-a"), "proj-a");
  assert.equal(labels.get("/home/u/tools/extensions/piper-tts/extension"), "piper-tts/extension");
  assert.equal(labels.get("/home/u/tools/tube-vault/extension"), "tools/tube-vault/extension");
  assert.equal(
    labels.get("/home/u/tools/extensions/tube-vault/extension"),
    "extensions/tube-vault/extension",
  );
});

test("since filter excludes older entries (UTC date)", () => {
  const out = aggregate(
    [
      row({ id: "a", timestamp: "2026-06-01T10:00:00Z", usage: { output_tokens: 100 } }),
      row({ id: "b", timestamp: "2026-06-05T10:00:00Z", usage: { output_tokens: 200 } }),
    ],
    "2026-06-05",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.tokens, 200);
});
