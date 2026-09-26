import cors from "cors";
import express from "express";
import { audioRouter, narrationRouter } from "./routes/narration";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(narrationRouter);
  app.use(audioRouter);

  return app;
}
