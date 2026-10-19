"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SKILL = path.join(__dirname, "..", ".grok", "skills", "harvest-agent-skills", "SKILL.md");
const NEEDLE = "a-search MRB: when tip pin suites are green and CI red is only npm-run-synth / cdk.out lock flakes, leave MERGE armed and DONE PASS; do not fold a synth-lock fix onto a skill-pin tip";

test("mrb3641 hostile synth-flake lesson contiguous", () => {
  const raw = fs.readFileSync(SKILL);
  assert.ok(!raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
  const text = raw.toString("utf8");
  assert.ok(text.includes(NEEDLE));
  assert.ok(!/^<<<<<<<(?: |$)/m.test(text));
  assert.ok(!/^>>>>>>>(?: |$)/m.test(text));
});