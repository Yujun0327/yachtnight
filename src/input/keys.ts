/**
 * Keyboard ritual: hold Space to raise the cup, mash ← → alternately to
 * build intensity (mash cadence = fury), release Space to throw. The
 * accessible path to the same drama.
 */
import type { RollInputSink } from './types'

export function attachKeys(sink: RollInputSink): () => void {
  let holding = false
  let intensity = 0
  let lastArrow: 'left' | 'right' | null = null
  let lastT = 0
  let raf = 0

  function frame(now: number): void {
    if (!holding) return
    const dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    intensity *= Math.max(0, 1 - dt * 1.6)
    sink.update(Math.min(1, intensity), 0.5)
    raf = requestAnimationFrame(frame)
  }

  function keydown(e: KeyboardEvent): void {
    if (e.repeat) return
    if (e.code === 'Space' && !holding) {
      holding = true
      intensity = 0
      lastArrow = null
      lastT = performance.now()
      sink.begin()
      raf = requestAnimationFrame(frame)
      e.preventDefault()
    } else if (holding && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      const arrow = e.code === 'ArrowLeft' ? 'left' : 'right'
      // only ALTERNATING presses build the shake — a real back-and-forth
      intensity = Math.min(1, intensity + (arrow !== lastArrow ? 0.22 : 0.06))
      lastArrow = arrow
      e.preventDefault()
    } else if (holding && e.code === 'Escape') {
      holding = false
      cancelAnimationFrame(raf)
      sink.cancel()
    }
  }

  function keyup(e: KeyboardEvent): void {
    if (e.code === 'Space' && holding) {
      holding = false
      cancelAnimationFrame(raf)
      sink.commit([0, -1], Math.max(0.25, intensity))
      e.preventDefault()
    }
  }

  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
  }
}
