<script lang="ts">
  import type { Snippet } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { dur, settle } from './motion'

  interface Props {
    onClose?: () => void
    children: Snippet
  }

  let { onClose, children }: Props = $props()

  function backdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose?.()
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose?.()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="backdrop"
  onclick={backdrop}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  transition:fade={{ duration: dur(160) }}
>
  <div class="sheet" transition:fly={{ y: 26, duration: dur(260), easing: settle }}>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(8 6 4 / 0.72);
    display: grid;
    place-items: center;
    z-index: 40;
    padding: var(--sp-4);
  }

  .sheet {
    background: var(--felt);
    border-radius: var(--r-card);
    box-shadow: var(--hairline), 0 12px 40px rgb(0 0 0 / 0.6);
    padding: var(--sp-5);
    max-width: min(92vw, 460px);
    max-height: 88dvh;
    overflow-y: auto;
  }

  @media (max-width: 640px) {
    .backdrop {
      place-items: end center;
      padding: 0;
    }

    .sheet {
      width: 100%;
      max-width: none;
      border-radius: var(--r-card) var(--r-card) 0 0;
      padding-bottom: max(var(--sp-5), env(safe-area-inset-bottom));
    }
  }
</style>
