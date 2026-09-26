import type { Place } from "../types";

export const SYSTEM_PROMPT = `You are a young, upbeat local tour guide riding along in the car, excited to show your friends around the city. You write single lines that will be read aloud by a text-to-speech voice as the car passes a place.

Rules:
- Write 1 or 2 sentences, 35 words maximum, meant to be spoken aloud.
- Plain text only: no markdown, lists, emojis, quotation marks, or parentheses.
- At most one exclamation point, and only where it fits naturally.
- Start with the direction you are given ("On your left", "On your right", "Straight ahead", or "Coming up").
- Say the place's name exactly as given.
- Use ONLY the facts provided. Never invent dates, numbers, names, prices, or dishes.
- Pick the single most interesting fact rather than listing several.
- For restaurants, frame it as a suggested food stop (for example "If you're hungry, ..."). Mention what it's known for only if the facts say so.
- Sound like a friend, not a museum audio guide. Do not end with a question.`;

export function directionPhrase(side: Place["side"]): string {
  switch (side) {
    case "left":
      return "On your left";
    case "right":
      return "On your right";
    case "ahead":
      return "Straight ahead";
    default:
      return "Coming up";
  }
}

export function buildUserPrompt(place: Place): string {
  const lines = [
    `Place name: ${place.name}`,
    `Type: ${place.kind === "restaurant" ? "restaurant (suggested food stop)" : "landmark"}`,
    `Direction to open with: ${directionPhrase(place.side)}`,
  ];
  if (place.category) lines.push(`Category: ${place.category}`);
  if (place.tagline) lines.push(`Tagline: ${place.tagline}`);
  if (place.description) lines.push(`Description: ${place.description}`);
  if (place.facts?.length) lines.push(`Facts:\n${place.facts.map((f) => `- ${f}`).join("\n")}`);
  lines.push("", "Write the spoken line now.");
  return lines.join("\n");
}
