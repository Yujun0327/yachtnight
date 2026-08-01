<script lang="ts">
  import { recordScore } from '../app/persist'
  import type { BaseSession, OnlineSession } from '../app/session.svelte'
  import type { CategoryId } from '../engine'
  import { MAX_ROLLS } from '../engine'
  import type DiceStage from './DiceStage.svelte'
  import HandoffCurtain from './HandoffCurtain.svelte'
  import RulesLeaflet from './RulesLeaflet.svelte'
  import Scoresheet from './Scoresheet.svelte'
  import VictoryOverlay from './VictoryOverlay.svelte'
  import { isMuted, play, setMuted } from './audio'

  interface Props {
    session: BaseSession
    onExit: () => void
    onRematch: () => void
  }

  let { session, onExit, onRematch }: Props = $props()

  // three.js + cannon-es live in their own chunk; Home/Lobby stay light
  const diceStageModule = import('./DiceStage.svelte')

  const gs = $derived(session.state)
  const online = $derived(session.mode === 'online' ? (session as OnlineSession) : null)
  const soloGame = $derived(session.cfg.playerCount === 1)

  let stageRef = $state<DiceStage | undefined>()
  let heldDraft = $state([false, false, false, false, false])
  let rolling = $state(false)
  let rulesOpen = $state(false)
  let muted = $state(isMuted())
  let curtain = $state(false)
  let newBest = $state(false)

  /* session sfx events */
  let lastEventId = -1
  let flash = $state(false)
  $effect(() => {
    const last = session.events[session.events.length - 1]
    if (last && last.id > lastEventId) {
      lastEventId = last.id
      play(last.sfx)
      if (last.sfx === 'bigscore') {
        flash = true
        setTimeout(() => (flash = false), 900)
      }
    }
  })

  /* watch turns: reset the held draft, drop the curtain on hotseat handoffs */
  let prevActor = session.actor
  let prevRolls = gs.rollsUsed
  $effect(() => {
    const actor = gs.seatToAct
    const rolls = gs.rollsUsed
    if (actor !== prevActor) {
      heldDraft = [false, false, false, false, false]
      if (session.mode === 'hotseat' && session.cfg.playerCount > 1 && !gs.result) {
        curtain = true
      }
      stageRef?.showFaces([0, 0, 0, 0, 0], [false, false, false, false, false])
    }
    // a roll arrived that we did not throw ourselves: watch it happen
    if (rolls > prevRolls && online && !session.myTurn) {
      const seed = (gs.rngState ^ 0x9e3779b9) >>> 0
      rolling = true
      stageRef?.playObserved([...gs.dice], [...gs.held], seed)
    }
    prevActor = actor
    prevRolls = rolls
  })

  /* solo best-score bookkeeping */
  $effect(() => {
    if (gs.result && soloGame) {
      newBest = recordScore(gs.ruleset, gs.result.totals[0])
    }
  })

  const canAct = $derived(session.myTurn && !gs.result && !rolling && !curtain)
  const canRoll = $derived(
    canAct && gs.rollsUsed < MAX_ROLLS && !heldDraft.every(Boolean),
  )
  const canHold = $derived(canAct && gs.rollsUsed > 0)
  const canScore = $derived(canAct && gs.rollsUsed > 0)

  function onRoll(held: boolean[]): number[] | null {
    try {
      session.submit({ type: 'roll', held })
    } catch {
      return null
    }
    rolling = true
    return [...session.state.dice]
  }

  function toggleHold(i: number): void {
    if (!canHold) return
    heldDraft[i] = !heldDraft[i]
    play('select')
  }

  function onScore(category: CategoryId): void {
    if (!canScore) return
    try {
      session.submit({ type: 'score', category })
    } catch {
      play('error')
      return
    }
    heldDraft = [false, false, false, false, false]
  }

  function toggleMute(): void {
    muted = !muted
    setMuted(muted)
  }

  const turnLine = $derived.by(() => {
    if (gs.result) return 'The night is settled.'
    const name = session.names[gs.seatToAct]
    const who = session.myTurn && online ? 'Your turn' : name
    if (rolling) return `${who} — the dice are out…`
    if (gs.rollsUsed === 0) return `${who} — shake the cup`
    if (gs.rollsUsed >= MAX_ROLLS) return `${who} — choose a box`
    return `${who} — roll ${gs.rollsUsed} of ${MAX_ROLLS}, keep or throw again`
  })
</script>

<main class="game">
  <header class="topbar">
    <button class="btn btn--quiet small" onclick={onExit}>Leave</button>
    <p class="turn-line" aria-live="polite">{turnLine}</p>
    <div class="tools">
      <button class="btn btn--quiet small" onclick={toggleMute} aria-label="toggle sound">
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      <button class="btn btn--quiet small" onclick={() => (rulesOpen = true)}>Rules</button>
    </div>
  </header>

  {#if online?.waitingOn}
    <p class="waiting label">Waiting on {online.waitingOn} to reconnect…</p>
  {/if}

  <div class="table-area">
    <div class="stage-wrap">
      {#await diceStageModule then { default: Stage }}
        <Stage
          bind:this={stageRef}
          faces={gs.dice}
          held={heldDraft}
          {canRoll}
          {canHold}
          {onRoll}
          onToggleHold={toggleHold}
          onRevealed={() => (rolling = false)}
        />
      {/await}
    </div>

    <div class="sheet-wrap">
      <Scoresheet
        state={gs}
        names={session.names}
        mySeat={session.mySeat}
        canScore={canScore}
        {onScore}
      />
    </div>
  </div>

  {#if curtain}
    <HandoffCurtain name={session.names[gs.seatToAct]} onReady={() => (curtain = false)} />
  {/if}

  {#if gs.result && !rolling}
    <VictoryOverlay
      result={gs.result}
      names={session.names}
      won={session.mySeat === null || gs.result.winners.includes(session.mySeat)}
      solo={soloGame}
      {newBest}
      onRematch={() => {
        newBest = false
        onRematch()
      }}
      {onExit}
    />
  {/if}

  {#if rulesOpen}
    <RulesLeaflet ruleset={gs.ruleset} onClose={() => (rulesOpen = false)} />
  {/if}

  {#if flash}
    <div class="flash" aria-hidden="true"></div>
  {/if}
</main>

<style>
  .game {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    padding-top: max(var(--sp-2), env(safe-area-inset-top));
  }

  .turn-line {
    flex: 1;
    margin: 0;
    text-align: center;
    font-size: var(--fs-sm);
    letter-spacing: 0.03em;
    color: color-mix(in srgb, var(--cream) 85%, transparent);
  }

  .tools {
    display: flex;
    gap: var(--sp-1);
  }

  .small {
    padding: 6px 12px;
    min-height: 36px;
    font-size: var(--fs-xs);
  }

  .waiting {
    text-align: center;
    margin: 0;
    color: var(--brass-hi);
  }

  .table-area {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr minmax(280px, 380px);
    gap: var(--sp-3);
    padding: 0 var(--sp-3) max(var(--sp-3), env(safe-area-inset-bottom));
  }

  .stage-wrap {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .sheet-wrap {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  /* the five-of-a-kind spotlight snap */
  .flash {
    position: fixed;
    inset: 0;
    z-index: 20;
    pointer-events: none;
    background: radial-gradient(
      ellipse 70% 55% at 50% 45%,
      color-mix(in srgb, var(--brass-hi) 45%, transparent) 0%,
      transparent 70%
    );
    animation: flash-pop 0.9s ease-out forwards;
  }

  @keyframes flash-pop {
    0% {
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @media (max-width: 800px) {
    .table-area {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 6fr) minmax(0, 5fr);
    }
  }
</style>
