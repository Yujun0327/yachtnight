/**
 * Pure math for forcing authoritative die faces without any visible snap.
 *
 * The engine decides the faces; the physics sim decides the motion. For die
 * i whose sim settles with natural face n up, we pick a cube-symmetry
 * rotation R that maps target face a's normal onto face n's normal in LOCAL
 * space, and render meshQuat = simQuat * R for the WHOLE flight. The die
 * tumbles already "relabeled", lands showing a, and no frame ever jumps.
 */
import { Quaternion, Vector3 } from 'three'

/** Western-standard die: 1 opposite 6, 2 opposite 5, 3 opposite 4. */
export const FACE_NORMALS: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0),
  2: new Vector3(0, 0, 1),
  3: new Vector3(1, 0, 0),
  4: new Vector3(-1, 0, 0),
  5: new Vector3(0, 0, -1),
  6: new Vector3(0, -1, 0),
}

const UP = new Vector3(0, 1, 0)

/** All 24 rotations of the cube group, generated deterministically. */
export const CUBE_ROTATIONS: readonly Quaternion[] = (() => {
  const faceUp: Quaternion[] = [
    new Quaternion(), // +Y stays up
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI), // -Y up
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2), // +X→up
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2),
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
  ]
  const twists = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) =>
    new Quaternion().setFromAxisAngle(UP, a),
  )
  const all: Quaternion[] = []
  for (const f of faceUp) for (const t of twists) all.push(f.clone().multiply(t))
  return all
})()

const tmp = new Vector3()

/** Which face (1–6) points most nearly world-up under this orientation? */
export function topFaceOf(quat: Quaternion): number {
  let best = 1
  let bestDot = -Infinity
  for (let f = 1; f <= 6; f++) {
    const d = tmp.copy(FACE_NORMALS[f]).applyQuaternion(quat).dot(UP)
    if (d > bestDot) {
      bestDot = d
      best = f
    }
  }
  return best
}

/** How flat the die lies: 1 = perfectly flat, lower = cocked. */
export function flatness(quat: Quaternion): number {
  let bestDot = -Infinity
  for (let f = 1; f <= 6; f++) {
    const d = tmp.copy(FACE_NORMALS[f]).applyQuaternion(quat).dot(UP)
    if (d > bestDot) bestDot = d
  }
  return bestDot
}

/**
 * A cube rotation R with R · normal(target) = normal(natural). Four of the
 * 24 qualify (any twist about the face axis); `variant` 0–3 picks among them
 * deterministically so every observer chooses the same one.
 */
export function remapQuaternion(natural: number, target: number, variant = 0): Quaternion {
  const want = FACE_NORMALS[natural]
  const from = FACE_NORMALS[target]
  const matches: Quaternion[] = []
  for (const r of CUBE_ROTATIONS) {
    if (tmp.copy(from).applyQuaternion(r).distanceToSquared(want) < 1e-6) matches.push(r)
  }
  return matches[variant % matches.length].clone()
}

/**
 * The nearest perfectly-flat orientation with the same top face, preserving
 * the die's heading — the target of the end-of-playback settle correction
 * for cocked dice. Minimal world-frame tilt correction, no yaw change.
 */
export function nearestFlat(quat: Quaternion): Quaternion {
  const f = topFaceOf(quat)
  const world = tmp.copy(FACE_NORMALS[f]).applyQuaternion(quat).normalize()
  const corr = new Quaternion().setFromUnitVectors(world.clone(), UP)
  return corr.multiply(quat.clone())
}
