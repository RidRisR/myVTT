// Animation timing constants shared between DiceReel and DiceResultCard
export const SPIN_DURATION = 0.8 // All dice spin for this long minimum
export const STOP_INTERVAL = 0.2 // Each die stops 0.2s apart

/** Calculate total animation duration for a set of dice terms */
export function calcTotalAnimDuration(
  termResults: { term: { type: string }; allRolls: number[] }[],
): number {
  let diceCount = 0
  for (const tr of termResults) {
    if (tr.term.type === 'dice') {
      diceCount += tr.allRolls.length
    }
  }
  if (diceCount === 0) return 0.5
  // spin + sequential stops + landing animation + buffer for total reveal
  const lastStopTime = SPIN_DURATION + (diceCount - 1) * STOP_INTERVAL
  return lastStopTime + 0.3 + 0.2 // landing (0.3s) + buffer before total (0.2s)
}
