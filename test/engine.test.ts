import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  legalMoves,
  mulberry32,
  publicHash,
  rollDice,
  rngStep,
  ruleset,
} from '../src/engine'
import type { GameConfig, GameState, Move } from '../src/engine'

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({
  playerCount: 2,
  sharedSeed: 12345,
  startingSeat: 0,
  names: ['Ana', 'Bo'],
  rulesVersion: '1',
  ruleset: 'yacht',
  ...over,
})

const NONE = [false, false, false, false, false]

describe('rng step API', () => {
  it('matches the mulberry32 closure exactly', () => {
    const closure = mulberry32(987654)
    let state = 987654
    for (let i = 0; i < 100; i++) {
      const step = rngStep(state)
      state = step.state
      expect(step.value).toBe(closure())
    }
  })

  it('rollDice draws one step per die', () => {
    const a = rollDice(555, 5)
    let s = 555
    const faces: number[] = []
    for (let i = 0; i < 5; i++) {
      const step = rngStep(s)
      s = step.state
      faces.push(1 + Math.floor(step.value * 6))
    }
    expect(a.faces).toEqual(faces)
    expect(a.state).toBe(s)
  })
})

describe('rolling', () => {
  it('first roll fills all five dice from the seeded stream', () => {
    const s0 = createGame(cfg())
    const s1 = applyMove(s0, 0, { type: 'roll', held: NONE })
    expect(s1.dice.every((d) => d >= 1 && d <= 6)).toBe(true)
    expect(s1.rollsUsed).toBe(1)
    expect(s1.rngState).not.toBe(s0.rngState)
    // derived, not random: replay gives identical faces
    const again = applyMove(s0, 0, { type: 'roll', held: NONE })
    expect(again.dice).toEqual(s1.dice)
    expect(publicHash(again)).toBe(publicHash(s1))
  })

  it('held dice keep their faces and consume no rng', () => {
    const s0 = createGame(cfg())
    const s1 = applyMove(s0, 0, { type: 'roll', held: NONE })
    const held = [true, false, true, false, true]
    const s2 = applyMove(s1, 0, { type: 'roll', held })
    expect(s2.dice[0]).toBe(s1.dice[0])
    expect(s2.dice[2]).toBe(s1.dice[2])
    expect(s2.dice[4]).toBe(s1.dice[4])
    // exactly 2 draws consumed
    const expected = rollDice(s1.rngState, 2)
    expect([s2.dice[1], s2.dice[3]]).toEqual(expected.faces)
    expect(s2.rngState).toBe(expected.state)
  })

  it('rejects illegal rolls', () => {
    const s0 = createGame(cfg())
    expect(() => applyMove(s0, 1, { type: 'roll', held: NONE })).toThrow(/seat/)
    expect(() =>
      applyMove(s0, 0, { type: 'roll', held: [true, false, false, false, false] }),
    ).toThrow(/hold before first/)
    let s = applyMove(s0, 0, { type: 'roll', held: NONE })
    s = applyMove(s, 0, { type: 'roll', held: NONE })
    s = applyMove(s, 0, { type: 'roll', held: NONE })
    expect(() => applyMove(s, 0, { type: 'roll', held: NONE })).toThrow(/no rolls left/)
    expect(() =>
      applyMove(s, 0, { type: 'roll', held: [true, true, true, true, true] }),
    ).toThrow()
  })
})

describe('scoring flow', () => {
  it('writes the mark, resets the turn and advances the seat', () => {
    const s0 = createGame(cfg())
    const s1 = applyMove(s0, 0, { type: 'roll', held: NONE })
    const s2 = applyMove(s1, 0, { type: 'score', category: 'choice' })
    expect(s2.cards[0].marks.choice).toBe(s1.dice.reduce((a, b) => a + b, 0))
    expect(s2.seatToAct).toBe(1)
    expect(s2.rollsUsed).toBe(0)
    expect(s2.dice).toEqual([0, 0, 0, 0, 0])
    expect(s2.held).toEqual(NONE)
  })

  it('cannot score before rolling or into a filled box', () => {
    const s0 = createGame(cfg())
    expect(() => applyMove(s0, 0, { type: 'score', category: 'ones' })).toThrow(/must roll/)
    const s1 = applyMove(s0, 0, { type: 'roll', held: NONE })
    const s2 = applyMove(s1, 0, { type: 'score', category: 'ones' })
    let s3 = applyMove(s2, 1, { type: 'roll', held: NONE })
    s3 = applyMove(s3, 1, { type: 'score', category: 'ones' })
    const s4 = applyMove(s3, 0, { type: 'roll', held: NONE })
    expect(() => applyMove(s4, 0, { type: 'score', category: 'ones' })).toThrow(/not scorable/)
  })

  it('legalMoves offers a roll template and open categories only', () => {
    const s0 = createGame(cfg())
    expect(legalMoves(s0, 1)).toEqual([])
    const before = legalMoves(s0, 0)
    expect(before).toHaveLength(1)
    expect(before[0].type).toBe('roll')
    const s1 = applyMove(s0, 0, { type: 'roll', held: NONE })
    const after = legalMoves(s1, 0)
    const scoreMoves = after.filter((m): m is Move & { type: 'score' } => m.type === 'score')
    expect(scoreMoves).toHaveLength(12)
  })
})

describe('game end', () => {
  function playToEnd(state: GameState): GameState {
    const rng = mulberry32(999)
    let s = state
    while (!s.result) {
      const seat = s.seatToAct
      s = applyMove(s, seat, { type: 'roll', held: NONE })
      const rs = ruleset(s.ruleset)
      const open = rs.categories.filter((c) => s.cards[seat].marks[c] === undefined)
      const moves = legalMoves(s, seat).filter((m) => m.type === 'score')
      const pick = moves[Math.floor(rng() * moves.length)] as Move & { type: 'score' }
      expect(open).toContain(pick.category)
      s = applyMove(s, seat, pick)
    }
    return s
  }

  it('ends when every card is full and crowns the top total (yacht)', () => {
    const end = playToEnd(createGame(cfg()))
    expect(end.result).not.toBeNull()
    const { totals, winners } = end.result!
    expect(totals).toHaveLength(2)
    const top = Math.max(...totals)
    for (const w of winners) expect(totals[w]).toBe(top)
  })

  it('solo games finish with a single total', () => {
    const end = playToEnd(createGame(cfg({ playerCount: 1, names: ['Solo'] })))
    expect(end.result!.totals).toHaveLength(1)
    expect(end.result!.winners).toEqual([0])
  })
})
