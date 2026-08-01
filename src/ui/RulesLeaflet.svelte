<script lang="ts">
  import type { RulesetId } from '../engine'
  import Modal from './Modal.svelte'

  interface Props {
    ruleset: RulesetId
    onClose: () => void
  }

  let { ruleset, onClose }: Props = $props()
</script>

<Modal {onClose}>
  <div class="leaflet">
    <h2>How to play</h2>
    <p>
      Each turn you get up to <strong>three rolls</strong> of five dice. After a roll, tap dice to
      keep them on the pad, then shake and throw the rest again. When you stop, write the result
      into one empty box on your sheet — even if it scores zero. The game ends when every box is
      filled.
    </p>

    {#if ruleset === 'yacht'}
      <h3>Classic Yacht — 12 boxes</h3>
      <ul>
        <li><strong>Ones–Sixes</strong> — sum of the matching dice.</li>
        <li><strong>Choice</strong> — sum of all five dice.</li>
        <li><strong>Four of a Kind</strong> — sum of the four matched dice.</li>
        <li><strong>Full House</strong> — three of one face and two of another: sum of all dice.</li>
        <li><strong>Little Straight</strong> — 1-2-3-4-5: 30 points.</li>
        <li><strong>Big Straight</strong> — 2-3-4-5-6: 30 points.</li>
        <li><strong>Yacht</strong> — five of a kind: 50 points.</li>
      </ul>
      <p>No bonuses — twelve turns, highest total wins.</p>
    {:else}
      <h3>Yahtzee-style — 13 boxes</h3>
      <ul>
        <li><strong>Ones–Sixes</strong> — sum of the matching dice. Reach 63 up here for a <strong>35-point bonus</strong>.</li>
        <li><strong>Three / Four of a Kind</strong> — sum of all five dice.</li>
        <li><strong>Full House</strong> — 25 points.</li>
        <li><strong>Small Straight</strong> — any run of four: 30 points.</li>
        <li><strong>Large Straight</strong> — any run of five: 40 points.</li>
        <li><strong>Five of a Kind</strong> — 50 points. Each one after the first is worth a <strong>100-point bonus</strong> and acts as a Joker.</li>
        <li><strong>Chance</strong> — sum of all five dice.</li>
      </ul>
    {/if}

    <h3>The roll</h3>
    <p>
      On a phone, hold the cup and <strong>shake your phone</strong> — really shake it — then flick
      toward the table to throw. At a computer, hold the cup with the mouse and scrub it back and
      forth, then let it fly. Space bar and arrow keys work too.
    </p>
  </div>
</Modal>

<style>
  .leaflet {
    display: grid;
    gap: var(--sp-3);
    max-width: 52ch;
  }

  h2 {
    font-size: var(--fs-lg);
    letter-spacing: 0.04em;
  }

  h3 {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: var(--fs-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  ul {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: var(--sp-1);
  }
</style>
