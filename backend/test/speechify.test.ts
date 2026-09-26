import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSsml, escapeXml } from "../src/services/speechify";

test("escapeXml escapes & < > \" '", () => {
  assert.equal(
    escapeXml(`Bass & Co <Tom's "Grill"> `),
    "Bass &amp; Co &lt;Tom&apos;s &quot;Grill&quot;&gt; ",
  );
});

test("escapeXml escapes & first, so entities are not double-mangled", () => {
  assert.equal(escapeXml("&amp;"), "&amp;amp;");
});

test("buildSsml wraps text in prosody and emotion style", () => {
  assert.equal(
    buildSsml("On your right is Bass & Co!", { rate: "+10%", emotion: "energetic" }),
    '<speak><prosody rate="+10%"><speechify:style emotion="energetic">' +
      "On your right is Bass &amp; Co!</speechify:style></prosody></speak>",
  );
});

test("buildSsml omits the style wrapper when emotion is empty", () => {
  const ssml = buildSsml("Coming up is <Joe's>", { rate: "+10%", emotion: "" });
  assert.equal(ssml, '<speak><prosody rate="+10%">Coming up is &lt;Joe&apos;s&gt;</prosody></speak>');
  assert.ok(!ssml.includes("speechify:style"));
});
