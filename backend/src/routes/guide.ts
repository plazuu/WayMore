import { Router, type Response } from "express";
import { GUIDE } from "../config";
import type { DestinationGuide, GuideRequest } from "../guide/flow";

function fail(res: Response, status: number, error: string, message: string) {
  res.status(status).json({ error, message });
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** POST /guide/destination: the "Where to?" guide. See docs/destination-guide-api.md. */
export function createGuideRouter(guide: DestinationGuide) {
  const router = Router();

  router.post("/guide/destination", async (req, res) => {
    const { conversationId, message, choice, lat, lng } = req.body ?? {};
    if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail(res, 400, "location_required", "lat and lng must be the device's current coordinates");
      return;
    }
    if (conversationId !== undefined && typeof conversationId !== "string") {
      fail(res, 400, "bad_request", "conversationId must be a string");
      return;
    }
    if (message !== undefined && typeof message !== "string") {
      fail(res, 400, "bad_request", "message must be a string");
      return;
    }
    if (typeof message === "string" && message.length > GUIDE.maxMessageChars) {
      fail(res, 400, "message_too_long", `message must be at most ${GUIDE.maxMessageChars} characters`);
      return;
    }
    let parsedChoice: GuideRequest["choice"];
    if (choice !== undefined && choice !== null) {
      const { chipId, placeId } = choice as Record<string, unknown>;
      if (typeof choice !== "object" || (chipId !== undefined && typeof chipId !== "string") || (placeId !== undefined && typeof placeId !== "string")) {
        fail(res, 400, "bad_request", "choice must be { chipId?: string, placeId?: string }");
        return;
      }
      parsedChoice = { chipId: chipId as string | undefined, placeId: placeId as string | undefined };
    }

    res.json(await guide.handle({ conversationId, message, choice: parsedChoice, lat, lng }));
  });

  return router;
}
