import { DICE_COUNT, type GameConfig, type GameState, type Scorecard } from './types'

function emptyCard(): Scorecard {
  return { marks: {}, fiveKindBonuses: 0 }
}

/** Deterministic from cfg alone — every client derives the identical game. */
export function createGame(cfg: GameConfig): GameState {
  return {
    ruleset: cfg.ruleset,
    rngState: cfg.sharedSeed >>> 0,
    seatToAct: cfg.startingSeat,
    dice: Array<number>(DICE_COUNT).fill(0),
    held: Array<boolean>(DICE_COUNT).fill(false),
    rollsUsed: 0,
    cards: Array.from({ length: cfg.playerCount }, emptyCard),
    result: null,
  }
}
