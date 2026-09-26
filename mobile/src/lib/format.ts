export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** "+3 min" for the scenic toggle; empty when the scenic route costs no extra time. */
export function formatExtraTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes > 0 ? `+${minutes} min` : '';
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function formatRating(rating?: number, count?: number): string | null {
  if (rating == null) return null;
  const countText = count ? ` (${count.toLocaleString()})` : '';
  return `★ ${rating.toFixed(1)}${countText}`;
}

/** "tourist_attraction" -> "Tourist attraction" */
export function humanizeType(type?: string): string | undefined {
  if (!type) return undefined;
  const text = type.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** First part of an address, for compact headers: "Wynwood Walls, Miami, FL" -> "Wynwood Walls". */
export function shortPlaceName(address: string): string {
  return address.split(',')[0].trim() || address;
}
