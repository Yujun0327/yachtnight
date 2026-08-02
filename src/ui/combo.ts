import { isFiveKind, tally } from '../engine'
import type { RulesetId } from '../engine'

/**
 * The celebration ladder, evaluated when the player banks all five dice.
 * Tier 1 = a nod (four of a kind, full house), tier 2 = a proper fanfare
 * (straights), tier 3 = the house loses its mind (yacht / five of a kind).
 */
export interface Combo {
  tier: 1 | 2 | 3
  title: string
}

export function comboOf(dice: readonly number[], rs: RulesetId): Combo | null {
  if (dice.length !== 5 || dice.some((d) => d === 0)) return null
  const t = tally(dice)
  if (isFiveKind(dice)) return { tier: 3, title: rs === 'yacht' ? 'YACHT' : 'FIVE OF A KIND' }
  if (rs === 'yacht') {
    if ([1, 2, 3, 4, 5].every((f) => t[f] === 1)) return { tier: 2, title: 'LITTLE STRAIGHT' }
    if ([2, 3, 4, 5, 6].every((f) => t[f] === 1)) return { tier: 2, title: 'BIG STRAIGHT' }
  } else {
    let run = 0
    let best = 0
    for (let f = 1; f <= 6; f++) {
      run = t[f] > 0 ? run + 1 : 0
      best = Math.max(best, run)
    }
    if (best >= 5) return { tier: 2, title: 'LARGE STRAIGHT' }
    if (best >= 4) return { tier: 2, title: 'SMALL STRAIGHT' }
  }
  if (t.some((n) => n >= 4)) return { tier: 1, title: 'FOUR OF A KIND' }
  if (t.includes(3) && t.includes(2)) return { tier: 1, title: 'FULL HOUSE' }
  return null
}
