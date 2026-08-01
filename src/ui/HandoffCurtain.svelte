<script lang="ts">
  interface Props {
    name: string
    onReady: () => void
  }

  let { name, onReady }: Props = $props()
</script>

<div class="curtain">
  <div class="card">
    <p class="label">next to roll</p>
    <h2 class="foil-text">{name}</h2>
    <p class="hint">Take the cup — the table is yours.</p>
    <button class="btn btn--gold" onclick={onReady}>I have the dice</button>
  </div>
</div>

<style>
  .curtain {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--night) 88%, transparent);
    backdrop-filter: blur(6px);
  }

  .card {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    background: color-mix(in srgb, var(--felt) 72%, var(--night));
    border-radius: var(--r-card);
    box-shadow: var(--hairline-dim), var(--shadow);
    padding: var(--sp-7) var(--sp-6);
    max-width: 90vw;
  }

  h2 {
    font-size: var(--fs-2xl);
    letter-spacing: 0.05em;
  }

  .hint {
    margin: 0;
    color: color-mix(in srgb, var(--cream) 65%, transparent);
  }
</style>
