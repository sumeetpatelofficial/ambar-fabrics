/**
 * The "cut to order" demonstration on the home page: how long a piece is, and what it costs, as the
 * page scrolls. Lengths go up in quarter-metre steps from 0.25 m to 3 m. Pure, so it can be tested.
 */
export const MIN_METRES = 0.25
export const MAX_METRES = 3
export const STEP_METRES = 0.25

/** Scroll progress (0 to 1) to a length in metres, on the quarter-metre steps. */
export function metresAt(progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const raw = MIN_METRES + p * (MAX_METRES - MIN_METRES)
  const stepped = Math.round(raw / STEP_METRES) * STEP_METRES
  return Math.min(MAX_METRES, Math.max(MIN_METRES, stepped))
}

/** "2.5 m", "0.25 m", "3 m". */
export function formatMetres(metres: number): string {
  return `${Number(metres.toFixed(2))} m`
}

/** Price in whole paise for a length: the rate is per metre, so a quarter metre is a quarter of the rate. */
export function priceForMetres(metres: number, ratePerMetrePaise: number): number {
  return Math.round(metres * ratePerMetrePaise)
}
