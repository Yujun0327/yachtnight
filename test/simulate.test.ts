import { Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { flatness } from '../src/dice/facemap'
import { PAD } from '../src/dice/physics'
import { seededLaunches, simulateRoll } from '../src/dice/simulate'

const SOAK = 40

describe('simulateRoll', () => {
  it(`soak: ${SOAK} seeded throws all settle flat inside the pad within 6s`, () => {
    const q = new Quaternion()
    for (let seed = 1; seed <= SOAK; seed++) {
      const rec = simulateRoll(seededLaunches(seed * 7919, 5), seed)
      expect(rec.frameCount).toBeGreaterThan(30)
      expect(rec.duration).toBeLessThanOrEqual(6)
      expect(rec.naturalFaces).toHaveLength(5)

      const last = (rec.frameCount - 1) * 5 * 7
      for (let i = 0; i < 5; i++) {
        const o = last + i * 7
        const [x, y, z] = [rec.frames[o], rec.frames[o + 1], rec.frames[o + 2]]
        expect(rec.naturalFaces[i]).toBeGreaterThanOrEqual(1)
        expect(rec.naturalFaces[i]).toBeLessThanOrEqual(6)
        // inside the walls, resting on (or very near) the felt
        expect(Math.abs(x)).toBeLessThan(PAD.halfW + 0.6)
        expect(Math.abs(z)).toBeLessThan(PAD.halfD + 0.6)
        expect(y).toBeLessThan(1.2)
        // flat enough that the playback flatten pass is a subtle correction
        q.set(rec.frames[o + 3], rec.frames[o + 4], rec.frames[o + 5], rec.frames[o + 6])
        expect(flatness(q)).toBeGreaterThan(0.9)
      }
    }
  }, 30_000)

  it('same seed reproduces the identical recording', () => {
    const a = simulateRoll(seededLaunches(42, 5), 42)
    const b = simulateRoll(seededLaunches(42, 5), 42)
    expect(b.naturalFaces).toEqual(a.naturalFaces)
    expect(b.frameCount).toBe(a.frameCount)
    expect(Array.from(b.frames.slice(0, 70))).toEqual(Array.from(a.frames.slice(0, 70)))
  })

  it('face distribution over many seeds is not degenerate', () => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (let seed = 1; seed <= 60; seed++) {
      const rec = simulateRoll(seededLaunches(seed * 104729, 5), seed)
      for (const f of rec.naturalFaces) counts[f]++
    }
    // 300 dice: every face should appear a healthy number of times
    for (let f = 1; f <= 6; f++) expect(counts[f]).toBeGreaterThan(20)
  }, 60_000)

  it('records impacts and settle times', () => {
    const rec = simulateRoll(seededLaunches(7, 5), 7)
    expect(rec.impacts.length).toBeGreaterThan(3)
    expect(Math.max(...rec.settleTimes)).toBeLessThanOrEqual(rec.duration + 1e-9)
  })
})
