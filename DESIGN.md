---
name: cookDaddy
description: The Arcade Kitchen — a couples' meal-decision app where the match moment is the product.
# NOTE: This is a TARGET redesign spec, not a scan of current code. The existing
# UI (flat near-black-card-on-white) is being replaced. Build TOWARD these tokens.
# Canonical color values are OKLCH (see prose); hex below is the sRGB fallback
# for Stitch-compatible tooling.
colors:
  persimmon: "#F1582E"
  persimmon-deep: "#CB4421"
  punch-pink: "#FF4F87"
  pool-teal: "#3FC8BE"
  arcade-amber: "#FFB627"
  ink: "#2A2521"
  ink-muted: "#5E5B55"
  canvas: "#F6F6F8"
  surface: "#FFFFFF"
  spotlight: "#241F1B"
  canvas-dark: "#1C1916"
  surface-dark: "#2A2622"
  ink-on-dark: "#F5F4F2"
  success: "#1FAE55"
  danger: "#E23A2C"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: "60px"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "0"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.02em"
  numeral:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.persimmon}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  button-primary-pressed:
    backgroundColor: "{colors.persimmon-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  chip-selected:
    backgroundColor: "{colors.persimmon}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  cta-cook-this:
    backgroundColor: "{colors.success}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "16px 32px"
---

# Design System: cookDaddy

## 1. Overview

**Creative North Star: "The Arcade Kitchen"**

cookDaddy lives where a game cabinet meets a kitchen. The job is unserious — *what's for dinner* — but the payoff is real, so the interface plays like a well-built mobile game: confident color, big satisfying type, decisive tap targets, and reward beats that land. "Arcade" supplies the energy and the game-feel; "Kitchen" supplies the appetite and the warmth. The tension between the two *is* the brand. Everything on screen is tuned so that two people get to a shared "yes" fast, and so the match — the one moment that matters — feels earned.

This system explicitly rejects three things. It is **not generic recipe-app clutter**: no walls of equal cards, no ad-blocks, no busy filter chrome — the deck is the hero and the screen shows one decision at a time. It is **not sterile productivity SaaS**: no gray dashboard energy, no spreadsheet density for surfaces that are personal and shared. And it is **not childish or cartoonish**: no mascots, no balloon gradients, no comic-sans whimsy. Playful is achieved through craft — precise motion, decisive color, real polish — never through gimmicks.

Density is deliberately low. Color is **committed**: a single appetite-forward Persimmon carries identity across the whole app, not just the match overlay, so the product feels alive end to end rather than flat-until-payoff. Restraint guards potency — the loudest moment on any screen is reserved for the match.

**Key Characteristics:**
- One bold brand color (Persimmon) used with intent across every surface, not hoarded for the overlay.
- Big, confident display type (Space Grotesk) for moments; clean humanist body (Inter) for everything readable; mono numerals for arcade-scoreboard data (timers, card counts, streaks).
- One decision per screen — the deck and the match are the heroes; supporting surfaces stay quiet.
- Tactile, spring-driven feedback: things you touch respond physically.
- Reward only what's earned — matches celebrate; swipes whisper.

## 2. Colors

The palette is appetite-forward and high-contrast: a warm brand red-orange anchored on a clean cool-neutral canvas, with a small, punchy "celebration" set reserved for reward moments.

### Primary
- **Persimmon** (`#F1582E` / `oklch(0.66 0.18 42)`): The brand. Primary CTAs, active tab, selected chips, focus accents, and any "this is the move" affordance. Appetite + energy in one hue. Used with intent on every screen, but never more than one dominant Persimmon element competing for attention at a time.
- **Persimmon Deep** (`#CB4421` / `oklch(0.55 0.17 40)`): Pressed/active state of Persimmon controls. The press is a real color shift, not just opacity.

### Secondary
- **Punch Pink** (`#FF4F87` / `oklch(0.70 0.18 1)`): The match/celebration voice. Match-overlay accents, confetti, "it happened" highlights. Pink is the payoff color — it should feel rare and a little electric.

### Tertiary
- **Pool Teal** (`#3FC8BE` / `oklch(0.79 0.10 187)`): Fresh, secondary-positive accent — pantry/“on hand”, gentle confirmations, the cool counterweight to Persimmon's heat.
- **Arcade Amber** (`#FFB627` / `oklch(0.83 0.15 80)`): Streaks, rewards, progress highlights. The scoreboard-glow color.

### Neutral
- **Ink** (`#2A2521` / `oklch(0.25 0.012 60)`): Primary text on light surfaces; warm near-black, never pure `#000`. Contrast on Canvas ≥ 12:1.
- **Ink Muted** (`#5E5B55` / `oklch(0.50 0.01 70)`): Secondary text, captions, placeholders. Tuned to clear 4.5:1 on Canvas — never lighter, even "for elegance".
- **Canvas** (`#F6F6F8` / `oklch(0.975 0.002 270)`): App background, light mode. A true cool-neutral off-white — deliberately **not** cream/sand/paper.
- **Surface** (`#FFFFFF` / `oklch(1 0 0)`): Cards, sheets, inputs — the layer that sits above Canvas.
- **Spotlight** (`#241F1B` / `oklch(0.22 0.008 60)`): The dark "stage" surface, used **only** for the match overlay so the reveal reads as a lit moment. Not a general card color.

### Dark Mode
- **Canvas Dark** (`#1C1916`), **Surface Dark** (`#2A2622`), **Ink-on-Dark** (`#F5F4F2`). Warm near-blacks; Persimmon and the celebration set stay identical and pop harder against them.

### Semantic
- **Success / Fresh Green** (`#1FAE55` / `oklch(0.66 0.16 150)`): "Like", "Cook this!", confirmations. Always paired with a check glyph — never color alone.
- **Danger / Chili Red** (`#E23A2C` / `oklch(0.59 0.20 28)`): "Pass", destructive actions, errors. Crimson, hue-separated from Persimmon's orange so the two never read as the same signal. Always paired with an ✕ glyph or label.

### Named Rules
**The One Loud Thing Rule.** Each screen gets exactly one dominant color moment. On the deck it's the card; on a match it's the Pink reveal; on a form it's the Persimmon submit. If two things shout, neither is heard.

**The Earned-Pink Rule.** Punch Pink appears only on genuine reward (a match, a streak payoff). It is never decoration. Its rarity is what makes the match feel electric.

## 3. Typography

**Display Font:** Space Grotesk (fallback: system-ui, sans-serif)
**Body Font:** Inter (fallback: system-ui, sans-serif)
**Numeral/Mono Font:** JetBrains Mono (fallback: ui-monospace, monospace)

**Character:** Space Grotesk brings the arcade — geometric, slightly retro-technical, distinctive at large sizes — and carries every "moment". Inter does the quiet, screen-optimized reading work. The pairing is a deliberate contrast of a display-cut grotesque against a neutral UI grotesque; weight and size carry the rest. Mono numerals give timers, counts and streaks a scoreboard feel.

### Hierarchy
- **Display** (Space Grotesk 700, 56px / 60, `-0.02em`): The hero voice — "It's a Match!", celebration headers, first-run welcome. May scale up to ~72px for the match hero only; never tighter than `-0.02em` tracking.
- **Headline** (Space Grotesk 600, 32px / 36, `-0.01em`): Section openers, empty-state headers, big stat moments.
- **Title** (Inter 600, 22px / 28): Screen titles, recipe names, list section headers.
- **Body** (Inter 400–500, 16px / 24): Ingredient lists, descriptions, settings rows. Cap measured text at 65–75ch where prose runs long.
- **Label** (Inter 600, 13px, `+0.02em`, **sentence case**): Chips, tab labels, metadata. Deliberately *not* all-caps — no tracked uppercase eyebrows.
- **Numeral** (JetBrains Mono 500, 15px): Session timer, "card 7 / 20", streak counts, prep time, calorie/macro figures.

### Named Rules
**The No-Eyebrow Rule.** No tiny all-caps tracked kickers above sections ("ABOUT", "YOUR POD"). Hierarchy comes from size and weight, not decorative labels.

**The Mono-for-Numbers Rule.** Anything that ticks, counts, or scores is set in JetBrains Mono. It reinforces the arcade frame and keeps tabular figures aligned.

## 4. Elevation

This is a redesign decision, not an inheritance: the system is **mostly flat with a small, intentional tactile vocabulary**. Surfaces at rest are separated from Canvas by tone plus a hairline, not by decorative shadow. Shadow is spent only on things that are genuinely raised or in motion — and the press is *physical*, the core of the "tactile & confident" feel. The dramatic, colored glow is reserved entirely for the match moment.

### Shadow Vocabulary
- **Rest** (no shadow): Cards and rows sit on Surface above Canvas, divided by a 1px `ink @ 8%` hairline. Flat is the default.
- **Raised** (`0 2px 8px rgba(42,37,33,0.08)`): Sheets, the active deck card at rest, floating action controls. Soft, close, ambient.
- **Lifted** (`0 12px 32px rgba(42,37,33,0.18)`): The deck card mid-swipe and modals — depth that signals "in your hand".
- **Pressed** (no shadow + 1px downward translate): Buttons translate down ~1px and drop their shadow on press, then spring back. The control feels physically depressed.
- **Match Glow** (`0 0 48px rgba(255,79,135,0.45)`): Punch-Pink bloom behind the match card only. The one place glow is allowed.

### Named Rules
**The Flat-Until-Touched Rule.** Surfaces are flat at rest. Elevation is a *response* — to touch, to drag, to the match — never ambient decoration. A card that isn't being interacted with casts no shadow.

## 5. Components

Buttons, cards, and inputs should feel **tactile & confident**: chunky enough to hit without looking, decisive in color, and physically responsive — every press is spring-driven (the existing Reanimated spring configs in `motion` are the source of truth).

### Buttons
- **Shape:** Pill (`999px`) for primary actions; `12px` (`rounded.md`) for inline/compact buttons. No 1px-border + soft-shadow "ghost card" combos — pick a fill or a border, never both as decoration.
- **Primary:** Persimmon fill, white text, `16px 28px` padding. Pressed → Persimmon Deep + 1px down-translate + shadow collapse (spring back on release).
- **Secondary:** Surface fill, Ink text, 1px `ink @ 12%` border. Same press physics.
- **Cook-this (success CTA):** Fresh Green fill, white text, pill, `16px 32px` — the one button that gets the match's success color, always with a check or chef glyph.
- **Hover/Focus:** Focus ring = 2px Persimmon at 60% with a 2px offset; never remove focus visibility.

### Chips
- **Style:** Pill, Surface fill, Ink-Muted text, 1px hairline border. `8px 14px` padding.
- **State:** Selected = Persimmon fill + white text (dietary filters, active toggles). Selection is a color *and* fill change so it survives color-blindness; pair with a check where space allows.

### Cards / Containers
- **Corner Style:** `16px` (`rounded.lg`) for content cards; `12px` for compact rows. Never above `20px` — no over-rounded blobs.
- **Background:** Surface on Canvas. The recipe/deck card is the exception — it's image-forward and full-bleed within its frame.
- **Shadow Strategy:** Flat at rest (hairline only); Raised when active; Lifted mid-swipe (see Elevation).
- **Internal Padding:** `16px` default (`spacing.lg`), `24px` for hero cards.

### Inputs / Fields
- **Style:** Surface fill, 1px `ink @ 14%` border, `12px` radius, `14px 16px` padding.
- **Focus:** Border shifts to Persimmon + 2px Persimmon ring. No glow.
- **Error:** Border → Chili Red + inline message with an ✕ glyph; never red border alone.

### Navigation (Tab Bar)
- **Surface:** Bottom tab bar on Surface with a top hairline. Five tabs: Home · Cookbook · Fridge · Shopping · Settings.
- **States:** Active tab = Persimmon icon + Persimmon label (Inter 600, 13px, sentence case). Inactive = Ink-Muted. Active state is icon-fill + color, so it's never color-only.
- **Motion:** Icon does a small spring-scale on selection (game-feel), respecting reduced-motion.

### Signature Component — The Match Overlay
The product's reason to exist. A dark **Spotlight** stage drops in, the matched recipe card scales + reveals, Punch-Pink confetti fires, a Match Glow blooms, and the **Cook this!** (Fresh Green) and **Keep swiping** CTAs settle in. The full multisensory beat (visual + haptic + optional audio) runs ~2s, with a hard auto-close cap. A `prefers-reduced-motion` path replaces the choreography with a ~250ms crossfade. This is the only surface that uses Spotlight, Match Glow, and Display-size type together — that exclusivity is the point.

## 6. Do's and Don'ts

### Do:
- **Do** carry **Persimmon** across the whole app (active tab, selected chip, primary CTA), so the product feels alive before the payoff — color strategy is *committed*, not hoarded.
- **Do** keep one loud color moment per screen (The One Loud Thing Rule).
- **Do** set anything that counts or ticks in **JetBrains Mono** (timers, "card 7/20", streaks).
- **Do** make presses physical: spring-driven translate + color shift, using the existing Reanimated spring tokens.
- **Do** reserve **Punch Pink**, **Spotlight**, and **Match Glow** for the match moment only.
- **Do** pair every success/danger signal with a glyph or label, and ship a `prefers-reduced-motion` alternative for every animation (WCAG AA, color-blind safe, reduced-motion — all hard requirements).
- **Do** keep secondary text at **Ink Muted** or darker; verify ≥4.5:1 against Canvas.

### Don't:
- **Don't** ship **generic recipe-app clutter** — no walls of equal cards, ad blocks, or busy filter chrome. One decision per screen.
- **Don't** drift into **sterile productivity SaaS** — no gray dashboard density or spreadsheet energy on personal/shared surfaces.
- **Don't** go **childish or cartoonish** — no mascots, balloon gradients, or comic-sans whimsy. Playful comes from craft.
- **Don't** use tiny all-caps tracked **eyebrows** above sections (The No-Eyebrow Rule).
- **Don't** round cards past `20px`, and never pair a 1px border with a soft wide drop-shadow as decoration.
- **Don't** rely on color alone for like/pass, success/error, or active tab.
- **Don't** spend shadow on resting surfaces — flat until touched.
- **Don't** let **Danger Crimson** and **Persimmon** read as the same signal; keep their hue separation.
