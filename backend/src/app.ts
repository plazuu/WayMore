import cors from "cors";
import express from "express";
import { llmConfig, ttsConfig } from "./config";
import type { ChatLlm } from "./live/chat";
import { SessionStore, type SessionStoreOptions } from "./live/session";
import { devRouter } from "./live/demoPath";
import { audioRouter, createTourRouter, tourErrorHandler } from "./routes/tour";

export interface AppOptions extends SessionStoreOptions {
  /** Pass a store to inspect sessions from outside (replay script); otherwise one is created. */
  store?: SessionStore;
  chatLlm?: ChatLlm;
  chatTimeoutMs?: number;
}

// Narration service: live guide (/tour/*), chat and the cached audio (/audio).
// The app reaches it through server/'s proxy; route search lives in server/.
export function createApp({ store, now, narrate, chatLlm, chatTimeoutMs }: AppOptions = {}) {
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

  app.use(audioRouter);
  app.use(createTourRouter({ store: store ?? new SessionStore({ now, narrate }), chatLlm, chatTimeoutMs }));
  if (process.env.NODE_ENV !== "production") app.use(devRouter);
  app.use("/tour", tourErrorHandler);

  return app;
}
