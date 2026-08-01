/**
 * Pointer hold-and-scrub: press the cup, scrub/wiggle to build intensity,
 * release with velocity to throw along the release vector; a slow release
 * pours gently. Works for mouse AND as the touch fallback when device
 * motion is denied — on touch the phone-shake intensity is merged in by the
 * caller, so this adapter only ever raises intensity, never caps it.
 */
import type { RollInputSink } from './types'

interface Sample {
  x: number
  y: number
  t: number
}

export function attachScrub(el: HTMLElement, sink: RollInputSink): () => void {
  let active = false
  let pointerId = -1
  let samples: Sample[] = []
  let intensity = 0
  let lastT = 0
  let raf = 0

  function frame(now: number): void {
    if (!active) return
    const dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    intensity *= Math.max(0, 1 - dt * 2.4) // decays unless the scrub keeps feeding it
    const rect = el.getBoundingClientRect()
    const px = samples.length
      ? (samples[samples.length - 1].x - rect.left) / rect.width
      : 0.5
    sink.update(Math.min(1, intensity), Math.min(1, Math.max(0, px)))
    raf = requestAnimationFrame(frame)
  }

  function down(e: PointerEvent): void {
    if (active) return
    active = true
    pointerId = e.pointerId
    el.setPointerCapture(e.pointerId)
    samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    intensity = 0
    lastT = performance.now()
    sink.begin()
    raf = requestAnimationFrame(frame)
    e.preventDefault()
  }

  function move(e: PointerEvent): void {
    if (!active || e.pointerId !== pointerId) return
    const now = performance.now()
    const prev = samples[samples.length - 1]
    const dt = Math.max(1, now - prev.t)
    const speed = Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / dt // px per ms
    // ~2.2 px/ms of scrubbing reads as full fury
    intensity = Math.min(1, intensity + speed * 0.14)
    samples.push({ x: e.clientX, y: e.clientY, t: now })
    if (samples.length > 12) samples.shift()
  }

  function up(e: PointerEvent): void {
    if (!active || e.pointerId !== pointerId) return
    active = false
    cancelAnimationFrame(raf)
    // release vector over the last ~90ms
    const now = performance.now()
    const windowStart = samples.findIndex((s) => now - s.t < 90)
    const first = samples[windowStart === -1 ? samples.length - 1 : windowStart]
    const last = samples[samples.length - 1]
    const dt = Math.max(8, last.t - first.t)
    const vx = (last.x - first.x) / dt
    const vy = (last.y - first.y) / dt
    const speed = Math.hypot(vx, vy)
    // screen up = into the table (world -z); screen x = world x
    const dir: [number, number] = speed > 0.05 ? [vx, vy] : [0, -1]
    sink.commit(dir, Math.min(1, Math.max(0.15, speed / 2.6 + intensity * 0.35)))
  }

  function cancel(e: PointerEvent): void {
    if (!active || e.pointerId !== pointerId) return
    active = false
    cancelAnimationFrame(raf)
    sink.cancel()
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', cancel)
  return () => {
    cancelAnimationFrame(raf)
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
  }
}
