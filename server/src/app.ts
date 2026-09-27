import cors from "cors";
import express from "express";
import { autocompleteRouter } from "./routes/autocomplete";
import { geocodeRouter } from "./routes/geocode";
import { photoRouter } from "./routes/photo";
import { placesRouter } from "./routes/places";
import { routeRouter } from "./routes/route";
import { backendHealth, backendProxy } from "./routes/proxy";

export interface AppOptions {
  /** Tests only: one timeout for every proxied path. */
  proxyTimeoutMs?: number;
}

// The app's single base URL. Route search (Google Maps) is served here;
// /tour, /audio, /dev, /narration and /guide are proxied to the backend/ service.
export function createApp({ proxyTimeoutMs }: AppOptions = {}) {
  const app = express();
  app.use(cors());
  // Before express.json(): proxied bodies are streamed, not parsed.
  app.use(backendProxy({ timeoutMs: proxyTimeoutMs }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    res.json({ status: "ok", backend: await backendHealth() });
  });

  app.use(geocodeRouter);
  app.use(autocompleteRouter);
  app.use(routeRouter);
  app.use(photoRouter);
  app.use(placesRouter);

  return app;
}
