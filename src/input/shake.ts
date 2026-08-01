/**
 * Physical phone shake → intensity. High-passed |accelerationIncludingGravity|
 * (gravity tracked with an EMA), attack/release envelope, runtime auto-gain
 * so wildly different Android sensor scales all reach full intensity.
 *
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from inside a user
 * gesture; denial is remembered so we never re-prompt, and the touch-scrub
 * fallback takes over seamlessly.
 */

const DENIED_KEY = 'yachtnight:motion-denied'

type PermissionResult = 'granted' | 'denied' | 'unsupported'

interface MotionEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function motionSupported(): boolean {
  return typeof DeviceMotionEvent !== 'undefined'
}

export function motionDenied(): boolean {
  return localStorage.getItem(DENIED_KEY) === '1'
}

/** Call from a user gesture (first touch on the cup). */
export async function requestMotionPermission(): Promise<PermissionResult> {
  if (!motionSupported()) return 'unsupported'
  if (motionDenied()) return 'denied'
  const ctor = DeviceMotionEvent as unknown as MotionEventCtor
  if (typeof ctor.requestPermission !== 'function') return 'granted' // Android / desktop
  try {
    const res = await ctor.requestPermission()
    if (res !== 'granted') localStorage.setItem(DENIED_KEY, '1')
    return res
  } catch {
    localStorage.setItem(DENIED_KEY, '1')
    return 'denied'
  }
}

export class ShakeSource {
  /** Live envelope value 0..1 — poll each frame. */
  intensity = 0

  private gravity = 9.81
  private peak = 4 // rolling peak for auto-gain (m/s²)
  private raw = 0
  private lastT = 0
  private listener = (e: DeviceMotionEvent) => this.onMotion(e)
  private raf = 0

  start(): void {
    window.addEventListener('devicemotion', this.listener)
    this.lastT = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - this.lastT) / 1000)
      this.lastT = now
      // envelope: fast attack (~50ms), slow release (~400ms)
      const target = Math.min(1, this.raw)
      const rate = target > this.intensity ? dt / 0.05 : dt / 0.4
      this.intensity += (target - this.intensity) * Math.min(1, rate)
      this.raw *= Math.max(0, 1 - dt * 6) // decay between motion events
      this.peak = Math.max(4, this.peak * (1 - dt * 0.05)) // auto-gain slowly relaxes
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.listener)
    cancelAnimationFrame(this.raf)
    this.intensity = 0
    this.raw = 0
  }

  private onMotion(e: DeviceMotionEvent): void {
    const a = e.accelerationIncludingGravity
    if (!a || a.x === null) return
    const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0)
    // track gravity as a slow EMA of the magnitude; shake = deviation from it
    this.gravity += (mag - this.gravity) * 0.02
    const dev = Math.abs(mag - this.gravity)
    if (dev > this.peak) this.peak = dev
    this.raw = Math.max(this.raw, dev / (this.peak * 0.75))
  }
}
