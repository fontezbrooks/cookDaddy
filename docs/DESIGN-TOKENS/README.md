# cookDaddy Design Tokens

Pencil-MCP design pass output, codified for the React Native side.

**Source of truth:** the `.pen` file last edited via pencil-MCP (lives in
the pencil desktop app's data dir until exported). The tokens themselves
are mirrored verbatim into `src/constants/design-tokens.ts` — adoption
into components happens incrementally as P8 polish lands.

## When this gets re-run

Whenever the visual system shifts (new accent, retuned spring, new spacing
rung, etc.), repeat the pass:

1. Open pencil (`mcp__pencil__open_document`).
2. Update variables with `mcp__pencil__set_variables`.
3. Update screens with `mcp__pencil__batch_design` if visuals need to
   change with the tokens.
4. Re-export PNG snapshots into `./snapshots/` so the diff is visible in
   review.
5. Sync changes to `src/constants/design-tokens.ts` and bump the
   `design-tokens.test.ts` fixtures.

## Surfaces snapshotted in `./snapshots/`

| File | Surface |
|---|---|
| `01-session-active-idle.png` | Active session screen — partner-progress dots (full/half/empty) + two-card stack + Pass/Like CTAs. No edge flash. |
| `02-session-active-flash-right.png` | Same surface mid-swipe-right — green edge flash on the top card (MATCH-UX §8.1). |
| `03-session-active-flash-left.png` | Same surface mid-swipe-left — muted-red edge flash (MATCH-UX §8.1). |
| `04-overlay-t0ms.png` | Match overlay — t=0ms (commit + halo cue, no backdrop yet). |
| `05-overlay-t280ms.png` | t=280ms (backdrop 70%, card scaled to 1.15). |
| `06-overlay-t750ms.png` | t=750ms (flip complete, "It's a match!", partner avatars, confetti firing, recipe title). |
| `07-overlay-t1200ms.png` | t=1200ms (CTAs tappable — "Cook this!" primary, "Keep swiping" secondary). |
| `08-overlay-reduced-motion.png` | `prefers-reduced-motion` variant — same final state, 250ms crossfade only (no spring, no confetti). |

## Token taxonomy

The token tree in `src/constants/design-tokens.ts`:

- **color** — themed `{light, dark}` for background/text/border; plain hex
  for accents (success, danger, the three celebration hues, dot fills).
- **space** — half/one/two/three/four/five/six rung (2/4/8/16/24/32/64),
  identical to the existing `constants/theme.ts` Spacing scale.
- **radius** — sm/md/lg/xl/pill (4/12/16/28/999) for chips/buttons/cards/
  overlay/toggle.
- **fontSize** — micro/small/body/subtitle/title/display (10/12/16/18/24/32).
- **fontFamily** — `{ sans: 'Inter' }` — the existing platform-default
  font stack stays in `constants/theme.ts`; this is the explicit choice
  for typography in the design system.
- **motion.springs** — Reanimated `withSpring` triplets (damping,
  stiffness, mass) per MATCH-UX §4.1 — card / text / avatar / cta / dismiss.
- **motion.timings** — ms values driving the MATCH-UX §3 frame-by-frame
  timeline (backdrop, card scale-up, card flip, reveal-from-commit,
  cta-tappable-from-commit, overlay-auto-close, flash-edge,
  reduced-motion crossfade).
