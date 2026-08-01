/**
 * Plays a RollRecording onto the stage meshes. Each die renders
 * meshQuat = simQuat * remapQuat so the engine-decided face is up from the
 * very first frame — no snap can ever appear. A short flatten segment after
 * the last frame eases any residual cocked lean to perfectly flat.
 */
import { Quaternion, Vector3 } from 'three'
import type { Mesh } from 'three'
import { nearestFlat, remapQuaternion, topFaceOf } from './facemap'
import type { RollRecording } from './simulate'

const FLATTEN_TIME = 0.22

export interface PlaybackHooks {
  onImpact?(strength: number): void
  onDieSettled?(die: number, order: number): void
}

export class Playback {
  readonly duration: number
  private rec: RollRecording
  private remaps: Quaternion[]
  private finals: Quaternion[] = []
  private impactCursor = 0
  private settleOrder: number[]
  private settleFired: boolean[]
  private hooks: PlaybackHooks
  private qa = new Quaternion()
  private qb = new Quaternion()
  private va = new Vector3()
  private vb = new Vector3()

  constructor(rec: RollRecording, targetFaces: number[], hooks: PlaybackHooks = {}) {
    this.rec = rec
    this.hooks = hooks
    // variant keyed by die index: deterministic, but adjacent dice twist differently
    this.remaps = rec.naturalFaces.map((nat, i) => remapQuaternion(nat, targetFaces[i], i))
    this.duration = (rec.frameCount - 1) / rec.frameRate + FLATTEN_TIME
    this.settleOrder = [...rec.settleTimes.keys()].sort(
      (a, b) => rec.settleTimes[a] - rec.settleTimes[b],
    )
    this.settleFired = new Array(rec.diceCount).fill(false)
    // final rendered orientations (flattened), computed once
    for (let i = 0; i < rec.diceCount; i++) {
      const o = (rec.frameCount - 1) * rec.diceCount * 7 + i * 7
      const simQ = new Quaternion(
        rec.frames[o + 3],
        rec.frames[o + 4],
        rec.frames[o + 5],
        rec.frames[o + 6],
      )
      this.finals.push(nearestFlat(simQ.multiply(this.remaps[i])))
    }
  }

  /** The faces actually shown at the end (sanity: must equal targetFaces). */
  finalFaces(): number[] {
    return this.finals.map((q) => topFaceOf(q))
  }

  /** Write die transforms for time t (seconds); returns true while playing. */
  seek(t: number, dice: Mesh[]): boolean {
    const { rec } = this
    const stride = rec.diceCount * 7
    const frameT = Math.min(t, (rec.frameCount - 1) / rec.frameRate)
    const f = Math.min(rec.frameCount - 1, Math.floor(frameT * rec.frameRate))
    const fNext = Math.min(rec.frameCount - 1, f + 1)
    const alpha = Math.min(1, frameT * rec.frameRate - f)

    for (let i = 0; i < rec.diceCount; i++) {
      const a = f * stride + i * 7
      const b = fNext * stride + i * 7
      this.va.set(rec.frames[a], rec.frames[a + 1], rec.frames[a + 2])
      this.vb.set(rec.frames[b], rec.frames[b + 1], rec.frames[b + 2])
      dice[i].position.copy(this.va.lerp(this.vb, alpha))
      this.qa.set(rec.frames[a + 3], rec.frames[a + 4], rec.frames[a + 5], rec.frames[a + 6])
      this.qb.set(rec.frames[b + 3], rec.frames[b + 4], rec.frames[b + 5], rec.frames[b + 6])
      this.qa.slerp(this.qb, alpha).multiply(this.remaps[i])

      // flatten segment: ease the last fraction toward the flat final pose
      const flattenStart = this.duration - FLATTEN_TIME
      if (t > flattenStart) {
        const k = Math.min(1, (t - flattenStart) / FLATTEN_TIME)
        this.qa.slerp(this.finals[i], k * k * (3 - 2 * k))
      }
      dice[i].quaternion.copy(this.qa)

      if (!this.settleFired[i] && t >= rec.settleTimes[i]) {
        this.settleFired[i] = true
        this.hooks.onDieSettled?.(i, this.settleOrder.indexOf(i))
      }
    }

    while (this.impactCursor < rec.impacts.length && rec.impacts[this.impactCursor].t <= t) {
      this.hooks.onImpact?.(rec.impacts[this.impactCursor].strength)
      this.impactCursor++
    }

    return t < this.duration
  }

  /** Jump straight to the settled end state (skip / reduced motion). */
  finish(dice: Mesh[]): void {
    this.seek(this.duration + 1, dice)
  }
}
