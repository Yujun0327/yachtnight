# Yacht Night

A fan-made dice game for the browser: **Classic Yacht** and **Yahtzee-style** rules,
built around the ritual of the roll — shake the cup (on a phone: shake the phone),
flick to throw, watch real physics tumble the dice under the spotlight.

- **Solo score attack**, **pass-and-play** (up to 4 at one table), or **online P2P**
  (room codes over WebRTC — no accounts, no servers).
- Svelte 5 + three.js + cannon-es. Zero image binaries, zero WASM: every texture is
  canvas-generated, every sound synthesized in WebAudio.

## The determinism contract

Die faces are drawn from a seeded RNG stream inside the pure engine reducer
(`src/engine/apply.ts`) — never from physics, never from the wire. The 3D roll is
presentational: a headless simulation is recorded, then each die's orientation is
remapped by a cube-symmetry quaternion so the engine's faces land up (`src/dice/facemap.ts`).
No frame ever snaps. Peers verify every move with a full-state hash and resync on mismatch.

## Develop

```bash
npm install
npm run dev          # local dev
npm run dev:phone    # HTTPS on the LAN — required for DeviceMotion on real phones
npm test             # engine, scoring, session-mesh, physics soak
npm run check        # svelte-check + tsc
node e2e/lab-probe.mjs   # headless browser: forced faces land as rendered tops
node e2e/solo-probe.mjs  # headless browser: full 12-turn solo game (build first)
```

`#lab` is the practice table (kept in production): free rolls, forced faces for tuning,
observer-roll playback demo.

## Phone test checklist

- **iOS Safari**: first cup-touch prompts motion permission → grant → physical shake
  rattles the cup. Deny → touch-scrub fallback takes over (denial is remembered).
  Silent switch off → audio unlocks on first touch. No vibration on iOS — by design
  the audio crescendo and camera shake carry the intensity.
- **Android Chrome**: HTTPS required for sensors (use `dev:phone` or a deploy).
  Shake intensity auto-gains across sensor scales; vibration ticks with the rattle.
- **Both**: flick the cup toward the table to throw; slow release pours gently.
  Tap settled dice to hold them in the pad slots. Reduced-motion jumps straight to results.

## Deploy

`netlify.toml` builds `dist/` with `npm run build` — same pipeline as the sibling games.
