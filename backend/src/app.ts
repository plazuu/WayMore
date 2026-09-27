import cors from "cors";
import express from "express";
import { llmConfig, ttsConfig } from "./config";
import type { ChatLlm } from "./live/chat";
import { SessionStore, type SessionStoreOptions } from "./live/session";
import { devRouter } from "./live/demoPath";
import { DestinationGuide, type GuideOptions } from "./guide/flow";
import { searchPlacesViaServer } from "./guide/places";
import { createGuideRouter } from "./routes/guide";
import { narrationRouter } from "./routes/narration";
import { getIntroNarration } from "./narration/intro";
import { audioRouter, createTourRouter, tourErrorHandler } from "./routes/tour";

export interface AppOptions extends SessionStoreOptions {
  /** Pass a store to inspect sessions from outside (replay script); otherwise one is created. */
  store?: SessionStore;
  chatLlm?: ChatLlm;
  chatTimeoutMs?: number;
  /** "Where to?" guide overrides (tests): place search, interpreter, clock. */
  guide?: Partial<GuideOptions>;
}

// Narration service: live guide (/tour/*), chat, pregenerated narration
// (/narration, used by the current app), the cached audio (/audio) and the
// "Where to?" destination guide (/guide).
// The app reaches it through server/'s proxy; route search lives in server/.
export function createApp({ store, now, narrate, chatLlm, chatTimeoutMs, guide }: AppOptions = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    const llm = llmConfig();
    const tts = ttsConfig();
    res.json({
      status: "ok",
      llm: { narrationModel: llm.narrationModel, chatModel: llm.chatModel, mock: llm.mock },
      tts: { provider: tts.provider, mock: tts.mock },
    });
  });

  app.use(narrationRouter);
  app.use(audioRouter);
  app.use(createTourRouter({ store: store ?? new SessionStore({ now, narrate, intro: getIntroNarration }), chatLlm, chatTimeoutMs }));
  app.use(
    createGuideRouter(
      new DestinationGuide({
        searchPlaces: searchPlacesViaServer,
        debug: process.env.NODE_ENV !== "production",
        ...guide,
      }),
    ),
  );
  if (process.env.NODE_ENV !== "production") app.use(devRouter);
  app.use("/tour", tourErrorHandler);

  return app;
}
