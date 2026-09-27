import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import type { Interpreter } from "../src/guide/flow";
import { deterministicInterpreter } from "../src/guide/flow";
import type { PlaceCard, PlaceQuery } from "../src/guide/places";

const MIAMI = { lat: 25.7617, lng: -80.1918 };

const card = (n: number, name = `Place ${n}`): PlaceCard => ({
  placeId: `p${n}`,
  name,
  address: `${n} Main St, Miami, FL`,
  lat: MIAMI.lat + n / 1000,
  lng: MIAMI.lng,
  distanceMeters: n * 100,
  rating: 4.5,
  openNow: true,
});

const FIVE = [card(1, "Hutong Miami"), card(2, "Novikov Miami"), card(3), card(4), card(5)];

interface SetupOptions {
  results?: (q: PlaceQuery) => PlaceCard[] | Promise<PlaceCard[]>;
  interpret?: Interpreter;
}

function setup({ results = () => FIVE, interpret }: SetupOptions = {}) {
  const queries: PlaceQuery[] = [];
  let interpretCalls = 0;
  let clock = 1_000_000;
  const counting: Interpreter = async (...args) => {
    interpretCalls++;
    return (interpret ?? deterministicInterpreter)(...args);
  };
  const app = createApp({
    guide: {
      searchPlaces: async (q) => {
        queries.push(q);
        return results(q);
      },
      interpret: counting,
      now: () => clock,
      debug: true,
    },
  });
  let conversationId: string | undefined;
  const send = async (body: Record<string, unknown> = {}) => {
    const res = await request(app)
      .post("/guide/destination")
      .send({ conversationId, ...MIAMI, ...body })
      .expect(200);
    conversationId = res.body.conversationId;
    return res.body;
  };
  return {
    app,
    queries,
    send,
    say: (message: string) => send({ message }),
    tap: (chipId: string) => send({ choice: { chipId } }),
    pick: (placeId: string) => send({ choice: { placeId } }),
    interpretCalls: () => interpretCalls,
    advance: (ms: number) => {
      clock += ms;
    },
    forget: () => {
      conversationId = undefined;
    },
  };
}

const ids = (items: { id?: string; placeId?: string }[]) => items.map((i) => i.id ?? i.placeId);

test("first call returns the greeting and the intent chips", async () => {
  const g = setup();
  const res = await g.send();
  assert.equal(res.stage, "intent");
  assert.equal(res.reply, "Hey! Are you hungry, or looking for something to see?");
  assert.deepEqual(res.chips, [
    { id: "intent:food", label: "Hungry" },
    { id: "intent:attraction", label: "Something to see" },
    { id: "intent:surprise", label: "Surprise me" },
  ]);
  assert.deepEqual(res.places, []);
  assert.equal(res.destination, null);
  assert.equal(typeof res.conversationId, "string");
  assert.equal(typeof res.latencyMs, "number");
});

test("an unknown or expired conversationId starts over with the greeting, never 404", async () => {
  const g = setup();
  const res = await g.send({ conversationId: "from-before-a-restart", message: "chinese" });
  assert.equal(res.reply, "Hey! Are you hungry, or looking for something to see?");
  assert.notEqual(res.conversationId, "from-before-a-restart");
  assert.equal(g.queries.length, 0);

  await g.say("hungry");
  g.advance(31 * 60 * 1000);
  const expired = await g.say("chinese");
  assert.equal(expired.stage, "intent");
  assert.equal(expired.reply, "Hey! Are you hungry, or looking for something to see?");
});

test("missing or invalid location: 400 location_required", async () => {
  const { app } = setup();
  const res = await request(app).post("/guide/destination").send({ message: "hungry" }).expect(400);
  assert.equal(res.body.error, "location_required");
  assert.equal(typeof res.body.message, "string");
  await request(app).post("/guide/destination").send({ lat: 95, lng: 0 }).expect(400);
  const long = await request(app).post("/guide/destination").send({ ...MIAMI, message: "x".repeat(501) }).expect(400);
  assert.equal(long.body.error, "message_too_long");
});

test("hungry -> cuisine chips; chinese -> up to 5 places near the user", async () => {
  const g = setup();
  await g.send();
  const hungry = await g.say("I'm hungry");
  assert.equal(hungry.stage, "category");
  assert.equal(hungry.reply, "Nice! What are you in the mood for?");
  assert.deepEqual(ids(hungry.chips), [
    "category:cuban",
    "category:chinese",
    "category:mexican",
    "category:italian",
    "category:any-food",
    "restart",
  ]);

  const chinese = await g.say("chinese");
  assert.equal(chinese.stage, "results");
  assert.equal(chinese.reply, "Here are the closest great Chinese spots:");
  assert.deepEqual(ids(chinese.places), ["p1", "p2", "p3", "p4", "p5"]);
  assert.deepEqual(g.queries[0], {
    ...MIAMI,
    radiusMeters: 3000,
    limit: 5,
    types: ["chinese_restaurant"],
    query: "chinese restaurant",
  });
  assert.equal(chinese.provider, "deterministic");
});

test("chip and card taps are deterministic and never call the interpreter", async () => {
  const g = setup();
  await g.send();
  const food = await g.tap("intent:food");
  assert.equal(food.stage, "category");
  assert.equal(food.provider, "tap");
  await g.tap("category:chinese");
  const picked = await g.pick("p2");
  assert.equal(picked.stage, "confirmed");
  assert.equal(picked.reply, "Great choice, setting your destination to Novikov Miami.");
  assert.deepEqual(picked.destination, {
    placeId: "p2",
    name: "Novikov Miami",
    address: "2 Main St, Miami, FL",
    lat: FIVE[1].lat,
    lng: FIVE[1].lng,
  });
  assert.deepEqual(ids(picked.chips), ["back", "restart"]);
  assert.equal(g.interpretCalls(), 0);
});

test('typing "the second one" (or a name) sets the destination like a tap', async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  await g.tap("category:chinese");
  const second = await g.say("the second one");
  assert.equal(second.destination.placeId, "p2");
  assert.equal(second.reply, "Great choice, setting your destination to Novikov Miami.");

  const changed = await g.say("actually hutong");
  assert.equal(changed.destination.placeId, "p1");

  const tooFar = await g.say("number 9");
  assert.match(tooFar.reply, /only got 5 options/);
});

test('"start over" resets to the greeting', async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  await g.tap("category:chinese");
  const res = await g.say("let's start over");
  assert.equal(res.stage, "intent");
  assert.equal(res.reply, "Hey! Are you hungry, or looking for something to see?");
  assert.deepEqual(res.places, []);
  assert.equal(res.destination, null);
});

test('free text like "sushi" at the results stage searches Places for it', async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  await g.tap("category:chinese");
  const res = await g.say("sushi");
  assert.equal(res.stage, "results");
  assert.equal(res.reply, `Here's what I found for "sushi":`);
  assert.equal(g.queries[1].query, "sushi restaurant");
  assert.equal(g.queries[1].types, undefined);
});

test("switching intent mid-flow: a museum while picking food", async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  const res = await g.say("actually, a museum");
  assert.equal(res.reply, "Here are the closest great museums:");
  assert.deepEqual(g.queries[0].types, ["museum", "art_gallery"]);
  assert.deepEqual(ids(res.chips), ["back", "restart"]);
});

test("surprise me: top-rated open places within 5 km", async () => {
  const g = setup({ results: () => FIVE.slice(0, 3) });
  await g.send();
  const res = await g.tap("intent:surprise");
  assert.equal(res.stage, "results");
  assert.match(res.reply, /3 top-rated spots open right now/);
  assert.deepEqual(g.queries[0], {
    ...MIAMI,
    radiusMeters: 5000,
    limit: 3,
    types: ["restaurant", "tourist_attraction", "museum", "park"],
    query: "top rated places",
    minRating: 4.5,
    requireOpen: true,
    sortBy: "rating",
  });
});

test("no results: says so, offers to search farther, and widening searches 12 km", async () => {
  const g = setup({ results: (q) => (q.radiusMeters > 3000 ? [card(7)] : []) });
  await g.send();
  await g.tap("intent:attraction");
  const none = await g.tap("category:beaches");
  assert.equal(none.reply, "I couldn't find any great beaches nearby. Want me to search farther, or try something else?");
  assert.deepEqual(ids(none.chips), ["widen", "back", "restart"]);
  const wider = await g.tap("widen");
  assert.equal(g.queries[1].radiusMeters, 12_000);
  assert.deepEqual(ids(wider.places), ["p7"]);
});

test("place search failure: friendly reply, back to the chips, no 5xx", async () => {
  const g = setup({
    results: () => {
      throw new Error("server down");
    },
  });
  await g.send();
  await g.tap("intent:food");
  const res = await g.tap("category:chinese");
  assert.equal(res.reply, "I can't reach the map right now — try a chip.");
  assert.equal(res.stage, "category");
  assert.deepEqual(res.places, []);
  assert.ok(res.chips.some((c: { id: string }) => c.id === "category:chinese"));
});

test("a repeated identical search within 2 s reuses its results; later it searches again", async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  await g.tap("category:chinese");
  await g.tap("back");
  await g.tap("category:chinese");
  assert.equal(g.queries.length, 1);
  g.advance(2500);
  await g.tap("back");
  await g.tap("category:chinese");
  assert.equal(g.queries.length, 2);
});

test("a different search is never answered with the previous results, even when sent at once", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const g = setup({
    results: async (q) => {
      if (q.types?.[0] === "chinese_restaurant") await gate;
      return q.types?.[0] === "chinese_restaurant" ? [card(1)] : [card(2)];
    },
  });
  const first = await g.send();
  await g.tap("intent:food");
  const chinese = g.tap("category:chinese");
  const mexican = g.send({ conversationId: first.conversationId, choice: { chipId: "category:mexican" } });
  await new Promise((r) => setTimeout(r, 20));
  release();
  const [a, b] = await Promise.all([chinese, mexican]);
  assert.deepEqual(ids(a.places), ["p1"]);
  assert.deepEqual(ids(b.places), ["p2"]);
  assert.equal(b.reply, "Here are the closest great Mexican spots:");
});

test("a card that isn't in the current results doesn't set a destination", async () => {
  const g = setup();
  await g.send();
  await g.tap("intent:food");
  await g.tap("category:chinese");
  const res = await g.pick("somewhere-else");
  assert.equal(res.destination, null);
  assert.equal(res.stage, "results");
  assert.match(res.reply, /isn't in my list/);
});

test("small talk and empty messages re-ask the current question", async () => {
  const g = setup();
  await g.send();
  const hi = await g.say("hello");
  assert.equal(hi.reply, "Sorry, I didn't catch that. Hey! Are you hungry, or looking for something to see?");
  assert.equal(g.queries.length, 0);
});
