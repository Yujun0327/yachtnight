import type { GameState } from './types'

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as object).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

/**
 * FNV-1a over the canonical serialization of the FULL state. Yacht Night is
 * open information (deck order is seed-derived on every client), so unlike
 * toybattle there is no private projection to strip — every client must
 * agree on every byte. Cheap desync tripwire, not crypto.
 */
export function publicHash(state: GameState): string {
  const str = stableStringify(state)
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
