<script lang="ts">
  import type { RulesetId } from '../engine'
  import { bestScore } from '../app/persist'
  import RulesLeaflet from './RulesLeaflet.svelte'

  interface Props {
    onHotseat: (playerCount: 1 | 2 | 3 | 4, names: string[], ruleset: RulesetId) => void
    onCreateRoom?: () => void
    onJoinRoom?: (code: string) => void
  }

  let { onHotseat, onCreateRoom, onJoinRoom }: Props = $props()

  let ruleset = $state<RulesetId>('yacht')
  let playerCount = $state<1 | 2 | 3 | 4>(1)
  let names = $state(['', '', '', ''])
  let joinCode = $state('')
  let rulesOpen = $state(false)

  const online = $derived(onCreateRoom !== undefined && onJoinRoom !== undefined)
  const best = $derived(bestScore(ruleset))
</script>

<main class="home">
  <header class="marquee">
    <span class="rule" aria-hidden="true"></span>
    <h1 class="foil-text">Yacht Night</h1>
    <span class="rule" aria-hidden="true"></span>
    <p class="label">Shake · Throw · Score</p>
    <button class="btn btn--quiet" onclick={() => (rulesOpen = true)}>How to play</button>
  </header>

  <div class="rulesets" role="group" aria-label="ruleset">
    <button
      class="btn ruleset"
      class:btn--gold={ruleset === 'yacht'}
      onclick={() => (ruleset = 'yacht')}
    >
      Classic Yacht
    </button>
    <button
      class="btn ruleset"
      class:btn--gold={ruleset === 'yahtzee'}
      onclick={() => (ruleset = 'yahtzee')}
    >
      Yahtzee-style
    </button>
  </div>

  <div class="panels">
    <section class="card">
      <h2>At one table</h2>
      <p class="hint">
        Play alone against your best score, or pass one device around.
        {#if best !== null}
          <span class="tabular">Best solo: {best}</span>
        {/if}
      </p>

      <div class="stepper" role="group" aria-label="player count">
        {#each [1, 2, 3, 4] as const as n (n)}
          <button
            class="btn seat"
            class:btn--gold={playerCount === n}
            onclick={() => (playerCount = n)}
          >
            {n}
          </button>
        {/each}
        <span class="label">{playerCount === 1 ? 'player' : 'players'}</span>
      </div>

      <div class="names">
        {#each { length: playerCount } as _, i (i)}
          <input
            type="text"
            placeholder="Player {i + 1}"
            maxlength="14"
            bind:value={names[i]}
            aria-label="name of player {i + 1}"
          />
        {/each}
      </div>

      <button
        class="btn btn--gold start"
        onclick={() => onHotseat(playerCount, names.slice(0, playerCount), ruleset)}
      >
        Begin
      </button>
    </section>

    <section class="card">
      <h2>Across the world</h2>
      <p class="hint">
        {#if online}
          Share a room code — no accounts, no servers.
        {:else}
          Online play is being prepared.
        {/if}
      </p>

      <button class="btn btn--gold" disabled={!online} onclick={() => onCreateRoom?.()}>
        Open a room
      </button>

      <div class="join">
        <input
          type="text"
          placeholder="Room code"
          maxlength="6"
          bind:value={joinCode}
          disabled={!online}
          aria-label="room code"
          onkeydown={(e) => e.key === 'Enter' && joinCode.trim() && onJoinRoom?.(joinCode.trim())}
        />
        <button
          class="btn"
          disabled={!online || joinCode.trim().length < 4}
          onclick={() => onJoinRoom?.(joinCode.trim())}
        >
          Join
        </button>
      </div>
    </section>
  </div>

  <a class="lab-link label" href="#lab">Practice table</a>
  <p class="stamp label">{__BUILD_STAMP__}</p>

  {#if rulesOpen}
    <RulesLeaflet {ruleset} onClose={() => (rulesOpen = false)} />
  {/if}
</main>

<style>
  .home {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
    padding: var(--sp-6) var(--sp-4);
  }

  .marquee {
    display: grid;
    justify-items: center;
    gap: var(--sp-2);
  }

  .marquee h1 {
    font-size: clamp(2.6rem, 9vw, 4.4rem);
    letter-spacing: 0.06em;
    line-height: 1;
    text-align: center;
  }

  .rule {
    width: min(70vw, 340px);
    height: 8px;
    background:
      linear-gradient(to right, transparent, var(--brass) 20%, var(--brass) 80%, transparent)
      center / 100% 1.5px no-repeat;
    position: relative;
  }

  .rule::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: 9px;
    height: 15px;
    background: var(--brass);
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }

  .rulesets {
    display: flex;
    gap: var(--sp-2);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 340px));
    gap: var(--sp-5);
    justify-content: center;
    width: 100%;
  }

  .card {
    background: color-mix(in srgb, var(--felt) 72%, var(--night));
    border-radius: var(--r-card);
    box-shadow: var(--hairline-dim), var(--shadow);
    padding: var(--sp-5);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  h2 {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: var(--fs-md);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hint {
    margin: 0;
    font-size: var(--fs-sm);
    color: color-mix(in srgb, var(--cream) 70%, transparent);
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .seat {
    min-width: 44px;
    padding: 10px 0;
  }

  .names {
    display: grid;
    gap: var(--sp-2);
  }

  input {
    font: inherit;
    color: var(--cream);
    background: color-mix(in srgb, var(--night) 60%, transparent);
    border: none;
    border-radius: var(--r-chip);
    box-shadow: var(--hairline-dim);
    padding: 11px 14px;
    min-height: 44px;
  }

  input::placeholder {
    color: color-mix(in srgb, var(--cream) 40%, transparent);
  }

  input:focus-visible {
    outline: 2px solid var(--brass);
    outline-offset: 2px;
  }

  .join {
    display: flex;
    gap: var(--sp-2);
  }

  .join input {
    flex: 1;
    min-width: 0;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .lab-link {
    color: color-mix(in srgb, var(--cream) 55%, transparent);
    text-decoration: none;
  }

  .lab-link:hover {
    color: var(--brass-hi);
  }

  .stamp {
    margin: 0;
    opacity: 0.35;
    font-size: 0.7rem;
  }
</style>
