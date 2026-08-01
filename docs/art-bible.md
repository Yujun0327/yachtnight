# Yacht Night — Art Bible: "Casino Night"

One warm spotlight over deep green felt. Everything the light doesn't reach falls into
darkness. The dice — ivory, rounded, ink-bled pips — are the only actors; the room exists
to frame the moment they leave the cup.

## Mood

Late, quiet, high-stakes. Not Vegas neon — a back-room card table: walnut, brass, leather,
green baize. The drama is chiaroscuro, not color.

## Palette (mirrors `src/app.css` and `src/dice/materials.ts`)

| Token | Hex | Use |
| --- | --- | --- |
| `--night` | `#0a0d0b` | the dark beyond the table |
| `--felt` / `--felt-lo` | `#0b3d2e` / `#062017` | spotlit felt → shadowed felt |
| `--walnut` | `#241610` | table rim |
| `--cream` | `#f4ecd9` | scoresheet, dialogs, die ivory |
| `--pip` | `#2a2118` | pip ink (warm near-black, never pure black) |
| `--brass` | `#c9a227` | the ONLY accent metal: hairlines, studs, cup band |
| `--lamp` | `#ffd9a0` | spotlight color |
| `--danger` | `#a8352f` | zeroed boxes |

## Type

- **Limelight** — display: title marquee only. Vaudeville-poster energy, used sparingly.
- **Bodoni Moda** — numerals: scoresheet marks, totals, room codes. Letterpress contrast.
- **Jost** — UI: labels, buttons, body.

## 3D scene rules (`src/dice/scene.ts`)

- ONE shadow-casting spotlight (512px map), faint cool ambient, one warm point fill. Nothing else.
- DPR capped at 2, no postprocessing; the vignette is CSS, the grain is a data-URI overlay.
- All geometry procedural (RoundedBoxGeometry, cylinders), all textures canvas-generated.
  **Zero image binaries, zero WASM** — the sibling ethos, extended to 3D.
- Camera sits above the player's edge; drama moves (micro-shake while rattling, push-in on
  the settle) belong to the roll-director, never to free orbit.

## Motion voice

The ritual escalates: cup tracks the hand → rattle grows with real collisions → whoosh →
tumble → per-die settle stagger → brass flash + sting only for five-of-a-kinds. Between
rolls the table is still. `prefers-reduced-motion` collapses every beat to its end state.

## Chrome (2D)

Sibling rules apply: one shadow token, brass hairlines (1.5px) as the only ornament line,
`.panel` cream surfaces with grain, chamfers/radii small (2px / 6px). The scoresheet is a
physical prop — cream card, letterpress numerals, grease-pencil zero strikes.
