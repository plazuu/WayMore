import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanScript,
  countWords,
  durationHint,
  passesGuardrails,
  templateLine,
} from "../src/narration/scriptWriter";
import type { Place } from "../src/types";

const kaseya: Place = {
  id: "kaseya",
  name: "Kaseya Center",
  kind: "landmark",
  tagline: "Home of the Miami Heat",
  lat: 25.78,
  lng: -80.19,
  side: "right",
};

test("cleanScript strips markdown and caps a 60-word string at the last full sentence", () => {
  const sentence = "On your right is the **Kaseya Center** where the Miami Heat play every season.";
  // 14 words per sentence; four sentences plus a 4-word tail = 60 words.
  const body = `${sentence} ${sentence} ${sentence} ${sentence} And that's not all`;
  assert.equal(countWords(body), 60);
  const raw = "```markdown\n## Narration\n> \"" + body + "\" 🏀\n```";

  const out = cleanScript(raw);
  assert.ok(!/[*#`>"]/.test(out), `markdown left in: ${out}`);
  assert.ok(!out.includes("🏀"));
  assert.ok(countWords(out) <= 40, `too long: ${countWords(out)} words`);
  assert.ok(out.endsWith("."), "should end at a sentence boundary");
  assert.equal(out, [1, 2].map(() => sentence.replace(/\*\*/g, "")).join(" "));
});

test("cleanScript keeps apostrophes, drops parentheticals, keeps only one exclamation", () => {
  assert.equal(
    cleanScript("It's huge (really huge)! Wow! Go Heat!"),
    "It's huge! Wow. Go Heat.",
  );
});

test("cleanScript without sentence breaks cuts at 40 words and adds a period", () => {
  const out = cleanScript(Array.from({ length: 50 }, (_, i) => `w${i}`).join(" "));
  assert.equal(countWords(out), 40);
  assert.ok(out.endsWith("w39."));
});

test("templateLine matches the documented example", () => {
  assert.equal(templateLine(kaseya), "On your right is Kaseya Center, home of the Miami Heat.");
  assert.equal(
    templateLine({ ...kaseya, side: undefined, tagline: undefined }),
    "Coming up is Kaseya Center.",
  );
  assert.equal(
    templateLine({ ...kaseya, name: "Joe's Stone Crab", kind: "restaurant", tagline: undefined, side: "left" }),
    "On your left is Joe's Stone Crab, a great food stop if you're hungry.",
  );
});

test("passesGuardrails requires the name, a minimum length, and no trailing question", () => {
  assert.ok(passesGuardrails("On your right is the Kaseya Center, home of the Heat!", kaseya));
  assert.ok(!passesGuardrails("On your right is a big arena where basketball happens.", kaseya));
  assert.ok(!passesGuardrails("Kaseya Center!", kaseya));
  assert.ok(!passesGuardrails("On your right is Kaseya Center, ever been to a game?", kaseya));
});

test("passesGuardrails accepts spelled-out street abbreviations in the name", () => {
  const cafe: Place = { ...kaseya, name: "Versailles on SW 8th St", kind: "restaurant" };
  assert.ok(passesGuardrails("Coming up on your left is Versailles on SW 8th Street, a Cuban classic.", cafe));
  const blvd: Place = { ...kaseya, name: "Biscayne Blvd Park" };
  assert.ok(passesGuardrails("On your right is Biscayne Boulevard Park, right by the bay.", blvd));
});

test("durationHint is words / 2.86", () => {
  assert.equal(durationHint(Array(20).fill("w").join(" ")), 7);
});
