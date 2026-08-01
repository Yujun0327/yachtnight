<script lang="ts">
  import type { CategoryId, GameState } from '../engine'
  import {
    UPPER,
    legalCategories,
    ruleset,
    scoreValue,
    totalScore,
    upperBonusEarned,
    upperTotal,
  } from '../engine'

  interface Props {
    state: GameState
    names: string[]
    /** Seat whose column is "mine" (highlight); null in hotseat. */
    mySeat: number | null
    /** May the local player write a score right now? */
    canScore: boolean
    onScore: (category: CategoryId) => void
  }

  let { state, names, mySeat, canScore, onScore }: Props = $props()

  const rs = $derived(ruleset(state.ruleset))
  const rolled = $derived(state.rollsUsed > 0 && state.dice[0] !== 0)
  const legal = $derived(
    canScore && rolled ? legalCategories(rs, state.dice, state.cards[state.seatToAct]) : [],
  )

  const LABELS: Record<CategoryId, string> = $derived({
    ones: 'Ones',
    twos: 'Twos',
    threes: 'Threes',
    fours: 'Fours',
    fives: 'Fives',
    sixes: 'Sixes',
    threeKind: 'Three of a Kind',
    fourKind: 'Four of a Kind',
    fullHouse: 'Full House',
    smallStraight: state.ruleset === 'yacht' ? 'Little Straight' : 'Small Straight',
    largeStraight: state.ruleset === 'yacht' ? 'Big Straight' : 'Large Straight',
    choice: state.ruleset === 'yacht' ? 'Choice' : 'Chance',
    fiveKind: state.ruleset === 'yacht' ? 'Yacht' : 'Five of a Kind',
  })

  function preview(cat: CategoryId): number {
    return scoreValue(rs, cat, state.dice, state.cards[state.seatToAct])
  }
</script>

<div class="sheet panel" data-testid="scoresheet">
  <table>
    <thead>
      <tr>
        <th class="cat-col"></th>
        {#each names as name, seat (seat)}
          <th class:me={seat === mySeat} class:acting={seat === state.seatToAct}>
            <span class="player-name">{name}</span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rs.categories as cat (cat)}
        {@const isUpperEnd = cat === 'sixes' && rs.upperBonus}
        <tr class:section-end={isUpperEnd}>
          <td class="cat">{LABELS[cat]}</td>
          {#each names as _, seat (seat)}
            {@const mark = state.cards[seat].marks[cat]}
            {@const actorCell = seat === state.seatToAct}
            <td class:acting={actorCell}>
              {#if mark !== undefined}
                <span class="mark tabular" class:zero={mark === 0}>{mark === 0 ? '—' : mark}</span>
              {:else if actorCell && legal.includes(cat)}
                <button class="pick tabular" onclick={() => onScore(cat)}>
                  {preview(cat)}
                </button>
              {:else if actorCell && rolled && canScore}
                <span class="blocked" title="Joker rules force another box">·</span>
              {/if}
            </td>
          {/each}
        </tr>
        {#if isUpperEnd}
          <tr class="bonus-row">
            <td class="cat">Upper bonus <span class="bonus-note">63+ → 35</span></td>
            {#each names as _, seat (seat)}
              <td>
                <span class="running tabular">
                  {upperTotal(rs, state.cards[seat])}{upperBonusEarned(rs, state.cards[seat])
                    ? ' +35'
                    : ''}
                </span>
              </td>
            {/each}
          </tr>
        {/if}
      {/each}
      {#if rs.fiveKindBonus}
        <tr class="bonus-row">
          <td class="cat">Extra {LABELS.fiveKind} <span class="bonus-note">+100</span></td>
          {#each names as _, seat (seat)}
            <td>
              <span class="running tabular">
                {state.cards[seat].fiveKindBonuses > 0
                  ? `×${state.cards[seat].fiveKindBonuses}`
                  : ''}
              </span>
            </td>
          {/each}
        </tr>
      {/if}
      <tr class="total-row">
        <td class="cat">Total</td>
        {#each names as _, seat (seat)}
          <td>
            <span class="total tabular">{totalScore(rs, state.cards[seat])}</span>
          </td>
        {/each}
      </tr>
    </tbody>
  </table>
</div>

<style>
  .sheet {
    padding: var(--sp-3);
    overflow: auto;
    font-family: var(--font-ui);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    text-align: center;
    padding: 3px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
    font-size: var(--fs-xs);
    white-space: nowrap;
  }

  th.me .player-name {
    text-decoration: underline;
    text-decoration-color: var(--brass);
    text-underline-offset: 3px;
  }

  th.acting .player-name,
  td.acting {
    background: color-mix(in srgb, var(--brass) 12%, transparent);
  }

  .player-name {
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .cat-col {
    min-width: 96px;
  }

  .cat {
    text-align: left;
    color: var(--ink-soft);
  }

  .mark {
    font-family: var(--font-numeral);
    font-weight: 700;
    font-size: var(--fs-sm);
    color: var(--ink);
  }

  .mark.zero {
    color: var(--danger);
  }

  .pick {
    font-family: var(--font-numeral);
    font-weight: 700;
    font-size: var(--fs-sm);
    color: color-mix(in srgb, var(--ink) 45%, transparent);
    background: color-mix(in srgb, var(--brass) 18%, transparent);
    border: 1px dashed color-mix(in srgb, var(--brass-lo) 60%, transparent);
    border-radius: var(--r-chip);
    padding: 1px 10px;
    min-height: 30px;
    min-width: 42px;
  }

  .pick:hover {
    background: color-mix(in srgb, var(--brass) 34%, transparent);
    color: var(--ink);
  }

  .blocked {
    color: color-mix(in srgb, var(--ink) 30%, transparent);
  }

  .section-end td {
    border-bottom: 2px solid color-mix(in srgb, var(--ink) 30%, transparent);
  }

  .bonus-row td {
    color: var(--ink-soft);
  }

  .bonus-note {
    font-size: 0.85em;
    opacity: 0.7;
  }

  .running {
    font-size: var(--fs-xs);
  }

  .total-row td {
    border-bottom: none;
    padding-top: 6px;
  }

  .total-row .cat {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .total {
    font-family: var(--font-numeral);
    font-weight: 700;
    font-size: var(--fs-md);
  }
</style>
