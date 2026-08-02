<script lang="ts">
  import { motionOk } from './motion'

  interface Props {
    tier: 1 | 2 | 3
    title: string
    onDone: () => void
  }

  let { tier, title, onDone }: Props = $props()

  const animated = motionOk()
  const duration = !animated ? 1300 : tier === 3 ? 4200 : tier === 2 ? 2700 : 1900

  $effect(() => {
    const id = setTimeout(onDone, duration)
    return () => clearTimeout(id)
  })

  const COLORS = ['#c9a227', '#eed688', '#f4ecd9', '#a8352f', '#145741']
  const confettiCount = tier === 3 ? 150 : tier === 2 ? 80 : 34
  const confetti = Array.from({ length: confettiCount }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * (tier === 3 ? 1.4 : 0.6),
    dur: 2.1 + Math.random() * 1.9,
    color: COLORS[i % COLORS.length],
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 12,
    spin: (Math.random() < 0.5 ? -1 : 1) * (420 + Math.random() * 480),
    sway: (Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 70),
  }))

  // tier 3 extras: coin rain, firework rings, corner-popper streaks
  const coins =
    tier === 3
      ? Array.from({ length: 26 }, () => ({
          left: Math.random() * 100,
          delay: Math.random() * 1.6,
          dur: 1.7 + Math.random() * 1.5,
          size: 13 + Math.random() * 11,
        }))
      : []
  const fireworks =
    tier === 3
      ? Array.from({ length: 7 }, (_, i) => ({
          left: 12 + Math.random() * 76,
          top: 10 + Math.random() * 45,
          delay: 0.25 + i * 0.35,
          size: 110 + Math.random() * 130,
          color: COLORS[i % 3],
        }))
      : []
  const poppers =
    tier >= 2
      ? Array.from({ length: tier === 3 ? 26 : 14 }, (_, i) => ({
          side: i % 2,
          angle: 18 + Math.random() * 50,
          dist: 30 + Math.random() * 45,
          delay: Math.random() * 0.5,
          color: COLORS[i % COLORS.length],
          size: 7 + Math.random() * 7,
        }))
      : []
</script>

<div class="celebration" class:wild={tier === 3} aria-live="assertive">
  {#if animated}
    {#if tier === 3}
      <div class="flash"></div>
      <div class="rays"></div>
    {/if}

    {#each confetti as c, i (i)}
      <span
        class="confetti"
        style="left:{c.left}%; width:{c.w}px; height:{c.h}px; background:{c.color};
               animation-delay:{c.delay}s; animation-duration:{c.dur}s;
               --spin:{c.spin}deg; --sway:{c.sway}px;"
      ></span>
    {/each}

    {#each coins as c, i (i)}
      <span
        class="coin"
        style="left:{c.left}%; width:{c.size}px; height:{c.size}px;
               animation-delay:{c.delay}s; animation-duration:{c.dur}s;"
      ></span>
    {/each}

    {#each fireworks as f, i (i)}
      <span
        class="firework"
        style="left:{f.left}%; top:{f.top}%; width:{f.size}px; height:{f.size}px;
               border-color:{f.color}; animation-delay:{f.delay}s;"
      ></span>
    {/each}

    {#each poppers as p, i (i)}
      <span
        class="popper"
        class:right={p.side === 1}
        style="--angle:{p.side === 1 ? 180 - p.angle : p.angle}deg; --dist:{p.dist}vmin;
               background:{p.color}; width:{p.size}px; height:{p.size}px;
               animation-delay:{p.delay}s;"
      ></span>
    {/each}
  {/if}

  <div class="banner tier{tier}">
    <p class="label kicker">{tier === 3 ? 'the house goes wild' : 'banked!'}</p>
    <h2 class="foil-text">{title}</h2>
  </div>
</div>

<style>
  .celebration {
    position: fixed;
    inset: 0;
    z-index: 22;
    overflow: hidden;
    pointer-events: none;
    display: grid;
    place-items: center;
  }

  /* ---------------- the title ---------------- */

  .banner {
    text-align: center;
    animation: banner-pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }

  .kicker {
    color: var(--brass-hi);
    margin: 0 0 var(--sp-1);
  }

  .banner h2 {
    font-size: clamp(2.2rem, 8vw, 4.6rem);
    letter-spacing: 0.08em;
    line-height: 1;
    filter: drop-shadow(0 4px 18px rgb(0 0 0 / 0.65));
  }

  .tier3 h2 {
    font-size: clamp(2.8rem, 11vw, 6.2rem);
    animation: title-throb 0.55s ease-in-out 0.4s 4 alternate;
  }

  .wild .banner {
    animation:
      banner-pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both,
      quake 0.45s linear 0.5s 2;
  }

  @keyframes banner-pop {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes title-throb {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.07);
    }
  }

  @keyframes quake {
    0%, 100% { translate: 0 0; }
    20% { translate: -7px 3px; }
    40% { translate: 6px -4px; }
    60% { translate: -5px -3px; }
    80% { translate: 4px 4px; }
  }

  /* ---------------- confetti ---------------- */

  .confetti {
    position: absolute;
    top: -6vh;
    border-radius: 1px;
    animation-name: fall;
    animation-timing-function: linear;
    animation-fill-mode: both;
  }

  @keyframes fall {
    0% {
      transform: translate3d(0, 0, 0) rotate(0deg);
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      transform: translate3d(var(--sway), 112vh, 0) rotate(var(--spin));
      opacity: 0.5;
    }
  }

  /* ---------------- coin rain (tier 3) ---------------- */

  .coin {
    position: absolute;
    top: -5vh;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 30%, var(--brass-hi), var(--brass) 55%, var(--brass-lo));
    box-shadow: inset 0 0 0 1.5px var(--brass-lo);
    animation-name: coin-fall;
    animation-timing-function: cubic-bezier(0.35, 0, 0.8, 1);
    animation-fill-mode: both;
  }

  @keyframes coin-fall {
    0% {
      transform: translateY(0) scaleX(1);
      opacity: 1;
    }
    25% { transform: translateY(28vh) scaleX(0.2); }
    50% { transform: translateY(56vh) scaleX(1); }
    75% { transform: translateY(84vh) scaleX(0.25); }
    100% {
      transform: translateY(112vh) scaleX(1);
      opacity: 0.6;
    }
  }

  /* ---------------- firework rings (tier 3) ---------------- */

  .firework {
    position: absolute;
    border: 3px dotted;
    border-radius: 50%;
    translate: -50% -50%;
    animation: burst 0.9s ease-out both;
  }

  @keyframes burst {
    0% {
      transform: scale(0.05);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }

  /* ---------------- corner poppers (tier 2+) ---------------- */

  .popper {
    position: absolute;
    bottom: 4vh;
    left: 3vw;
    border-radius: 2px;
    animation: pop-shoot 1.1s ease-out both;
  }

  .popper.right {
    left: auto;
    right: 3vw;
  }

  @keyframes pop-shoot {
    0% {
      transform: translate(0, 0) rotate(0);
      opacity: 1;
    }
    100% {
      transform: translate(calc(cos(var(--angle)) * var(--dist)), calc(sin(var(--angle)) * var(--dist) * -1.6)) rotate(540deg);
      opacity: 0;
    }
  }

  /* ---------------- tier 3 washes ---------------- */

  .flash {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 70% 55% at 50% 45%,
      color-mix(in srgb, var(--brass-hi) 55%, transparent) 0%,
      transparent 72%
    );
    animation: flash-fade 1.4s ease-out both;
  }

  @keyframes flash-fade {
    0% { opacity: 0; }
    10% { opacity: 1; }
    100% { opacity: 0; }
  }

  .rays {
    position: absolute;
    width: 160vmax;
    height: 160vmax;
    background: repeating-conic-gradient(
      color-mix(in srgb, var(--brass-hi) 14%, transparent) 0deg 9deg,
      transparent 9deg 24deg
    );
    border-radius: 50%;
    animation: rays-spin 5s linear infinite, rays-fade 4.2s ease-out both;
  }

  @keyframes rays-spin {
    to { rotate: 60deg; }
  }

  @keyframes rays-fade {
    0% { opacity: 0; }
    12% { opacity: 1; }
    75% { opacity: 0.7; }
    100% { opacity: 0; }
  }
</style>
