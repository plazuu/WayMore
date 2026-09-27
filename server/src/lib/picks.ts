export interface PickCandidate {
  encodedPolyline: string;
  durationSeconds: number;
  score: number;
}

export interface RoutePicks<T> {
  normal: T;
  /** Short detour: the best-scoring route within the short budget. May be `normal`. */
  scenic: T;
  /** Long detour: only when a different, longer route within the long budget scores better. */
  scenicLong?: T;
}

const bestOf = <T extends PickCandidate>(candidates: T[]): T =>
  candidates.reduce((best, c) => {
    if (c.score > best.score) return c;
    if (c.score === best.score && c.durationSeconds < best.durationSeconds) return c;
    return best;
  });

// Picks the three options shown to the user: the fastest route, the best route
// that costs at most `shortBudgetSeconds` extra, and (when one exists) a longer
// detour of at most `longBudgetSeconds` extra that is a different route and
// scores better than the short one.
export function pickRoutes<T extends PickCandidate>(
  candidates: T[],
  shortBudgetSeconds: number,
  longBudgetSeconds: number,
): RoutePicks<T> {
  const normal = candidates.reduce((fastest, c) => (c.durationSeconds < fastest.durationSeconds ? c : fastest));
  const within = (budget: number) => candidates.filter((c) => c.durationSeconds - normal.durationSeconds <= budget);

  const scenic = bestOf(within(shortBudgetSeconds));
  const longer = within(longBudgetSeconds).filter(
    (c) =>
      c.encodedPolyline !== normal.encodedPolyline &&
      c.encodedPolyline !== scenic.encodedPolyline &&
      c.durationSeconds > scenic.durationSeconds &&
      c.score > scenic.score,
  );
  return { normal, scenic, scenicLong: longer.length > 0 ? bestOf(longer) : undefined };
}
