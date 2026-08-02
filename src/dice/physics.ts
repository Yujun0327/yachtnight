/**
 * cannon-es world factory for both the live rattle sim (dice inside a
 * shaking kinematic cup) and the headless throw sim. Pure JS — this whole
 * module runs in vitest's node environment.
 *
 * Units: one die edge = 1. Gravity is tuned (not 9.82) so the motion reads
 * as small, dense casino dice; all constants live here so the lab can tune.
 */
import * as CANNON from 'cannon-es'

export const DIE_SIZE = 1
export const DICE_COUNT = 5

/**
 * The rolling pad: a walled rectangle the dice must stay inside. The visual
 * rim is low; the physics walls extend far higher so no throw can escape.
 */
export const PAD = { halfW: 7.2, halfD: 5.0, wallH: 12 }

/**
 * The keep tray behind the pad: five felt-lined wells that held dice fly
 * into. Display-only — held dice never simulate.
 */
export const TRAY = {
  z: -(PAD.halfD + 2.6),
  pitch: 2.0,
  well: 1.7,
  baseH: 0.5,
  /** resting center height of a die sitting in a well */
  dieY: 0.5 + DIE_SIZE / 2,
}

export const TUNING = {
  gravity: -55,
  restitution: 0.38,
  friction: 0.22,
  linearDamping: 0.08,
  angularDamping: 0.08,
  /** below these speeds a die counts as settled */
  sleepSpeed: 0.9,
  sleepTime: 0.28,
}

export interface ImpactListener {
  (strength: number): void
}

export function makeMaterials(world: CANNON.World) {
  const die = new CANNON.Material('die')
  const table = new CANNON.Material('table')
  world.addContactMaterial(
    new CANNON.ContactMaterial(die, table, {
      restitution: TUNING.restitution,
      friction: TUNING.friction,
    }),
  )
  world.addContactMaterial(
    new CANNON.ContactMaterial(die, die, {
      restitution: 0.45,
      friction: 0.18,
    }),
  )
  return { die, table }
}

export function makeWorld(): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, TUNING.gravity, 0) })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true
  return world
}

export function makeDie(material: CANNON.Material): CANNON.Body {
  const half = DIE_SIZE / 2
  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
    material,
    linearDamping: TUNING.linearDamping,
    angularDamping: TUNING.angularDamping,
    sleepSpeedLimit: TUNING.sleepSpeed,
    sleepTimeLimit: TUNING.sleepTime,
  })
  return body
}

/** Static felt floor + four pad walls (invisible; the rim mesh covers them). */
export function addPad(world: CANNON.World, material: CANNON.Material): void {
  const floor = new CANNON.Body({ mass: 0, material })
  floor.addShape(new CANNON.Plane())
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2)
  world.addBody(floor)

  const t = 0.5 // wall thickness
  const h = PAD.wallH
  const walls: Array<[number, number, number, number, number, number]> = [
    // [cx, cy, cz, hx, hy, hz]
    [0, h / 2, -PAD.halfD - t, PAD.halfW + 2 * t, h / 2, t],
    [0, h / 2, PAD.halfD + t, PAD.halfW + 2 * t, h / 2, t],
    [-PAD.halfW - t, h / 2, 0, t, h / 2, PAD.halfD + 2 * t],
    [PAD.halfW + t, h / 2, 0, t, h / 2, PAD.halfD + 2 * t],
  ]
  for (const [cx, cy, cz, hx, hy, hz] of walls) {
    const wall = new CANNON.Body({ mass: 0, material })
    wall.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)))
    wall.position.set(cx, cy, cz)
    world.addBody(wall)
  }
}

/* ------------------------------------------------------------------ */
/* the cup: a kinematic open cylinder built from box panels            */
/* ------------------------------------------------------------------ */

export const CUP = { radius: 1.9, height: 3.4, panels: 8 }

export interface CupBody {
  panels: CANNON.Body[]
  /** Pose the whole cup: center position + tilt. Call every live-sim frame. */
  setPose(x: number, y: number, z: number, tiltX: number, tiltZ: number): void
}

export function makeCup(world: CANNON.World, material: CANNON.Material): CupBody {
  const bodies: CANNON.Body[] = []
  const panelW = (2 * Math.PI * CUP.radius) / CUP.panels
  // side panels + floor disk + ceiling (a closed shaker while rattling).
  // Panels are FAT (0.5 half-thickness) — kinematic bodies teleport each
  // frame, so thin walls let fast dice tunnel straight through.
  for (let i = 0; i < CUP.panels; i++) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material })
    b.addShape(new CANNON.Box(new CANNON.Vec3(panelW / 2 + 0.25, CUP.height / 2 + 0.3, 0.5)))
    world.addBody(b)
    bodies.push(b)
  }
  const floor = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material })
  floor.addShape(new CANNON.Box(new CANNON.Vec3(CUP.radius + 0.5, 0.35, CUP.radius + 0.5)))
  world.addBody(floor)
  bodies.push(floor)
  const lid = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material })
  lid.addShape(new CANNON.Box(new CANNON.Vec3(CUP.radius + 0.5, 0.35, CUP.radius + 0.5)))
  world.addBody(lid)
  bodies.push(lid)

  const q = new CANNON.Quaternion()
  const tilt = new CANNON.Quaternion()

  function setPose(x: number, y: number, z: number, tiltX: number, tiltZ: number): void {
    tilt.setFromEuler(tiltX, 0, tiltZ)
    for (let i = 0; i < CUP.panels; i++) {
      const a = ((i + 0.5) / CUP.panels) * Math.PI * 2
      // panel centers sit half a thickness OUTSIDE the interior radius
      const px = Math.cos(a) * (CUP.radius + 0.5)
      const pz = Math.sin(a) * (CUP.radius + 0.5)
      q.setFromEuler(0, -a + Math.PI / 2, 0)
      const local = new CANNON.Vec3(px, 0, pz)
      const rotated = tilt.vmult(local)
      bodies[i].position.set(x + rotated.x, y + rotated.y, z + rotated.z)
      bodies[i].quaternion = tilt.mult(q)
    }
    const fl = tilt.vmult(new CANNON.Vec3(0, -CUP.height / 2 - 0.35, 0))
    bodies[CUP.panels].position.set(x + fl.x, y + fl.y, z + fl.z)
    bodies[CUP.panels].quaternion.copy(tilt)
    const ld = tilt.vmult(new CANNON.Vec3(0, CUP.height / 2 + 0.35, 0))
    bodies[CUP.panels + 1].position.set(x + ld.x, y + ld.y, z + ld.z)
    bodies[CUP.panels + 1].quaternion.copy(tilt)
  }

  return { panels: bodies, setPose }
}

/** Wire impact reporting on a die body (rattle grains, felt thumps). */
export function onImpact(body: CANNON.Body, fn: ImpactListener): void {
  body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
    if (v > 0.8) fn(Math.min(1, v / 14))
  })
}
