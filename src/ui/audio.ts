/**
 * Tiny WebAudio foley kit — synthesized dice rattles, felt impacts and
 * stings, so the repo ships zero audio binaries. Adapted from splendor;
 * the dice-specific voices (rattle grains, impacts, whoosh) drive the roll
 * ritual and are called by the dice director, not the session event queue.
 */
import type { SfxEvent } from '../app/session.svelte'

let ctx: AudioContext | null = null
let muted = localStorage.getItem('yachtnight:muted') === '1'

function ac(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Resume the context from a user gesture (iOS unlock). Safe to call often. */
export function unlock(): void {
  try {
    ac()
  } catch {
    /* no audio available */
  }
}

export function setMuted(m: boolean): void {
  muted = m
  localStorage.setItem('yachtnight:muted', m ? '1' : '0')
}

export function isMuted(): boolean {
  return muted
}

function tone(
  freq: number,
  { t = 0, dur = 0.12, type = 'triangle' as OscillatorType, vol = 0.18, glide = 0 } = {},
): void {
  const a = ac()
  const osc = a.createOscillator()
  const gain = a.createGain()
  const start = a.currentTime + t
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), start + dur)
  gain.gain.setValueAtTime(vol, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Filtered noise burst — the body of clacks, thuds and whooshes. */
function noise({ t = 0, vol = 0.4, cutoff = 1200, dur = 0.05, type = 'lowpass' as BiquadFilterType } = {}): void {
  const a = ac()
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
  const src = a.createBufferSource()
  src.buffer = buffer
  const filter = a.createBiquadFilter()
  filter.type = type
  filter.frequency.value = cutoff
  const gain = a.createGain()
  gain.gain.value = vol
  src.connect(filter).connect(gain).connect(a.destination)
  src.start(a.currentTime + t)
}

/* ---------------- dice foley (director-driven) ---------------- */

/**
 * One grain of dice-in-cup rattle. The director fires these at a rate and
 * intensity tracking the shake — rising grain density, brightness and volume
 * are the audio crescendo of the ritual.
 */
export function rattleTick(intensity: number): void {
  if (muted) return
  try {
    const i = Math.min(1, Math.max(0, intensity))
    noise({ vol: 0.06 + 0.3 * i, cutoff: 1200 + 4200 * i, dur: 0.03 + 0.02 * Math.random() })
    if (Math.random() < 0.4 * i) {
      noise({ t: 0.015, vol: 0.1 * i, cutoff: 5500, dur: 0.02, type: 'highpass' })
    }
  } catch {
    /* silent */
  }
}

/** A die hitting the felt (or another die) during the throw. strength 0..1. */
export function dieImpact(strength: number): void {
  if (muted) return
  try {
    const s = Math.min(1, Math.max(0, strength))
    noise({ vol: 0.12 + 0.35 * s, cutoff: 500 + 1200 * s, dur: 0.06 })
    noise({ vol: 0.08 + 0.18 * s, cutoff: 4000 + 2500 * s, dur: 0.02, type: 'highpass' })
  } catch {
    /* silent */
  }
}

/** The dice leaving the cup. */
export function throwWhoosh(): void {
  if (muted) return
  try {
    noise({ vol: 0.25, cutoff: 900, dur: 0.22, type: 'bandpass' })
    noise({ t: 0.04, vol: 0.18, cutoff: 1600, dur: 0.16, type: 'bandpass' })
  } catch {
    /* silent */
  }
}

/**
 * Banked-combo celebrations, escalating with the tier. Tier 3 layers a
 * rising sweep, a doubled five-note fanfare, cymbal bursts, a floor boom
 * and a closing bell — the audio equivalent of the confetti storm.
 */
export function celebrate(tier: 1 | 2 | 3): void {
  if (muted) return
  try {
    if (tier === 1) {
      noise({ vol: 0.22, cutoff: 6000, dur: 0.05, type: 'highpass' })
      tone(659, { dur: 0.22, vol: 0.15 })
      tone(880, { t: 0.1, dur: 0.32, vol: 0.15 })
    } else if (tier === 2) {
      for (const [i, f] of [523, 659, 784, 1047].entries()) {
        tone(f, { t: i * 0.09, dur: 0.24, vol: 0.16 })
      }
      noise({ t: 0.3, vol: 0.2, cutoff: 7000, dur: 0.28, type: 'highpass' })
      tone(1319, { t: 0.42, dur: 0.4, vol: 0.12, type: 'sine' })
    } else {
      tone(220, { dur: 0.5, vol: 0.18, type: 'sawtooth', glide: 660 })
      tone(65, { t: 0.32, dur: 0.7, vol: 0.26, type: 'sine' })
      for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) {
        tone(f, { t: 0.35 + i * 0.11, dur: 0.38, vol: 0.18 })
        tone(f / 2, { t: 0.35 + i * 0.11, dur: 0.38, vol: 0.11, type: 'triangle' })
      }
      for (const i of [0, 1, 2]) {
        noise({ t: 0.45 + i * 0.28, vol: 0.22, cutoff: 6500, dur: 0.3, type: 'highpass' })
      }
      tone(2093, { t: 1.15, dur: 0.9, vol: 0.12, type: 'sine' })
      tone(1568, { t: 1.3, dur: 0.8, vol: 0.1, type: 'sine' })
      noise({ t: 1.25, vol: 0.16, cutoff: 900, dur: 0.45, type: 'bandpass' })
    }
  } catch {
    /* silent */
  }
}

/* ---------------- session events ---------------- */

export function play(sfx: SfxEvent | 'select' | 'error'): void {
  if (muted) return
  try {
    switch (sfx) {
      case 'select':
        noise({ vol: 0.12, cutoff: 5200, dur: 0.03, type: 'highpass' })
        tone(1800, { dur: 0.05, vol: 0.06, type: 'sine' })
        return
      case 'error':
        tone(180, { dur: 0.18, vol: 0.12, type: 'sawtooth', glide: -60 })
        return
      case 'score':
        // grease pencil on the scoresheet
        noise({ vol: 0.2, cutoff: 2600, dur: 0.09, type: 'bandpass' })
        tone(880, { t: 0.08, dur: 0.08, vol: 0.08, type: 'sine' })
        return
      case 'zero':
        // scratching out a box
        noise({ vol: 0.22, cutoff: 2200, dur: 0.14, type: 'bandpass' })
        tone(220, { t: 0.1, dur: 0.2, vol: 0.1, type: 'sawtooth', glide: -80 })
        return
      case 'bigscore':
        // spotlight sting: bright hit + rising bell pair
        noise({ vol: 0.3, cutoff: 6000, dur: 0.05, type: 'highpass' })
        tone(523, { dur: 0.3, vol: 0.16 })
        tone(784, { t: 0.09, dur: 0.35, vol: 0.16 })
        tone(1047, { t: 0.18, dur: 0.5, vol: 0.14, type: 'sine' })
        return
      case 'win':
        for (const [i, f] of [523, 659, 784, 1047].entries())
          tone(f, { t: i * 0.12, dur: 0.25, vol: 0.16 })
        return
      case 'lose':
        for (const [i, f] of [392, 330, 262].entries())
          tone(f, { t: i * 0.16, dur: 0.3, vol: 0.14, type: 'sawtooth' })
        return
    }
  } catch {
    /* audio context unavailable — stay silent */
  }
}
