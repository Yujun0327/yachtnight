import { Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CUBE_ROTATIONS,
  FACE_NORMALS,
  flatness,
  nearestFlat,
  remapQuaternion,
  topFaceOf,
} from '../src/dice/facemap'

describe('cube rotation group', () => {
  it('has 24 distinct rotations', () => {
    expect(CUBE_ROTATIONS.length).toBe(24)
    for (let i = 0; i < 24; i++) {
      for (let j = i + 1; j < 24; j++) {
        const d = Math.abs(CUBE_ROTATIONS[i].dot(CUBE_ROTATIONS[j]))
        expect(d).toBeLessThan(0.999) // q and -q would dot to ±1
      }
    }
  })
})

describe('topFaceOf', () => {
  it('reads identity as face 1 up', () => {
    expect(topFaceOf(new Quaternion())).toBe(1)
  })

  it('reads every cube rotation as a valid face', () => {
    for (const r of CUBE_ROTATIONS) {
      const f = topFaceOf(r)
      expect(f).toBeGreaterThanOrEqual(1)
      expect(f).toBeLessThanOrEqual(6)
      expect(flatness(r)).toBeCloseTo(1, 5)
    }
  })
})

describe('remapQuaternion', () => {
  it('forces the target face up for every (orientation, natural, target) combo', () => {
    for (const sim of CUBE_ROTATIONS) {
      const natural = topFaceOf(sim)
      for (let target = 1; target <= 6; target++) {
        for (let variant = 0; variant < 4; variant++) {
          const r = remapQuaternion(natural, target, variant)
          const rendered = sim.clone().multiply(r)
          expect(topFaceOf(rendered)).toBe(target)
        }
      }
    }
  })

  it('always finds exactly 4 candidate rotations', () => {
    for (let natural = 1; natural <= 6; natural++) {
      for (let target = 1; target <= 6; target++) {
        const seen = new Set<string>()
        for (let variant = 0; variant < 4; variant++) {
          const r = remapQuaternion(natural, target, variant)
          seen.add(`${r.x.toFixed(4)},${r.y.toFixed(4)},${r.z.toFixed(4)},${r.w.toFixed(4)}`)
        }
        expect(seen.size).toBe(4)
      }
    }
  })
})

describe('nearestFlat', () => {
  it('flattens a cocked die without changing its top face', () => {
    const cocked = new Quaternion()
      .setFromAxisAngle({ x: 1, y: 0, z: 0 } as never, 0.18)
      .multiply(CUBE_ROTATIONS[7])
    const before = topFaceOf(cocked)
    const flat = nearestFlat(cocked)
    expect(topFaceOf(flat)).toBe(before)
    expect(flatness(flat)).toBeCloseTo(1, 5)
  })

  it('is a no-op on an already flat die', () => {
    for (const r of CUBE_ROTATIONS.slice(0, 6)) {
      const flat = nearestFlat(r)
      expect(Math.abs(flat.dot(r))).toBeCloseTo(1, 5)
    }
  })
})
