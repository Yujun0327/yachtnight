import { legalCategories, ruleset } from './scoring'
import { DICE_COUNT, MAX_ROLLS, type GameState, type Move, type Seat } from './types'

/**
 * Every move `seat` may make right now. The roll move is a template — the UI
 * substitutes its own held mask; any mask is legal on rerolls (holding
 * nothing, or everything but re-throwing anyway, are both allowed).
 */
export function legalMoves(state: GameState, seat: Seat): Move[] {
  if (state.result || seat !== state.seatToAct) return []
  const moves: Move[] = []
  if (state.rollsUsed < MAX_ROLLS) {
    moves.push({ type: 'roll', held: [...state.held] })
  }
  if (state.rollsUsed > 0) {
    const rs = ruleset(state.ruleset)
    for (const category of legalCategories(rs, state.dice, state.cards[seat])) {
      moves.push({ type: 'score', category })
    }
  }
  return moves
}

export function validateRoll(state: GameState, held: boolean[]): void {
  if (state.rollsUsed >= MAX_ROLLS) throw new Error('no rolls left')
  if (held.length !== DICE_COUNT) throw new Error('bad held mask')
  if (state.rollsUsed === 0 && held.some(Boolean)) throw new Error('cannot hold before first roll')
  if (held.every(Boolean)) throw new Error('cannot hold all five dice')
}
