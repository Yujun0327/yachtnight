import type { CategoryId, RulesetId, Scorecard } from './types'

/** Face counts, index 1–6. */
export function tally(dice: readonly number[]): number[] {
  const t = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) t[d]++
  return t
}

const sum = (dice: readonly number[]) => dice.reduce((a, b) => a + b, 0)

export const UPPER: readonly CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
export const FACE_OF_UPPER: Record<string, number> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

function upperScore(face: number) {
  return (dice: readonly number[]) => face * tally(dice)[face]
}

function longestRun(dice: readonly number[]): number {
  const t = tally(dice)
  let run = 0
  let best = 0
  for (let f = 1; f <= 6; f++) {
    run = t[f] > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/* ------------------------------------------------------------------ */

export interface RulesetDef {
  id: RulesetId
  label: string
  categories: readonly CategoryId[]
  /** Raw pattern score, ignoring Joker substitutions. */
  score(cat: CategoryId, dice: readonly number[]): number
  upperBonus: { threshold: number; points: number } | null
  /** Points per five-of-a-kind rolled after the first scored 50. */
  fiveKindBonus: number | null
  /** Yahtzee-style Joker: forced category + fixed lower values on repeat five-of-a-kinds. */
  joker: boolean
}

/**
 * Classic Yacht: 12 categories, no bonuses, no Joker. Full House is the sum
 * of all five dice and requires exactly 3+2 (five-of-a-kind does not count);
 * Four of a Kind scores only the four matched dice; the straights are the
 * exact sets 1–5 and 2–6, worth 30 each.
 */
const YACHT: RulesetDef = {
  id: 'yacht',
  label: 'Classic Yacht',
  categories: [
    ...UPPER,
    'choice',
    'fourKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'fiveKind',
  ],
  score(cat, dice) {
    const t = tally(dice)
    switch (cat) {
      case 'choice':
        return sum(dice)
      case 'fourKind': {
        const face = t.findIndex((n) => n >= 4)
        return face > 0 ? face * 4 : 0
      }
      case 'fullHouse':
        return t.includes(3) && t.includes(2) ? sum(dice) : 0
      case 'smallStraight': // little straight: 1-2-3-4-5
        return [1, 2, 3, 4, 5].every((f) => t[f] === 1) ? 30 : 0
      case 'largeStraight': // big straight: 2-3-4-5-6
        return [2, 3, 4, 5, 6].every((f) => t[f] === 1) ? 30 : 0
      case 'fiveKind':
        return t.includes(5) ? 50 : 0
      default:
        return upperScore(FACE_OF_UPPER[cat])(dice)
    }
  },
  upperBonus: null,
  fiveKindBonus: null,
  joker: false,
}

/**
 * Yahtzee-style: 13 categories, upper bonus 35 at 63+, flat Full House 25,
 * 4-run/5-run straights, extra five-of-a-kinds worth 100 with Joker forcing.
 */
const YAHTZEE: RulesetDef = {
  id: 'yahtzee',
  label: 'Yahtzee-style',
  categories: [
    ...UPPER,
    'threeKind',
    'fourKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'fiveKind',
    'choice',
  ],
  score(cat, dice) {
    const t = tally(dice)
    switch (cat) {
      case 'threeKind':
        return t.some((n) => n >= 3) ? sum(dice) : 0
      case 'fourKind':
        return t.some((n) => n >= 4) ? sum(dice) : 0
      case 'fullHouse':
        return t.includes(3) && t.includes(2) ? 25 : 0
      case 'smallStraight':
        return longestRun(dice) >= 4 ? 30 : 0
      case 'largeStraight':
        return longestRun(dice) >= 5 ? 40 : 0
      case 'fiveKind':
        return t.includes(5) ? 50 : 0
      case 'choice': // "Chance"
        return sum(dice)
      default:
        return upperScore(FACE_OF_UPPER[cat])(dice)
    }
  },
  upperBonus: { threshold: 63, points: 35 },
  fiveKindBonus: 100,
  joker: true,
}

const RULESETS: Record<RulesetId, RulesetDef> = { yacht: YACHT, yahtzee: YAHTZEE }

export function ruleset(id: RulesetId): RulesetDef {
  return RULESETS[id]
}

/* ------------------------------------------------------------------ */

export function isFiveKind(dice: readonly number[]): boolean {
  return dice[0] !== 0 && dice.every((d) => d === dice[0])
}

/** Does the Joker rule govern this turn? (Five-of-a-kind, fiveKind box already filled.) */
export function jokerActive(rs: RulesetDef, dice: readonly number[], card: Scorecard): boolean {
  return rs.joker && isFiveKind(dice) && card.marks.fiveKind !== undefined
}

/**
 * The value writing `cat` would record for these dice, Joker substitutions
 * included: under an active Joker the pattern categories score their fixed
 * value even though the dice are five of a kind.
 */
export function scoreValue(
  rs: RulesetDef,
  cat: CategoryId,
  dice: readonly number[],
  card: Scorecard,
): number {
  if (jokerActive(rs, dice, card)) {
    if (cat === 'fullHouse') return 25
    if (cat === 'smallStraight') return 30
    if (cat === 'largeStraight') return 40
  }
  return rs.score(cat, dice)
}

/**
 * Categories the player may legally write this turn. Without a Joker that is
 * every open category; under a Joker the priority is forced: the matching
 * upper box if open, else any open lower box, else any open upper box.
 */
export function legalCategories(
  rs: RulesetDef,
  dice: readonly number[],
  card: Scorecard,
): CategoryId[] {
  const open = rs.categories.filter((c) => card.marks[c] === undefined)
  if (!jokerActive(rs, dice, card)) return open
  const face = dice[0]
  const matching = UPPER[face - 1]
  if (card.marks[matching] === undefined) return [matching]
  const lower = open.filter((c) => !UPPER.includes(c))
  return lower.length > 0 ? lower : open
}

/** Does scoring this turn earn the repeat five-of-a-kind bonus? */
export function earnsFiveKindBonus(
  rs: RulesetDef,
  dice: readonly number[],
  card: Scorecard,
): boolean {
  return rs.fiveKindBonus !== null && isFiveKind(dice) && card.marks.fiveKind === 50
}

/* ------------------------------------------------------------------ */

export function upperTotal(rs: RulesetDef, card: Scorecard): number {
  return UPPER.reduce((a, c) => a + (card.marks[c] ?? 0), 0)
}

export function upperBonusEarned(rs: RulesetDef, card: Scorecard): number {
  if (!rs.upperBonus) return 0
  return upperTotal(rs, card) >= rs.upperBonus.threshold ? rs.upperBonus.points : 0
}

export function totalScore(rs: RulesetDef, card: Scorecard): number {
  const marks = rs.categories.reduce((a, c) => a + (card.marks[c] ?? 0), 0)
  return marks + upperBonusEarned(rs, card) + (rs.fiveKindBonus ?? 0) * card.fiveKindBonuses
}
