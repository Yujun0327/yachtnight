import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  legalMoves,
  mulberry32,
  publicHash,
  ruleset,
  totalScore,
} from '../src/engine'
import type { GameConfig, GameState, Move, RulesetId } from '../src/engine'

/**
 * Seeded random playouts to completion: any sequence of legal moves must
 * reach a result without throwing, and identical seeds must produce
 * byte-identical histories on every run (the P2P determinism contract).
 */
function playout(seed: number, rules: RulesetId, playerCount: 1 | 2 | 3 | 4): GameState {
  const cfg: GameConfig = {
    playerCount,
    sharedSeed: seed,
    startingSeat: seed % playerCount,
    names: ['A', 'B', 'C', 'D'].slice(0, playerCount),
    rulesVersion: '1',
    ruleset: rules,
  }
  const rng = mulberry32(seed ^ 0xabcdef)
  let s = createGame(cfg)
  let guard = 0
  while (!s.result && guard++ < 5000) {
    const seat = s.seatToAct
    const moves = legalMoves(s, seat)
    expect(moves.length).toBeGreaterThan(0)
    let pick = moves[Math.floor(rng() * moves.length)]
    if (pick.type === 'roll') {
      // randomize the held mask like a real player would
      const held = s.dice.map((d) => d !== 0 && rng() < 0.4)
      if (held.every(Boolean)) held[0] = false
      pick = { type: 'roll', held } satisfies Move
    }
    s = applyMove(s, seat, pick)
  }
  expect(s.result).not.toBeNull()
  return s
}

describe('random playouts', () => {
  it('30 yacht playouts complete with sane totals', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const end = playout(seed, 'yacht', ((seed % 4) + 1) as 1 | 2 | 3 | 4)
      const rs = ruleset('yacht')
      for (const card of end.cards) {
        expect(Object.keys(card.marks)).toHaveLength(12)
        const total = totalScore(rs, card)
        expect(total).toBeGreaterThanOrEqual(0)
        expect(total).toBeLessThanOrEqual(6 * 5 * 7 + 50 + 60 + 50) // loose sanity cap
      }
    }
  })

  it('30 yahtzee playouts complete with bonuses accounted', () => {
    for (let seed = 100; seed < 130; seed++) {
      const end = playout(seed, 'yahtzee', ((seed % 4) + 1) as 1 | 2 | 3 | 4)
      for (const card of end.cards) {
        expect(Object.keys(card.marks)).toHaveLength(13)
        expect(card.fiveKindBonuses).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('identical seeds give identical final hashes', () => {
    const a = playout(777, 'yahtzee', 3)
    const b = playout(777, 'yahtzee', 3)
    expect(publicHash(b)).toBe(publicHash(a))
  })
})
