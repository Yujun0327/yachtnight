/** Deterministic PRNG (mulberry32). Used ONLY for shared public randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stateless single step of the same mulberry32 stream, for RNG state that
 * must live inside serializable GameState (die rolls). Matches the closure
 * above exactly: chaining rngStep from a seed yields the same sequence as
 * mulberry32(seed).
 */
export function rngStep(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a >>> 0 }
}

/** Draw `count` die faces (1–6), returning the advanced RNG state. */
export function rollDice(state: number, count: number): { faces: number[]; state: number } {
  const faces: number[] = []
  let s = state
  for (let i = 0; i < count; i++) {
    const step = rngStep(s)
    s = step.state
    faces.push(1 + Math.floor(step.value * 6))
  }
  return { faces, state: s }
}

/** Fisher–Yates shuffle driven by a shared deterministic rng. Returns a new array. */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
