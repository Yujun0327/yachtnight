<script lang="ts">
  import { untrack } from 'svelte'
  import { Raycaster, Vector2 } from 'three'
  import { topFaceOf } from '../dice/facemap'
  import { RollDirector } from '../dice/roll-director'
  import type { RollPhase } from '../dice/roll-director'
  import { createStage } from '../dice/scene'
  import type { Stage } from '../dice/scene'
  import { attachKeys } from '../input/keys'
  import { attachScrub } from '../input/scrub'
  import { ShakeSource, motionDenied, motionSupported, requestMotionPermission } from '../input/shake'
  import type { RollInputSink } from '../input/types'
  import { dieImpact, rattleTick, throwWhoosh, unlock } from './audio'
  import { motionOk } from './motion'

  interface Props {
    faces: number[]
    held: boolean[]
    /** May the local player start a roll right now? */
    canRoll: boolean
    /** May the local player toggle holds right now? */
    canHold: boolean
    /** Commit a roll; returns the authoritative faces, or null if refused. */
    onRoll: (held: boolean[]) => number[] | null
    onRevealed?: (faces: number[]) => void
    onToggleHold?: (die: number) => void
    onPhase?: (phase: RollPhase) => void
  }

  let { faces, held, canRoll, canHold, onRoll, onRevealed, onToggleHold, onPhase }: Props =
    $props()

  let canvasEl: HTMLCanvasElement
  let cupEl: HTMLButtonElement | undefined = $state()
  let hostEl: HTMLDivElement
  let phase = $state<RollPhase>('idle')

  let stage: Stage | null = null
  let director: RollDirector | null = null
  const shake = new ShakeSource()
  let shakeActive = false
  let scrubIntensity = 0
  let scrubPointerX = 0.5
  let lastVibe = 0

  // the input seam: scrub/keys write here; the rAF loop merges in phone shake
  const sink: RollInputSink = {
    begin() {
      if (!canRoll || !director) return
      unlock()
      if (motionSupported() && !motionDenied()) {
        void requestMotionPermission().then((res) => {
          if (res === 'granted') {
            shake.start()
            shakeActive = true
          }
        })
      }
      director.pickup([...held])
    },
    update(intensity, pointerX) {
      scrubIntensity = intensity
      scrubPointerX = pointerX
    },
    commit(dir, speed) {
      if (!director || director.phase !== 'shaking') return
      stopShake()
      const result = onRoll([...held])
      if (!result) {
        director.cancelShake()
        return
      }
      throwWhoosh()
      vibrate(30)
      director.throwDice(result, dir, speed)
      if (!motionOk()) director.skip()
    },
    cancel() {
      stopShake()
      director?.cancelShake()
    },
  }

  function stopShake(): void {
    if (shakeActive) {
      shake.stop()
      shakeActive = false
    }
    scrubIntensity = 0
  }

  function vibrate(ms: number): void {
    const now = performance.now()
    if (now - lastVibe < 40) return
    lastVibe = now
    try {
      navigator.vibrate?.(ms)
    } catch {
      /* iOS: no vibration — audio carries */
    }
  }

  /** Ground truth for tests: which face is visually up on each rendered die. */
  export function visualFaces(): number[] {
    return stage ? stage.dice.map((d) => topFaceOf(d.quaternion)) : []
  }

  /** Play a remote/observed roll so spectators watch the same throw. */
  export function playObserved(f: number[], h: boolean[], seed: number): void {
    director?.playObserved(f, h, seed)
    if (!motionOk()) director?.skip()
  }

  export function showFaces(f: number[], h: boolean[]): void {
    director?.showFaces(f, h)
  }

  function pickDie(e: MouseEvent): void {
    if (!stage || !canHold || phase !== 'idle') return
    if (faces.every((f) => f === 0)) return
    const rect = canvasEl.getBoundingClientRect()
    const p = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new Raycaster()
    ray.setFromCamera(p, stage.camera)
    const hit = ray.intersectObjects(stage.dice, false)[0]
    if (!hit) return
    const idx = stage.dice.indexOf(hit.object as (typeof stage.dice)[number])
    if (idx >= 0) {
      unlock()
      onToggleHold?.(idx)
    }
  }

  // held-state changes animate dice into/out of the slots
  let prevHeld = [...held]
  $effect(() => {
    const cur = [...held]
    cur.forEach((h, i) => {
      if (h !== prevHeld[i]) director?.setHeld(i, h)
    })
    prevHeld = cur
  })

  // Mount-once: this effect must have NO reactive dependencies, or a mid-roll
  // prop change would tear down the stage and director in mid-flight (that
  // exact bug froze the game after the first real-time roll). Prop reads are
  // untracked; the scrub adapter lives in its own effect because `cupEl`
  // comes and goes with `canRoll`.
  $effect(() => {
    stage = createStage(canvasEl)
    director = new RollDirector(stage, {
      onPhase: (p) => {
        phase = p
        onPhase?.(p)
      },
      onImpact: (s) => {
        dieImpact(s)
        vibrate(Math.round(10 + s * 25))
      },
      onRattle: (i) => {
        rattleTick(i)
        vibrate(Math.round(5 + i * 10))
      },
      onRevealed: (f) => onRevealed?.(f),
    })
    untrack(() => director!.showFaces([...faces], [...held]))

    const ro = new ResizeObserver(() => {
      const r = hostEl.getBoundingClientRect()
      stage?.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)))
    })
    ro.observe(hostEl)

    const detachKeys = attachKeys(sink)

    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (director) {
        director.intensity = Math.max(scrubIntensity, shakeActive ? shake.intensity : 0)
        director.pointerX = scrubPointerX
        director.frame(dt)
      }
      stage?.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      detachKeys()
      stopShake()
      director?.dispose()
      stage?.dispose()
      stage = null
      director = null
    }
  })

  // the cup grip element only exists while the player may roll
  $effect(() => {
    const el = cupEl
    if (!el) return
    return attachScrub(el, sink)
  })

  const shaking = $derived(phase === 'shaking')
</script>

<div class="stage" bind:this={hostEl}>
  <canvas bind:this={canvasEl} onclick={pickDie}></canvas>

  {#if canRoll}
    <button
      bind:this={cupEl}
      class="cup-grip"
      class:shaking
      aria-label="dice cup — hold and shake, release to throw. Keyboard: hold Space, mash arrow keys, release Space."
      onclick={(e) => e.preventDefault()}
    >
      {#if phase === 'idle'}
        <span class="cup-hint label">hold & shake</span>
      {/if}
    </button>
  {/if}

  {#if phase === 'rolling'}
    <button class="skip label" onclick={() => director?.skip()}>skip</button>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 260px;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }

  .cup-grip {
    position: absolute;
    left: 50%;
    bottom: 4%;
    translate: -50% 0;
    width: 128px;
    height: 128px;
    border-radius: 50%;
    border: none;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--brass) 22%, transparent) 0%,
      transparent 70%
    );
    color: var(--cream);
    cursor: grab;
    touch-action: none;
    display: grid;
    place-items: center;
  }

  .cup-grip:active,
  .cup-grip.shaking {
    cursor: grabbing;
  }

  .cup-hint {
    pointer-events: none;
    animation: breathe 2.4s ease-in-out infinite;
  }

  @keyframes breathe {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  .skip {
    position: absolute;
    right: var(--sp-3);
    bottom: var(--sp-3);
    background: rgb(0 0 0 / 0.35);
    border: none;
    border-radius: var(--r-chip);
    color: color-mix(in srgb, var(--cream) 75%, transparent);
    padding: 8px 14px;
  }
</style>
