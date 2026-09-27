import { randomUUID } from "node:crypto";
import { GUIDE } from "../config";
import {
  CHIP,
  REPLY,
  SURPRISE_TYPES,
  categoriesFor,
  categoryById,
  categoryChip,
  type Chip,
  type Intent,
  type Stage,
} from "./catalog";
import { interpretDeterministic, type InterpretContext, type Interpretation } from "./interpret";
import type { PlaceCard, PlaceQuery, SearchPlaces } from "./places";

// The "Where to?" guide's state machine: intent -> category -> results ->
// confirmed. The server owns every step. Free text is only interpreted (by
// keywords, or an LLM from step 3 on) into an Interpretation; chip and card
// taps skip interpretation entirely.

export interface Destination {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GuideRequest {
  conversationId?: string;
  message?: string;
  choice?: { chipId?: string; placeId?: string };
  lat: number;
  lng: number;
}

export interface GuideResponse {
  conversationId: string;
  stage: Stage;
  reply: string;
  chips: Chip[];
  places: PlaceCard[];
  destination: Destination | null;
  /** Non-production only: who interpreted the turn ("tap" = chip/card, no interpretation). */
  provider?: string;
  latencyMs?: number;
}

export interface Turn {
  user: string;
  reply: string;
}

/** Turns free text into an Interpretation. Step 1 has only the keyword version. */
export type Interpreter = (
  message: string,
  ctx: InterpretContext,
  history: Turn[],
) => Promise<{ interpretation: Interpretation; provider: string }>;

export const deterministicInterpreter: Interpreter = async (message, ctx) => ({
  interpretation: interpretDeterministic(message, ctx),
  provider: "deterministic",
});

type Search =
  | { kind: "category"; categoryId: string; radiusMeters: number }
  | { kind: "text"; text: string; radiusMeters: number }
  | { kind: "surprise"; radiusMeters: number };

interface Conversation {
  id: string;
  stage: Stage;
  intent: Intent | null;
  lastSearch: Search | null;
  places: PlaceCard[];
  destination: Destination | null;
  history: Turn[];
  lat: number;
  lng: number;
  updatedAt: number;
  /** The last search's results, reused for an identical search within GUIDE.repeatSearchWindowMs. */
  recent: { key: string; at: number; places: PlaceCard[] } | null;
  /** Turns of one conversation run one at a time. */
  queue: Promise<unknown>;
}

export interface GuideOptions {
  searchPlaces: SearchPlaces;
  interpret?: Interpreter;
  now?: () => number;
  /** Adds provider and latencyMs to responses. */
  debug?: boolean;
}

export class DestinationGuide {
  private conversations = new Map<string, Conversation>();
  private readonly searchPlaces: SearchPlaces;
  private readonly interpret: Interpreter;
  private readonly now: () => number;
  private readonly debug: boolean;

  constructor({ searchPlaces, interpret = deterministicInterpreter, now = Date.now, debug = false }: GuideOptions) {
    this.searchPlaces = searchPlaces;
    this.interpret = interpret;
    this.now = now;
    this.debug = debug;
  }

  /** One request. Never throws for a place-search or interpretation failure. */
  async handle(req: GuideRequest): Promise<GuideResponse> {
    const started = this.now();
    this.sweep();
    let conv = req.conversationId ? this.conversations.get(req.conversationId) : undefined;
    // Unknown or expired id (e.g. after a server restart): start over with the greeting.
    const greetOnly = !conv && (req.conversationId !== undefined || !req.message?.trim());
    if (!conv) conv = this.create(req.lat, req.lng);
    const c = conv;

    const run = async () => {
      c.lat = req.lat;
      c.lng = req.lng;
      c.updatedAt = this.now();
      const { reply, provider, user } = greetOnly
        ? { reply: REPLY.greeting, provider: "tap", user: "" }
        : await this.turn(c, req);
      if (user) c.history = [...c.history, { user, reply }].slice(-GUIDE.historyTurns);
      return this.respond(c, reply, provider, started);
    };
    const result = c.queue.then(run, run);
    c.queue = result.catch(() => {});
    return result;
  }

  private create(lat: number, lng: number): Conversation {
    const conv: Conversation = {
      id: randomUUID(),
      stage: "intent",
      intent: null,
      lastSearch: null,
      places: [],
      destination: null,
      history: [],
      lat,
      lng,
      updatedAt: this.now(),
      recent: null,
      queue: Promise.resolve(),
    };
    this.conversations.set(conv.id, conv);
    return conv;
  }

  private sweep() {
    const cutoff = this.now() - GUIDE.conversationTtlMs;
    for (const [id, conv] of this.conversations) if (conv.updatedAt < cutoff) this.conversations.delete(id);
  }

  private async turn(c: Conversation, req: GuideRequest): Promise<{ reply: string; provider: string; user: string }> {
    const { chipId, placeId } = req.choice ?? {};
    if (chipId) {
      const label = this.chips(c).find((chip) => chip.id === chipId)?.label ?? chipId;
      return { reply: await this.onChip(c, chipId), provider: "tap", user: label };
    }
    if (placeId) {
      const place = c.places.find((p) => p.placeId === placeId);
      return { reply: place ? this.confirm(c, place) : REPLY.staleCard, provider: "tap", user: place?.name ?? placeId };
    }
    const message = req.message?.trim() ?? "";
    if (!message) return { reply: this.stagePrompt(c), provider: "none", user: "" };

    const ctx: InterpretContext = { stage: c.stage, intent: c.intent, placeNames: c.places.map((p) => p.name) };
    let interpreted: { interpretation: Interpretation; provider: string };
    try {
      interpreted = await this.interpret(message, ctx, c.history);
    } catch (err) {
      console.warn("[guide] interpreter failed, using keywords:", (err as Error).message);
      interpreted = await deterministicInterpreter(message, ctx, c.history);
    }
    return { reply: await this.apply(c, interpreted.interpretation), provider: interpreted.provider, user: message };
  }

  private async onChip(c: Conversation, chipId: string): Promise<string> {
    if (chipId === CHIP.restart.id) return this.restart(c);
    if (chipId === CHIP.surprise.id) return this.search(c, { kind: "surprise", radiusMeters: GUIDE.surprise.radiusMeters });
    if (chipId === CHIP.food.id || chipId === CHIP.attraction.id) {
      return this.askCategory(c, chipId === CHIP.food.id ? "food" : "attraction");
    }
    if (chipId.startsWith("category:")) {
      const category = categoryById(chipId.slice("category:".length));
      if (category) {
        c.intent = category.intent;
        return this.search(c, { kind: "category", categoryId: category.id, radiusMeters: GUIDE.searchRadiusMeters });
      }
    }
    if (chipId === CHIP.widen.id && c.lastSearch) {
      return this.search(c, { ...c.lastSearch, radiusMeters: GUIDE.widenedRadiusMeters });
    }
    if (chipId === CHIP.back.id) return this.back(c);
    return this.stagePrompt(c);
  }

  private async apply(c: Conversation, i: Interpretation): Promise<string> {
    if (i.restart) return this.restart(c);
    if (i.selection !== null && c.places.length > 0 && (c.stage === "results" || c.stage === "confirmed")) {
      const place = c.places[i.selection - 1];
      return place ? this.confirm(c, place) : REPLY.outOfRange(c.places.length);
    }
    const category = categoryById(i.category);
    if (category) {
      c.intent = category.intent;
      return this.search(c, { kind: "category", categoryId: category.id, radiusMeters: GUIDE.searchRadiusMeters });
    }
    if (i.intent === "surprise") return this.search(c, { kind: "surprise", radiusMeters: GUIDE.surprise.radiusMeters });
    if (i.intent === "food" || i.intent === "attraction") return this.askCategory(c, i.intent);
    if (i.searchText) return this.search(c, { kind: "text", text: i.searchText, radiusMeters: GUIDE.searchRadiusMeters });
    return `${REPLY.notCaught} ${this.stagePrompt(c)}`;
  }

  private restart(c: Conversation): string {
    Object.assign(c, { stage: "intent", intent: null, lastSearch: null, places: [], destination: null });
    return REPLY.greeting;
  }

  private askCategory(c: Conversation, intent: Intent): string {
    Object.assign(c, { stage: "category", intent, destination: null });
    return REPLY.askCategory[intent];
  }

  private back(c: Conversation): string {
    if (c.stage === "confirmed" && c.places.length > 0) {
      Object.assign(c, { stage: "results", destination: null });
      return this.stagePrompt(c);
    }
    if (c.stage === "results" && c.intent) return this.askCategory(c, c.intent);
    return this.restart(c);
  }

  private confirm(c: Conversation, place: PlaceCard): string {
    c.stage = "confirmed";
    c.destination = { placeId: place.placeId, name: place.name, address: place.address, lat: place.lat, lng: place.lng };
    return REPLY.confirm(place.name);
  }

  private stagePrompt(c: Conversation): string {
    switch (c.stage) {
      case "intent":
        return REPLY.greeting;
      case "category":
        return REPLY.askCategory[c.intent ?? "food"];
      case "results":
        return REPLY.pickFromResults[c.intent ?? "any"];
      case "confirmed":
        return REPLY.confirmedAlready;
    }
  }

  private toQuery(c: Conversation, search: Search): PlaceQuery {
    const base = { lat: c.lat, lng: c.lng, radiusMeters: search.radiusMeters, limit: GUIDE.resultsLimit };
    switch (search.kind) {
      case "category": {
        const category = categoryById(search.categoryId)!;
        return { ...base, types: category.types, query: category.query };
      }
      case "text": {
        // "sushi" while picking food means sushi restaurants.
        const food = c.intent === "food" && !/restaurant|food|cafe|bar|bakery/i.test(search.text);
        return { ...base, query: food ? `${search.text} restaurant` : search.text };
      }
      case "surprise":
        return {
          ...base,
          types: SURPRISE_TYPES,
          query: "top rated places",
          limit: GUIDE.surprise.limit,
          minRating: GUIDE.surprise.minRating,
          requireOpen: true,
          sortBy: "rating",
        };
    }
  }

  private noun(search: Search): string {
    if (search.kind === "category") return categoryById(search.categoryId)!.noun;
    if (search.kind === "text") return `spots for "${search.text}"`;
    return "spots open right now";
  }

  /** Runs a search and moves to results; on failure stays on the current stage. */
  private async search(c: Conversation, search: Search): Promise<string> {
    const query = this.toQuery(c, search);
    const key = JSON.stringify(query);
    let places: PlaceCard[];
    if (c.recent && c.recent.key === key && this.now() - c.recent.at < GUIDE.repeatSearchWindowMs) {
      places = c.recent.places;
    } else {
      try {
        places = await this.searchPlaces(query);
      } catch (err) {
        console.warn("[guide] place search failed:", (err as Error).message);
        // Back to the chips that lead here, so older results never look like this search's.
        Object.assign(c, { stage: c.intent ? "category" : "intent", places: [], destination: null });
        return REPLY.placesDown;
      }
      c.recent = { key, at: this.now(), places };
    }

    Object.assign(c, { stage: "results", lastSearch: search, places, destination: null });
    if (places.length === 0) return REPLY.noResults(this.noun(search));
    if (search.kind === "surprise") return REPLY.surprise(places.length);
    if (search.kind === "text") return REPLY.textResults(search.text);
    return REPLY.results(this.noun(search));
  }

  private chips(c: Conversation): Chip[] {
    switch (c.stage) {
      case "intent":
        return [CHIP.food, CHIP.attraction, CHIP.surprise];
      case "category":
        return [...categoriesFor(c.intent ?? "food").map(categoryChip), CHIP.restart];
      case "results":
        return c.places.length === 0 && c.lastSearch
          ? [CHIP.widen, CHIP.back, CHIP.restart]
          : [CHIP.back, CHIP.restart];
      case "confirmed":
        return [CHIP.otherPlace, CHIP.restart];
    }
  }

  private respond(c: Conversation, reply: string, provider: string, started: number): GuideResponse {
    const res: GuideResponse = {
      conversationId: c.id,
      stage: c.stage,
      reply,
      chips: this.chips(c),
      places: c.stage === "results" ? c.places : [],
      destination: c.destination,
    };
    if (this.debug) Object.assign(res, { provider, latencyMs: this.now() - started });
    return res;
  }
}
