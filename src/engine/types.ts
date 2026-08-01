export type Seat = number

export type RulesetId = 'yacht' | 'yahtzee'

export type CategoryId =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'threeKind'
  | 'fourKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'choice'
  | 'fiveKind'

export const DICE_COUNT = 5
export const MAX_ROLLS = 3

export interface GameConfig {
  playerCount: 1 | 2 | 3 | 4
  sharedSeed: number
  startingSeat: Seat
  names: string[]
  rulesVersion: string
  ruleset: RulesetId
}

export interface Scorecard {
  marks: Partial<Record<CategoryId, number>>
  /** Yahtzee-style 100-point bonuses for five-of-a-kinds after the first. */
  fiveKindBonuses: number
}

export interface GameResult {
  winners: Seat[]
  totals: number[]
}

export interface GameState {
  ruleset: RulesetId
  /**
   * Serializable mulberry32 state. Every die face in the game is drawn from
   * this stream inside applyMove, so faces are derived from the move log —
   * never trusted from the wire — and replay/hash-checking stay exact.
   */
  rngState: number
  seatToAct: Seat
  /** Faces 1–6; all 0 before the turn's first roll. */
  dice: number[]
  held: boolean[]
  rollsUsed: 0 | 1 | 2 | 3
  cards: Scorecard[]
  result: GameResult | null
}

export type Move = { type: 'roll'; held: boolean[] } | { type: 'score'; category: CategoryId }
