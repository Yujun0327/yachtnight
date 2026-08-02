/**
 * Headless throw simulation: given initial die states, run cannon-es to
 * completion in one synchronous pass (~15ms wall for a 4s flight), recording
 * 60 Hz transform frames, impact events and settle times. The caller remaps
 * each die's orientation so the ENGINE-decided face ends up on top — this
 * sim's own top faces are only the "natural" side of that mapping.
 */
import * as CANNON from 'cannon-es'
import { Quaternion } from 'three'
import { mulberry32 } from '../engine/rng'
import { flatness, topFaceOf } from './facemap'
import { PAD, TRAY, addPad, makeDie, makeMaterials, makeWorld } from './physics'

export interface DieLaunch {
  position: [number, number, number]
  velocity: [number, number, number]
  angular: [number, number, number]
  quaternion: [number, number, number, number]
}

export interface ImpactEvent {
  t: number
  die: number
  strength: number
}

export interface RollRecording {
  diceCount: number
  frameRate: number
  frameCount: number
  /** frameCount × diceCount × 7 floats: pos xyz + quat xyzw. */
  frames: Float32Array
  naturalFaces: number[]
  impacts: ImpactEvent[]
  /** Seconds into the recording at which each die last came to rest. */
  settleTimes: number[]
  duration: number
}

const STEP = 1 / 120
const RECORD_EVERY = 2 // 60 Hz
const MAX_TIME = 6
const SETTLE_LIN = 0.35
const SETTLE_ANG = 0.6

/**
 * Launch states for an observer/auto roll (remote player's throw, skip
 * animation resume, keyboard roll): seeded so every client that runs the
 * same (seed) sees the identical nice-looking throw.
 */
export function seededLaunches(seed: number, count: number, vigor = 0.7): DieLaunch[] {
  const rng = mulberry32(seed)
  const out: DieLaunch[] = []
  // pour from the cup's spot: front-center of the pad, throwing inward,
  // matching the tipping-cup choreography every observer sees
  const lean = (rng() - 0.5) * 3
  for (let i = 0; i < count; i++) {
    out.push({
      position: [
        lean + (rng() - 0.5) * 1.4,
        4.2 + rng() * 1.0 + i * 0.2,
        PAD.halfD - 1.6 - i * 0.5,
      ],
      velocity: [
        (rng() - 0.5) * 5,
        -1 - rng() * 2,
        -(8 + 8 * vigor + rng() * 4) - i * 0.7,
      ],
      angular: [
        (rng() - 0.5) * 24 * (0.4 + vigor),
        (rng() - 0.5) * 24 * (0.4 + vigor),
        (rng() - 0.5) * 24 * (0.4 + vigor),
      ],
      quaternion: randomQuat(rng),
    })
  }
  return out
}

function randomQuat(rng: () => number): [number, number, number, number] {
  // uniform random rotation (Shoemake)
  const u1 = rng()
  const u2 = rng() * Math.PI * 2
  const u3 = rng() * Math.PI * 2
  const a = Math.sqrt(1 - u1)
  const b = Math.sqrt(u1)
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)]
}

export function simulateRoll(launches: DieLaunch[], nudgeSeed = 1): RollRecording {
  const nudgeRng = mulberry32(nudgeSeed)
  const world = makeWorld()
  const { die: dieMat, table } = makeMaterials(world)
  addPad(world, table)

  const dice = launches.map((l) => {
    const body = makeDie(dieMat)
    body.position.set(...l.position)
    body.velocity.set(...l.velocity)
    body.angularVelocity.set(...l.angular)
    body.quaternion.set(...l.quaternion)
    world.addBody(body)
    return body
  })

  const impacts: ImpactEvent[] = []
  let simTime = 0
  dice.forEach((body, i) => {
    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
      if (v > 1.2 && impacts.length < 200) {
        impacts.push({ t: simTime, die: i, strength: Math.min(1, v / 16) })
      }
    })
  })

  const frames: number[] = []
  const settleTimes = new Array<number>(launches.length).fill(0)
  const settled = new Array<boolean>(launches.length).fill(false)
  let frameCount = 0
  let steps = 0
  let lastNudge = 0

  const record = () => {
    for (const body of dice) {
      frames.push(
        body.position.x,
        body.position.y,
        body.position.z,
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w,
      )
    }
    frameCount++
  }

  record()
  const q = new Quaternion()
  while (simTime < MAX_TIME) {
    world.step(STEP)
    simTime += STEP
    steps++

    dice.forEach((body, i) => {
      const moving =
        body.velocity.length() > SETTLE_LIN || body.angularVelocity.length() > SETTLE_ANG
      if (moving) {
        settled[i] = false
      } else if (!settled[i]) {
        settled[i] = true
        settleTimes[i] = simTime
      }
    })

    if (steps % RECORD_EVERY === 0) record()

    if (settled.every(Boolean) && simTime > 0.5) {
      const cocked = dice.filter((body) => {
        q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        return flatness(q) < 0.985
      })
      if (cocked.length === 0) break
      if (simTime >= MAX_TIME - 1.2) break // give up; playback's flatten pass corrects
      // hop cocked dice up and toward the pad center (off walls / other dice)
      if (simTime - lastNudge > 0.5) {
        for (const body of cocked) {
          body.wakeUp()
          const toCenter = Math.hypot(body.position.x, body.position.z) || 1
          body.velocity.x += (-body.position.x / toCenter) * (2 + nudgeRng() * 2)
          body.velocity.z += (-body.position.z / toCenter) * (2 + nudgeRng() * 2)
          body.velocity.y += 6 + nudgeRng() * 2
          body.angularVelocity.x += (nudgeRng() - 0.5) * 8
          body.angularVelocity.z += (nudgeRng() - 0.5) * 8
        }
        lastNudge = simTime
      }
    }
  }

  const naturalFaces = dice.map((body) => {
    q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    return topFaceOf(q)
  })

  return {
    diceCount: launches.length,
    frameRate: 60,
    frameCount,
    frames: new Float32Array(frames),
    naturalFaces,
    impacts,
    settleTimes,
    duration: simTime,
  }
}

/** Center of keep-tray well i (held dice never enter the cup). */
export function slotPosition(i: number): [number, number, number] {
  return [(i - 2) * TRAY.pitch, TRAY.dieY, TRAY.z]
}
