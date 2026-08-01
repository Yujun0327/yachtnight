<script lang="ts">
  import { fade, scale } from 'svelte/transition'
  import type { GameResult } from '../engine'
  import { dur, settle } from './motion'

  interface Props {
    result: GameResult
    names: string[]
    /** True if the local player is among the winners (always true in hotseat). */
    won: boolean
    solo: boolean
    newBest: boolean
    onRematch: () => void
    onExit: () => void
  }

  let { result, names, won, solo, newBest, onRematch, onExit }: Props = $props()

  const winnerNames = $derived(result.winners.map((s) => names[s]).join(' & '))
</script>

<div class="overlay" transition:fade={{ duration: dur(200) }}>
  <div class="card" transition:scale={{ start: 0.9, duration: dur(320), easing: settle }}>
    {#if solo}
      <p class="label">final score</p>
      <h2 class="foil-text tabular">{result.totals[0]}</h2>
      {#if newBest}
        <p class="best">A new house record!</p>
      {/if}
    {:else}
      <p class="label">{result.winners.length > 1 ? 'a split pot' : 'the night goes to'}</p>
      <h2 class="foil-text">{winnerNames}</h2>
      <ul class="totals">
        {#each result.totals as total, seat (seat)}
          <li class:winner={result.winners.includes(seat)}>
            <span>{names[seat]}</span>
            <span class="tabular">{total}</span>
          </li>
        {/each}
      </ul>
      <p class="mood">{won ? 'Rake it in.' : 'The dice are cruel.'}</p>
    {/if}

    <div class="actions">
      <button class="btn btn--gold" onclick={onRematch}>Another round</button>
      <button class="btn btn--quiet" onclick={onExit}>Leave the table</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--night) 80%, transparent);
    backdrop-filter: blur(4px);
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    text-align: center;
    background: color-mix(in srgb, var(--felt) 72%, var(--night));
    border-radius: var(--r-card);
    box-shadow: var(--hairline), 0 12px 40px rgb(0 0 0 / 0.6);
    padding: var(--sp-7) var(--sp-6);
    width: min(92vw, 420px);
  }

  h2 {
    font-size: var(--fs-2xl);
    letter-spacing: 0.04em;
  }

  .best {
    margin: 0;
    color: var(--brass-hi);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .totals {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .totals li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-chip);
    color: color-mix(in srgb, var(--cream) 75%, transparent);
  }

  .totals li.winner {
    background: color-mix(in srgb, var(--brass) 16%, transparent);
    color: var(--cream);
    font-weight: 600;
  }

  .mood {
    margin: 0;
    color: color-mix(in srgb, var(--cream) 60%, transparent);
    font-style: italic;
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
    justify-content: center;
  }
</style>
