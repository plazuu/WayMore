import assert from "node:assert/strict";
import { test } from "node:test";
import { importanceScore, tierOf } from "../src/live/importance";
import type { Place } from "../src/types";

function p(name: string, category?: string, rating?: number): Place {
  return { id: name, name, kind: "landmark", lat: 0, lng: 0, category, rating };
}

test("tiers: heritage sights, local spots, chains", () => {
  assert.equal(tierOf(p("Everglades National Park", "National park")), "heritage");
  assert.equal(tierOf(p("Freedom Tower", "historic site")), "heritage");
  assert.equal(tierOf(p("Kaseya Center", "arena")), "heritage");
  assert.equal(tierOf(p("Bayside Marketplace", "shopping and dining")), "local");
  assert.equal(tierOf(p("Versailles", "Cuban")), "local");
  assert.equal(tierOf(p("Taco Bell", "Mexican")), "chain");
  assert.equal(tierOf(p("McDonald’s", "Burger")), "chain");
  assert.equal(tierOf(p("Joe's Corner", "Gas station")), "chain");
  assert.equal(tierOf(p("Walgreens", "Pharmacy")), "chain");
});

test("a chain name beats a heritage word in it", () => {
  assert.equal(tierOf(p("Taco Bell Cantina Tower Plaza")), "chain");
});

test("chain words don't match inside other words", () => {
  assert.equal(tierOf(p("Shellbank Park", "Park")), "heritage");
  assert.equal(tierOf(p("Targeted Coffee", "Coffee shop")), "local");
});

test("a 4.2 heritage place outscores a 5.0 chain at any distance in the trigger window", () => {
  for (const far of [0, 100, 250, 5000]) {
    assert.ok(
      importanceScore(p("Everglades", "National park", 4.2), far) > importanceScore(p("Taco Bell", "Fast food", 5), 0),
      `heritage at ${far} m should win`,
    );
  }
});

test("score follows the formula; a missing rating counts as 4.0", () => {
  // heritage 3.0 * 2 + 4.5 * 0.5 - 100 * 0.005
  assert.equal(importanceScore(p("Museum X", "Museum", 4.5), 100), 6 + 2.25 - 0.5);
  assert.equal(importanceScore(p("Museum X", "Museum"), 0), 6 + 2);
});

test("within a tier, the nearer place wins at equal ratings", () => {
  assert.ok(importanceScore(p("Park A", "Park", 4.5), 50) > importanceScore(p("Park B", "Park", 4.5), 150));
});
