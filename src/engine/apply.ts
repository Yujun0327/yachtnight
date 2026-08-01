import { deepClone } from './clone'
import { validateRoll } from './legality'
import { rollDice } from './rng'
import {
  earnsFiveKindBonus,
  legalCategories,
  ruleset,
  scoreValue,
  totalScore,
} from './scoring'
import { DICE_COUNT, type GameState, type Move, type Seat } from './types'

/** Pure reducer: throws on any illegal move, never mutates `prev`. */
export function applyMove(prev: GameState, actor: Seat, move: Move): GameState {
  if (prev.result) throw new Error('game over')
  if (actor !== prev.seatToAct) throw new Error('not your seat')
  const state = deepClone(prev)

  if (move.type === 'roll') {
    validateRoll(prev, move.held)
    // one stream draw per unheld die, in die order, so replay stays exact
    let s = state.rngState
    for (let i = 0; i < DICE_COUNT; i++) {
      if (!move.held[i]) {
        const drawn = rollDice(s, 1)
        s = drawn.state
        state.dice[i] = drawn.faces[0]
      }
    }
    state.rngState = s
    state.held = [...move.held]
    state.rollsUsed = (prev.rollsUsed + 1) as GameState['rollsUsed']
    return state
  }

  // score
  if (prev.rollsUsed === 0) throw new Error('must roll before scoring')
  const rs = ruleset(prev.ruleset)
  const card = state.cards[actor]
  if (!legalCategories(rs, prev.dice, card).includes(move.category)) {
    throw new Error(`category ${move.category} not scorable now`)
  }
  if (earnsFiveKindBonus(rs, prev.dice, card)) card.fiveKindBonuses++
  card.marks[move.category] = scoreValue(rs, move.category, prev.dice, card)

  state.dice = Array<number>(DICE_COUNT).fill(0)
  state.held = Array<boolean>(DICE_COUNT).fill(false)
  state.rollsUsed = 0
  state.seatToAct = (prev.seatToAct + 1) % prev.cards.length

  const done = state.cards.every((c) => Object.keys(c.marks).length === rs.categories.length)
  if (done) {
    const totals = state.cards.map((c) => totalScore(rs, c))
    const top = Math.max(...totals)
    state.result = {
      totals,
      winners: totals.flatMap((t, seat) => (t === top ? [seat] : [])),
    }
  }
  return state
}
