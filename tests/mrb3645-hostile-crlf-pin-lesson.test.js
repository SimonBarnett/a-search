"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SKILL = path.join(__dirname, "..", ".grok", "skills", "harvest-agent-skills", "SKILL.md");
const NEEDLE = "a-search FR #3611: harvest SKILL hostile pins must use includes() or newline-normalize before assert.match; do not PASS when the pin suite is red on CRLF files";

test("mrb3645 hostile CRLF pin lesson contiguous", () => {
  const raw = fs.readFileSync(SKILL);
  assert.ok(!raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
  const text = raw.toString("utf8");
  assert.ok(text.includes(NEEDLE));
  assert.ok(!text.includes("<<<<<<<"));
});