/**
 * The ritual state machine. Owns the live rattle sim (real dice colliding
 * inside a kinematic cup that tracks the player's hand), the committed
 * throw (headless sim + face-forced playback), and the reveal choreography.
 *
 * Engine-ignorant by design: callers hand it the authoritative faces; it
 * hands back "the dice have finished showing them". Input adapters feed
 * intensity/pointer; it never knows whether that came from a shaken phone,
 * a scrubbed mouse or mashed arrow keys.
 */
import * as CANNON from 'cannon-es'
import { Quaternion, Vector3 } from 'three'
import type { Mesh } from 'three'
import { mulberry32 } from '../engine/rng'
import { nearestFlat } from './facemap'
import { CUP, DIE_SIZE, PAD, makeCup, makeDie, makeMaterials, makeWorld, onImpact } from './physics'
import { Playback } from './playback'
import { seededLaunches, simulateRoll, slotPosition } from './simulate'
import type { DieLaunch } from './simulate'
import type { Stage } from './scene'

export type RollPhase = 'idle' | 'shaking' | 'rolling' | 'done'

export interface DirectorHooks {
  onPhase?(phase: RollPhase): void
  /** A die hit something during throw playback. */
  onImpact?(strength: number): void
  /** Dice rattled inside the cup; fire audio grain + haptic tick. */
  onRattle?(intensity: number): void
  onThrown?(): void
  /** Playback done; the authoritative faces are on the felt. */
  onRevealed?(faces: number[]): void
}

/** Cup hover anchor: above the pad, near the player's edge. */
const CUP_Y = 4.8
const CUP_Z = 3.2
const CUP_X_RANGE = 3.4

interface Tween {
  mesh: Mesh
  from: Vector3
  to: Vector3
  qFrom: Quaternion
  qTo: Quaternion
  t: number
  dur: number
}

export class RollDirector {
  phase: RollPhase = 'idle'
  /** 0..1, written by the input adapter every frame while shaking. */
  intensity = 0
  /** Normalized horizontal pointer (0..1) steering the cup. */
  pointerX = 0.5

  private stage: Stage
  private hooks: DirectorHooks
  private time = 0

  // live rattle sim
  private liveWorld: CANNON.World | null = null
  private liveDice: CANNON.Body[] = []
  private liveCup: ReturnType<typeof makeCup> | null = null
  private thrownIdx: number[] = []
  private heldMask: boolean[] = [false, false, false, false, false]
  private rattleCooldown = 0
  private cupPose = { x: 0, tiltX: 0, tiltZ: 0 }

  // observer auto-shake
  private autoShake: { elapsed: number; lead: number; pending: () => void } | null = null

  // playback
  private playback: Playback | null = null
  private playT = 0
  private pendingFaces: number[] = []
  private cupToss = -1 // >=0: animating the cup throw flourish

  private tweens: Tween[] = []
  private lastShownFaces: number[] = [0, 0, 0, 0, 0]

  constructor(stage: Stage, hooks: DirectorHooks = {}) {
    this.stage = stage
    this.hooks = hooks
  }

  private setPhase(p: RollPhase): void {
    if (this.phase === p) return
    this.phase = p
    this.hooks.onPhase?.(p)
  }

  /* ---------------- static display ---------------- */

  /**
   * Instantly show a settled table: held dice in the pad slots, the rest
   * scattered deterministically (seed derived from the faces). Used on cold
   * start, resync, reduced-motion and skip.
   */
  showFaces(faces: number[], held: boolean[]): void {
    this.clearLive()
    this.playback = null
    this.stage.cup.visible = false
    this.lastShownFaces = [...faces]
    this.heldMask = [...held]
    // face 0 = not yet rolled this turn: those dice wait in the player's
    // hand, not on the felt
    const rolled = faces.map((f, i) => ({ f, i })).filter(({ f, i }) => !held[i] && f > 0)
    faces.forEach((f, i) => {
      this.stage.dice[i].visible = held[i] || f > 0
    })
    if (rolled.length > 0) {
      const seed = faces.reduce((a, f, i) => a * 7 + f + i, 3) >>> 0
      const launches = seededLaunches(seed, rolled.length, 0.5)
      const rec = simulateRoll(launches, seed)
      const pb = new Playback(rec, rolled.map(({ f }) => f))
      pb.finish(rolled.map(({ i }) => this.stage.dice[i]))
    }
    faces.forEach((f, i) => {
      if (held[i]) this.placeInSlot(i, f || 1, false)
    })
    this.setPhase('idle')
  }

  /** Animate a die into (or out of) its hold slot. */
  setHeld(i: number, held: boolean): void {
    this.heldMask[i] = held
    if (held) this.placeInSlot(i, this.lastShownFaces[i] || 1, true)
    // un-holding leaves the die where it sits; it will pour into the next cup
  }

  private placeInSlot(i: number, face: number, animate: boolean): void {
    const die = this.stage.dice[i]
    const [x, y, z] = slotPosition(i)
    const to = new Vector3(x, y, z)
    const qTo = nearestFlat(die.quaternion.clone())
    if (!animate) {
      die.position.copy(to)
      die.quaternion.copy(qTo)
      return
    }
    this.tweens.push({
      mesh: die,
      from: die.position.clone(),
      to,
      qFrom: die.quaternion.clone(),
      qTo,
      t: 0,
      dur: 0.28,
    })
  }

  /* ---------------- interactive roll ---------------- */

  /** Raise the cup and start the live rattle sim with the unheld dice. */
  pickup(held: boolean[]): void {
    if (this.phase === 'shaking' || this.phase === 'rolling') return
    this.heldMask = [...held]
    this.thrownIdx = held.flatMap((h, i) => (h ? [] : [i]))
    this.buildLiveWorld()
    this.stage.cup.visible = true
    this.setPhase('shaking')
  }

  /** Lower the cup without throwing (input cancelled / permission denied). */
  cancelShake(): void {
    if (this.phase !== 'shaking') return
    this.clearLive()
    this.stage.cup.visible = false
    this.showFaces(this.lastShownFaces, this.heldMask)
  }

  /**
   * Commit the throw. `faces` are the engine's authoritative results for ALL
   * five dice (held ones keep their old values and stay put); `dir` is the
   * horizontal throw direction, `speed` 0..1 the gesture energy.
   */
  throwDice(faces: number[], dir: [number, number], speed: number): void {
    if (this.phase !== 'shaking') return
    this.lastShownFaces = [...faces]
    const launches = this.launchesFromLive(dir, speed)
    this.beginPlayback(faces, launches, (faces.length * 31 + Math.floor(speed * 97)) >>> 0)
  }

  /**
   * An observed roll (remote player / auto-roll): a short canned shake, then
   * a throw seeded so every observer sees the identical flight.
   */
  playObserved(faces: number[], held: boolean[], seed: number, vigor = 0.75): void {
    if (this.phase === 'rolling') return
    this.heldMask = [...held]
    this.thrownIdx = held.flatMap((h, i) => (h ? [] : [i]))
    this.lastShownFaces = [...faces]
    this.stage.cup.visible = true
    for (const i of this.thrownIdx) this.stage.dice[i].visible = false
    this.setPhase('shaking')
    this.autoShake = {
      elapsed: 0,
      lead: 0.9,
      pending: () => {
        const launches = seededLaunches(seed, this.thrownIdx.length, vigor)
        this.beginPlayback(faces, launches, seed)
      },
    }
  }

  private beginPlayback(faces: number[], launches: DieLaunch[], nudgeSeed: number): void {
    const rec = simulateRoll(launches, nudgeSeed)
    const targetFaces = this.thrownIdx.map((i) => faces[i])
    this.playback = new Playback(rec, targetFaces, {
      onImpact: (s) => this.hooks.onImpact?.(s),
    })
    // the cup tips first; the dice stay hidden inside it until the mouth
    // has cleared, then the recording takes over from the mouth position
    this.playT = -0.22
    this.clearLive()
    for (const i of this.thrownIdx) this.stage.dice[i].visible = false
    this.cupToss = 0
    this.hooks.onThrown?.()
    this.setPhase('rolling')
  }

  /** Skip the rest of the playback (tap-to-skip, reduced motion). */
  skip(): void {
    if (this.phase !== 'rolling' || !this.playback) return
    this.playback.finish(this.thrownIdx.map((i) => this.stage.dice[i]))
    this.finishRoll()
  }

  private finishRoll(): void {
    // the pour keeps dice hidden until t=0; a skip may land here first
    for (const i of this.thrownIdx) this.stage.dice[i].visible = true
    this.playback = null
    this.stage.cup.visible = false
    this.stage.camPush.value = 0
    this.setPhase('done')
    this.hooks.onRevealed?.([...this.lastShownFaces])
    this.setPhase('idle')
  }

  /* ---------------- live rattle sim ---------------- */

  private buildLiveWorld(): void {
    this.clearLive()
    const world = makeWorld()
    world.gravity.set(0, -30, 0) // gentler inside the cup: dice float and rattle
    const { die: dieMat, table } = makeMaterials(world)
    this.liveCup = makeCup(world, table)
    this.liveDice = this.thrownIdx.map((_, k) => {
      const body = makeDie(dieMat)
      // stack well inside the cup interior, clear of every panel
      body.position.set(
        (k % 2) * 0.8 - 0.4,
        CUP_Y - CUP.height / 2 + 0.9 + Math.floor(k / 2) * 1.05,
        CUP_Z + (k % 3) * 0.3 - 0.3,
      )
      body.allowSleep = false
      world.addBody(body)
      onImpact(body, () => {
        if (this.rattleCooldown <= 0) {
          this.hooks.onRattle?.(this.intensity)
          this.rattleCooldown = 0.03
        }
      })
      return body
    })
    this.liveWorld = world
  }

  private clearLive(): void {
    this.liveWorld = null
    this.liveDice = []
    this.liveCup = null
  }

  /**
   * Launch states for the pour: the dice leave from the CUP'S MOUTH as it
   * tips forward, one after another, so the playback reads as the cup
   * emptying — not as dice materializing mid-air.
   */
  private launchesFromLive(dir: [number, number], speed: number): DieLaunch[] {
    const [dx, dz] = normalize2(dir)
    const power = 9 + 14 * Math.min(1, speed)
    const rng = mulberry32((Math.floor(speed * 1e4) + 17) >>> 0)
    // mouth of the tipping cup: just forward of and slightly below the rim
    const mx = Math.max(-PAD.halfW + 2, Math.min(PAD.halfW - 2, this.cupPose.x))
    const my = CUP_Y - 0.2
    const mz = CUP_Z - CUP.height / 2 - 0.4
    return this.liveDice.map((body, k) => {
      return {
        position: [
          mx + (rng() - 0.5) * 1.2,
          my + (rng() - 0.5) * 0.8,
          mz - k * 0.55, // successive dice slightly further out of the mouth
        ],
        velocity: [
          dx * power + body.velocity.x * 0.25 + (rng() - 0.5) * 2,
          -1 - rng() * 2, // pouring downward-forward, never popping up
          dz * power + body.velocity.z * 0.25 - k * 0.8,
        ],
        angular: [
          body.angularVelocity.x + (rng() - 0.5) * 16 * (0.5 + speed),
          body.angularVelocity.y + (rng() - 0.5) * 16 * (0.5 + speed),
          body.angularVelocity.z + (rng() - 0.5) * 16 * (0.5 + speed),
        ],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
      } satisfies DieLaunch
    })
  }

  /* ---------------- frame loop ---------------- */

  frame(dt: number): void {
    this.time += dt
    this.rattleCooldown -= dt
    this.stepTweens(dt)

    if (this.phase === 'shaking') {
      if (this.autoShake) {
        this.autoShake.elapsed += dt
        this.intensity = Math.min(0.85, this.autoShake.elapsed / this.autoShake.lead)
        this.pointerX = 0.5 + Math.sin(this.time * 3) * 0.08
        if (this.autoShake.elapsed >= this.autoShake.lead) {
          const fire = this.autoShake.pending
          this.autoShake = null
          fire()
          return
        }
      }
      this.stepLive(dt)
    } else if (this.phase === 'rolling' && this.playback) {
      this.playT += dt
      const t = Math.max(0, this.playT)
      const meshes = this.thrownIdx.map((i) => this.stage.dice[i])
      if (this.playT >= 0 && meshes.some((m) => !m.visible)) {
        for (const m of meshes) m.visible = true
      }
      const playing = this.playback.seek(t, meshes) || this.playT < 0
      // camera pushes in as the last die settles
      const lead = this.playback.duration - 0.6
      this.stage.camPush.value = Math.max(0, Math.min(1, (t - lead) / 0.6)) * 0.5
      this.stepCupToss(dt)
      if (!playing) this.finishRoll()
    } else {
      // idle: relax any camera drama
      this.stage.camPush.value *= Math.max(0, 1 - dt * 4)
      this.stage.camShake.multiplyScalar(Math.max(0, 1 - dt * 8))
    }
  }

  private stepLive(dt: number): void {
    if (!this.liveWorld || !this.liveCup) return
    const i = this.intensity
    // cup follows the pointer with jitter scaled by intensity
    const targetX = (this.pointerX - 0.5) * 2 * CUP_X_RANGE
    this.cupPose.x += (targetX - this.cupPose.x) * Math.min(1, dt * 14)
    const jx = Math.sin(this.time * 26) * 0.32 * i + Math.sin(this.time * 15.3) * 0.18 * i
    const jy = Math.sin(this.time * 22.1 + 1.3) * 0.3 * i
    const jz = Math.sin(this.time * 19.7 + 2.1) * 0.2 * i
    const tiltX = Math.sin(this.time * 16.3) * 0.16 * i
    const tiltZ = Math.sin(this.time * 20.7 + 0.7) * 0.16 * i
    const cx = this.cupPose.x + jx
    const cy = CUP_Y + jy
    const cz = CUP_Z + jz
    this.liveCup.setPose(cx, cy, cz, tiltX, tiltZ)
    // fine fixed steps: kinematic panels teleport, so coarse steps tunnel
    this.liveWorld.step(1 / 120, dt, 8)

    // belt and braces: any die that still slipped a panel gets recaptured
    for (const body of this.liveDice) {
      const dx = body.position.x - cx
      const dy = body.position.y - cy
      const dz = body.position.z - cz
      if (Math.hypot(dx, dz) > CUP.radius * 1.5 || Math.abs(dy) > CUP.height * 0.9) {
        body.position.set(cx, cy, cz)
        body.velocity.set(0, -2, 0)
        body.angularVelocity.scale(0.3, body.angularVelocity)
      }
    }

    // sync meshes
    this.stage.cup.position.set(cx, cy, cz)
    this.stage.cup.rotation.set(tiltX, 0, tiltZ)
    this.thrownIdx.forEach((mi, k) => {
      const body = this.liveDice[k]
      const mesh = this.stage.dice[mi]
      mesh.visible = true
      mesh.position.set(body.position.x, body.position.y, body.position.z)
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w,
      )
    })

    // camera drama scales with intensity
    this.stage.camShake.set(
      (Math.sin(this.time * 41) + Math.sin(this.time * 29.7)) * 0.05 * i,
      Math.sin(this.time * 37.3) * 0.04 * i,
      0,
    )
  }

  private stepCupToss(dt: number): void {
    if (this.cupToss < 0) return
    this.cupToss += dt
    const cup = this.stage.cup
    // phase 1 (0–0.25s): tip forward so the mouth faces the pad — the pour.
    // phase 2 (0.25–0.7s): lift away and fade out of frame.
    const tip = Math.min(1, this.cupToss / 0.25)
    const e = tip * tip * (3 - 2 * tip)
    cup.rotation.x = -1.9 * e
    cup.position.z = CUP_Z - 1.1 * e
    cup.position.y = CUP_Y + 0.2 * e
    if (this.cupToss > 0.25) {
      const away = Math.min(1, (this.cupToss - 0.25) / 0.45)
      cup.position.y = CUP_Y + 0.2 + 2.6 * away * away
      cup.position.z = CUP_Z - 1.1 + 1.4 * away
      if (away >= 1) {
        cup.visible = false
        cup.rotation.set(0, 0, 0)
        this.cupToss = -1
      }
    }
  }

  private stepTweens(dt: number): void {
    for (const tw of this.tweens) {
      tw.t += dt
      const k = Math.min(1, tw.t / tw.dur)
      const e = k * k * (3 - 2 * k)
      tw.mesh.position.copy(tw.from.clone().lerp(tw.to, e))
      tw.mesh.quaternion.copy(tw.qFrom.clone().slerp(tw.qTo, e))
    }
    this.tweens = this.tweens.filter((tw) => tw.t < tw.dur)
  }

  dispose(): void {
    this.clearLive()
    this.playback = null
  }
}

function normalize2([x, z]: [number, number]): [number, number] {
  const len = Math.hypot(x, z)
  if (len < 1e-6) return [0, -1]
  return [x / len, z / len]
}
