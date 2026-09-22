import { loadPlayerName as load, playerKey as key, savePlayerName as save } from '@yujun/game-net'

/** Storage prefix and MQTT topic namespace for this game. */
export const APP = 'yachtnight'

/** Persistent identity per browser: the same key reclaims the same seat after a refresh. */
export const playerKey = (): string => key(APP)
export const loadPlayerName = (): string => load(APP)
export const savePlayerName = (name: string): void => save(APP, name)
/* ---------------- solo score attack ---------------- */

const bestKey = (ruleset: string) => `yachtnight:best:${ruleset}`

export function bestScore(ruleset: string): number | null {
  const raw = localStorage.getItem(bestKey(ruleset))
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Record a finished solo score; returns true when it is a new best. */
export function recordScore(ruleset: string, score: number): boolean {
  const prev = bestScore(ruleset)
  if (prev !== null && score <= prev) return false
  localStorage.setItem(bestKey(ruleset), String(score))
  return true
}
