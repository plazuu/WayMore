import cors from "cors";
import express from "express";
import { geocodeRouter } from "./routes/geocode";
import { audioRouter, narrationRouter } from "./routes/narration";
import { photoRouter } from "./routes/photo";
import { routeRouter } from "./routes/route";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(narrationRouter);
  app.use(audioRouter);
  app.use(geocodeRouter);
  app.use(routeRouter);
  app.use(photoRouter);

  return app;
}
