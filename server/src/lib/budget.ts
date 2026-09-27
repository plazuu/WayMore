import { SCENIC_BASE_EXTRA_SECONDS, SCENIC_EXTRA_FRACTION } from "../config";

// How much longer than the fastest route a scenic route may take. An explicit
// request value wins; otherwise a flat allowance plus a share of the trip.
export function scenicBudgetSeconds(fastestSeconds: number, maxExtraMinutes?: number): number {
  if (maxExtraMinutes !== undefined) return maxExtraMinutes * 60;
  return SCENIC_BASE_EXTRA_SECONDS + fastestSeconds * SCENIC_EXTRA_FRACTION;
}
