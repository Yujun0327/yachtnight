<script lang="ts">
  import { rollDice } from '../engine'
  import Celebration from './Celebration.svelte'
  import type DiceStage from './DiceStage.svelte'
  import { celebrate } from './audio'
  import { comboOf } from './combo'
  import type { Combo } from './combo'

  const diceStageModule = import('./DiceStage.svelte')

  /**
   * The practice table (#lab). A full roll ritual with no scorecard:
   * shake, throw, hold dice, roll again. Forced faces ("6,6,6,6,6") exist
   * for tuning the drama and for the e2e harness, which reads the settled
   * faces back from the data attribute below.
   */
  let faces = $state([0, 0, 0, 0, 0])
  let held = $state([false, false, false, false, false])
  let forced = $state('')
  let rolls = $state(0)
  let rolling = $state(false)
  let rngState = Math.floor(Math.random() * 2 ** 31)
  let stageRef = $state<DiceStage | undefined>()

  // e2e ground truth: rendered top faces straight off the mesh quaternions
  $effect(() => {
    ;(window as unknown as Record<string, unknown>).__lab = {
      visualFaces: () => stageRef?.visualFaces() ?? [],
    }
  })

  /* banked-combo celebrations, same ladder as the real game (yacht rules) */
  let celebration = $state<Combo | null>(null)
  let celebratedKey = ''
  $effect(() => {
    if (!held.every(Boolean) || rolling) return
    const key = `${rolls}:${faces.join('')}`
    if (key === celebratedKey) return
    celebratedKey = key
    const combo = comboOf(faces, 'yacht')
    if (combo) {
      celebration = combo
      celebrate(combo.tier)
    }
  })

  function parseForced(): number[] | null {
    const parts = forced.split(/[,\s]+/).filter(Boolean).map(Number)
    if (parts.length !== 5 || parts.some((n) => !Number.isInteger(n) || n < 1 || n > 6))
      return null
    return parts
  }

  function onRoll(heldMask: boolean[]): number[] | null {
    const forcedFaces = parseForced()
    const next = [...faces]
    if (forcedFaces) {
      heldMask.forEach((h, i) => {
        if (!h) next[i] = forcedFaces[i]
      })
    } else {
      for (let i = 0; i < 5; i++) {
        if (!heldMask[i]) {
          const drawn = rollDice(rngState, 1)
          rngState = drawn.state
          next[i] = drawn.faces[0]
        }
      }
    }
    faces = next
    rolls++
    rolling = true
    return next
  }

  function toggleHold(i: number): void {
    if (faces[i] === 0) return
    held[i] = !held[i]
  }

  function reset(): void {
    faces = [0, 0, 0, 0, 0]
    held = [false, false, false, false, false]
    rolls = 0
    stageRef?.showFaces(faces, held)
  }

  function demoObserved(): void {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const next = faces.map((f, i) => (held[i] ? f : 1 + Math.floor(Math.random() * 6)))
    faces = next
    rolling = true
    stageRef?.playObserved(next, [...held], seed)
  }
</script>

<main class="lab" data-faces={faces.join(',')} data-held={held.join(',')} data-rolling={rolling}>
  <div class="table">
    {#await diceStageModule then { default: Stage }}
      <Stage
        bind:this={stageRef}
        {faces}
        {held}
        canRoll={!rolling}
        canHold={!rolling}
        {onRoll}
        onToggleHold={toggleHold}
        onRevealed={() => (rolling = false)}
      />
    {/await}
  </div>

  <aside class="bench">
    <h1 class="foil-text">Practice table</h1>
    <p class="label">rolls this visit: <span class="tabular">{rolls}</span></p>

    <label class="label" for="forced">forced faces (tuning)</label>
    <input
      id="forced"
      type="text"
      placeholder="e.g. 6,6,6,6,6"
      bind:value={forced}
      autocomplete="off"
    />

    <div class="row">
      <button class="btn btn--quiet" onclick={reset}>Reset</button>
      <button class="btn btn--quiet" onclick={demoObserved} disabled={rolling}>
        Observer roll
      </button>
    </div>

    <p class="hint">
      Hold the glowing spot and shake (phone: shake the phone!), then flick to throw. Tap settled
      dice to keep them on the pad. Space + arrow keys work too.
    </p>

    <button class="label back" onclick={() => (location.hash = '')}>← home</button>
    <p class="stamp label">{__BUILD_STAMP__}</p>
  </aside>

  {#if celebration}
    <Celebration
      tier={celebration.tier}
      title={celebration.title}
      onDone={() => (celebration = null)}
    />
  {/if}
</main>

<style>
  .lab {
    height: 100dvh;
    display: grid;
    grid-template-columns: 1fr minmax(220px, 300px);
  }

  .table {
    position: relative;
    min-width: 0;
  }

  .bench {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
    background: color-mix(in srgb, var(--night) 80%, var(--felt-lo));
    box-shadow: var(--hairline-dim);
    overflow-y: auto;
  }

  h1 {
    font-size: var(--fs-xl);
  }

  input {
    font: inherit;
    color: var(--cream);
    background: color-mix(in srgb, var(--night) 60%, transparent);
    border: none;
    border-radius: var(--r-chip);
    box-shadow: var(--hairline-dim);
    padding: 11px 14px;
  }

  .row {
    display: flex;
    gap: var(--sp-2);
  }

  .hint {
    color: color-mix(in srgb, var(--cream) 65%, transparent);
    font-size: var(--fs-xs);
  }

  .back {
    margin-top: auto;
    color: color-mix(in srgb, var(--cream) 55%, transparent);
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
  }

  .stamp {
    opacity: 0.4;
  }

  @media (max-width: 700px) {
    .lab {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .bench {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      padding: var(--sp-3);
    }

    .back {
      margin-top: 0;
    }

    h1 {
      font-size: var(--fs-md);
      width: 100%;
    }
  }
</style>
