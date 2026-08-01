import { createGame } from '../src/engine'
import type { GameConfig, GameState, RulesetId } from '../src/engine'

export function makeConfig(
  playerCount: 1 | 2 | 3 | 4,
  sharedSeed = 42,
  startingSeat = 0,
  ruleset: RulesetId = 'yacht',
): GameConfig {
  return {
    playerCount,
    sharedSeed,
    startingSeat,
    names: Array.from({ length: playerCount }, (_, i) => `P${i}`),
    rulesVersion: '1',
    ruleset,
  }
}

export function newGame(playerCount: 1 | 2 | 3 | 4, seed = 42): GameState {
  return createGame(makeConfig(playerCount, seed))
}
