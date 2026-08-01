import type { GameState, Seat } from './types'

/**
 * Yacht Night is a full-information game — nothing to hide. Kept for
 * template parity so the session layer stays identical to the siblings.
 */
export function redact(state: GameState, _viewer: Seat | null): GameState {
  return state
}
