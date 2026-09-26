import "dotenv/config";
import cors from "cors";
import express from "express";
import { geocodeRouter } from "./routes/geocode";
import { routeRouter } from "./routes/route";
import { photoRouter } from "./routes/photo";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(geocodeRouter);
app.use(routeRouter);
app.use(photoRouter);

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`server listening on port ${port}`);
});
