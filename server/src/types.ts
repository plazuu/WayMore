// A point of interest along the route. M1's `landmarks[]` / `foodStops[]`
// should produce this shape so narration can consume it directly.
export interface Place {
  id: string;
  name: string;
  kind: "landmark" | "restaurant";
  tagline?: string;
  category?: string;
  description?: string;
  facts?: string[];
  lat: number;
  lng: number;
  side?: "left" | "right" | "ahead";
}

export interface Narration {
  placeId: string;
  text: string;
  /** Path relative to the server root, e.g. "/audio/<key>.mp3"; null when no audio is available. */
  audioUrl: string | null;
  durationHintS: number;
}
