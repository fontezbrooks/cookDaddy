# cookDaddy — Match Celebration UX Spec

**Status:** Draft v1
**Owner:** Fontez Brooks
**Last updated:** 2026-05-21
**Source:** PRD FR-S6, user directive 2026-05-21 ("Any way we can get more dopamine the better")
**Scope:** The motion / haptic / audio / variable-reward design for everything that makes a match feel earned and shared. Plus the smaller rewards that string sessions together between matches.

> **Out of scope:** Implementation code (see `/sc:implement`), visual brand identity (logo, typography, color tokens — design system pass), and gameplay balancing beyond v1.

---

## 1. Why a separate doc

The PRD treats the match overlay as one acceptance criterion (FR-S6). In reality, the **match moment is the product**: it's the payoff that justifies every other surface. Underweighting it = "yet another swipe app". Overweighting it without restraint = annoying. This doc sets explicit, testable rules for both.

---

## 2. First-Principles: What Makes a Match Feel Good

Reducing dopamine engineering to its irreducible truths (per global first_principles directive):

| Principle | Why it works (bedrock) | How we use it |
|---|---|---|
| **Anticipation > immediate reward** | Dopamine spikes on *prediction* of reward, not receipt. (Schultz, 1997 — well-replicated.) | 250–400ms suspense gap between swipe-commit and reveal. |
| **Multisensory > visual-only** | Cross-modal cues hit independent neural pathways; combined effect > sum of parts. | Always pair visual with haptic. Optional audio. |
| **Synchrony = bonding** | Behavioral synchrony triggers oxytocin release in pair contexts. | Both phones do the same thing at the same time. Partner avatar is on screen. |
| **Variable reward > predictable** | Variable-ratio schedules produce the strongest engagement (slot-machine effect, applied ethically here). | Match #1 of a session feels different from #3. First-ever match is unique. |
| **Loss aversion via restraint** | Constant celebration habituates fast; rarity preserves potency. | Only matches get the full overlay. Swipes get a whisper, not a shout. |
| **Visible progress** | Closing-the-gap signals are themselves rewarding. | Subtle progress dots; "partner is on card 7/20". |
| **Closure > open loops** | Unfinished sessions create cognitive load. | Always offer a clean exit screen, even with zero matches. |

**Anti-principle:** *Never* fake a near-match. Engineered FOMO erodes trust faster than it builds engagement. If they didn't both right-swipe, the system stays silent.

---

## 3. The Match Sequence — Frame-by-Frame

Total runtime: **~2.0s** from swipe commit to "Cook this!" CTA becoming tappable. Tuned tight enough to not feel slow; long enough to register as a *moment*.

```
t=0ms       SWIPE COMMITTED (right) on card N — server confirms match
            ┌─ Background pre-fetch: matched recipe full detail
            └─ Realtime broadcast match.detected fires
t=0ms       Both clients receive match.detected simultaneously
            ┌─ Card N freezes in place, gentle glow halo begins fading in
            └─ Haptic: SOFT IMPACT (Haptics.ImpactFeedbackStyle.Light)
t=120ms     Screen dims to 70% opacity backdrop
            └─ Card N starts scaling up (1.0 → 1.15) over 280ms, spring
t=280ms     Card center: small "match" sigil/particle burst (~6 particles)
            └─ Haptic: SOFT IMPACT again (mirrors a heartbeat double-tap)
t=400ms     Card N flips along Y-axis (180°, perspective 1200), 350ms
            └─ Back face: match overlay layout
t=750ms     Flip complete. Confetti emitter fires (60 particles, 2s duration)
            └─ Haptic: HEAVY IMPACT (Haptics.ImpactFeedbackStyle.Heavy)
            └─ Optional audio: short "match chime" if sound enabled
            └─ Partner avatar bubbles in (spring scale 0 → 1, damping 10)
            └─ "It's a match!" text springs in (translateY 20→0, opacity 0→1)
            └─ Recipe title fades in (180ms after text)
t=1100ms    Recipe hero image: subtle ken-burns zoom begins (scale 1.0 → 1.05, 6s loop)
t=1200ms    CTA "Cook this!" button spring-in
            └─ Secondary CTA "Keep swiping" fades in
            └─ Button becomes tappable
t=1200ms+   Confetti continues falling for ~1.8s, then GC
```

**Why exactly these numbers:**
- 120ms first delay = perceptual "something is happening" threshold without feeling sluggish.
- 750ms flip completion = the dopamine literature's sweet spot for anticipation → resolution.
- 2.0s total = under the attention span limit but long enough to *feel* like an event, not a notification.

---

## 4. Motion Spec

All animation runs on `react-native-reanimated` worklets on the UI thread. Targets 60fps on iPhone 12 / Pixel 6.

### 4.1 Springs (Reanimated `withSpring`)

| Element | damping | stiffness | mass | Notes |
|---|---|---|---|---|
| Card scale-up | 12 | 180 | 1 | Slight overshoot, bouncy but controlled |
| Card flip | n/a (timing) | n/a | n/a | `withTiming` 350ms, `Easing.bezier(0.25, 0.1, 0.25, 1)` |
| "It's a match!" text | 10 | 160 | 0.9 | More bounce — celebratory |
| Partner avatars | 10 | 200 | 0.8 | Snappy entrance |
| CTA buttons | 14 | 200 | 1 | Restrained — they need to be tappable |
| Match overlay dismiss | 18 | 220 | 1 | Smooth, not bouncy on exit |

### 4.2 Backdrop dim

Black layer, opacity 0 → 0.70 over 280ms, `Easing.out(Easing.ease)`. Tappable area excludes the overlay so accidental dismiss is impossible during reveal.

### 4.3 Confetti

| Param | Value |
|---|---|
| Particle count | 60 |
| Colors | App accent (3 hues from design tokens — TBD in design system) |
| Shapes | Mix: circles 50%, squares 30%, hearts 20% |
| Spawn origin | Center of recipe card (with ±40px jitter) |
| Initial velocity | 200–400 units/s upward, ±60° spread |
| Gravity | 600 units/s² |
| Rotation | Random 0–360°/s |
| Lifetime | 1.8–2.2s, alpha fade in last 400ms |
| GPU path | Skia (react-native-skia) for procedural particles (preferred) **or** Lottie (`lottie-react-native`) for designer-authored bundle |

### 4.4 Recipe image ken-burns (post-reveal idle)

- `scale: 1.0 → 1.05`, `withRepeat(..., -1, true)` reversing, 6s per cycle.
- `translateX: ±4px` over 8s, same loop.
- Keeps the still image alive while user reads.

---

## 5. Haptic Spec

Uses `expo-haptics`. Both partners' devices fire identical haptics simultaneously (within Realtime broadcast jitter, p95 < 100ms — perceptually synchronous).

| Trigger | API call | Why |
|---|---|---|
| Swipe right (any) | `ImpactFeedbackStyle.Light` | Tactile confirmation; subtle. |
| Swipe left (any) | `selectionAsync()` | Lighter than right — restraint. |
| Match — t=0ms | `ImpactFeedbackStyle.Light` | Soft tap — "something is happening". |
| Match — t=280ms | `ImpactFeedbackStyle.Light` | Heartbeat double — anticipation. |
| Match — t=750ms (reveal) | `ImpactFeedbackStyle.Heavy` | The payoff hit. |
| Match milestone (first-ever, streak) | `NotificationFeedbackType.Success` | Distinct, system-recognized "win". |
| End of deck no matches | `selectionAsync()` | Neutral — no haptic punishment. |

**Android equivalence:** expo-haptics maps to `Vibration` API on Android (single-shot patterns). iPhone-style precision haptics aren't fully reproducible; we accept Android as "good enough" v1.

**Accessibility:** Haptics respect a Settings toggle (default ON). Users with sensory sensitivity can disable entirely.

---

## 6. Audio Spec

**Default: OFF.** Sound is opt-in. (Couples opening a date-night app on the couch don't want surprise noises.)

When enabled (Settings → Sound effects):

| Event | Sound | Duration | Library |
|---|---|---|---|
| Match reveal | Soft chime (two notes, major third, ~500ms) | 500ms | `expo-audio` |
| First match of session | Same + extra shimmer overlay | 800ms | layered |
| Match milestone (first ever) | Custom celebratory motif (1.2s, with a "ta-da" feel) | 1200ms | dedicated asset |
| Swipe right | None | — | — |
| Swipe left | None | — | — |
| No-match session end | None | — | — |

**Audio assets:** v1 placeholders OK; final pass with a sound designer pre-launch. Royalty-free until then.

**Mixing:** All event sounds normalized to -16 LUFS. Respects iOS silent mode and Android Do Not Disturb.

---

## 7. Variable Reward Catalog

Different match contexts → different celebration variants. Prevents habituation; rewards milestones.

| Variant | Trigger | Differentiator |
|---|---|---|
| **Standard match** | Any match | Default sequence above. |
| **First match of session** | `match_index_in_session == 1` | +20% confetti density; first chime gets the shimmer overlay (if audio on); copy: "First match of the night!" |
| **First match ever (this pod)** | Pod has zero prior matches | Unique overlay layout: full-screen takeover, longer 3.0s sequence; copy: "Your first match. Welcome to the cookbook." |
| **Streak match** | 3+ consecutive cards both partners right-swiped (regardless of match logic) | Subtle "🔥 streak" indicator above next card; doesn't override standard match sequence. |
| **Speedy match** | Both swiped within 1500ms of each other | Tag: "Same wavelength 🧠" on overlay; standard haptics. |
| **Last-card match** | Match happens on card N=deck_size (i.e. very last card) | Copy: "Came down to the wire!"; standard motion. |

All variants share the same core 2s timeline; differences are layered overlays + copy + audio shimmer. No variant slows the user down beyond the 2s budget.

---

## 8. Micro-Rewards During the Deck

Between matches, small confirmations sustain engagement without becoming noise.

### 8.1 Per-swipe feedback

- Right swipe: card flings right with rotation; light haptic; card-edge green flash (200ms).
- Left swipe: card flings left, smaller rotation; selection haptic; card-edge muted-red flash (200ms).
- No animation overshoot — the swipe should feel *crisp*, not bouncy.

### 8.2 Partner-progress indicator

Small dot row at top of screen: 20 dots, one per card.
- Filled = both partners have swiped (direction-blind).
- Half-filled = one partner has swiped.
- Empty = neither swiped.

Updates via Realtime `swipe.progress` events. Tells you "Alex is on card 12" without leaking their choices. Tiny dopamine hit when their dot catches up to yours.

### 8.3 Synchronized swipe moment

If both partners swipe the same card within 800ms of each other (either direction), a brief shimmer pulses on the deck border. Doesn't reveal direction — just signals "you two are in sync." Subtle (300ms, low-opacity).

### 8.4 What we do *not* do

- ❌ No "X right-swiped this!" preview tease before reveal. Erodes trust.
- ❌ No "Almost a match!" copy if partner left-swiped. Same problem.
- ❌ No streaks counter that resets visibly on miss. Punishes the user.
- ❌ No coins / XP / leveling. Keep it human, not gamified.

---

## 9. End-of-Session Resolution

When the deck is exhausted or session ended:

### 9.1 With matches

Full-screen summary:
- Big number: "{N} matches!"
- Mini grid of matched recipe images (tap → cookbook entry).
- Primary CTA: "Pick tonight's dinner →" (jumps to cookbook with these N pre-filtered).
- Secondary: "Swipe more recipes" → starts a new session with a fresh deck.
- Haptic: `NotificationFeedbackType.Success`.

### 9.2 Without matches

Critical: not a punishment screen.
- Copy: "Round complete! No matches yet. Tastes are picky tonight — try another round?"
- Primary CTA: "Try another deck"
- Secondary: "Adjust filters" (deep-links to dietary profile)
- Tertiary: "Done for now"
- Haptic: `selectionAsync()` (neutral)
- No dim / no overlay theatrics — keep it light.

### 9.3 Partner disconnected ending

Copy: "Partner stepped away. Want to keep swiping solo, or wrap up?"
- Solo-swipe mode is *not* in v1 (PRD NG2). The "keep swiping" option in this case is gentle suspended-deck recovery only.
- Primary CTA: "End session"; secondary "Wait a bit longer" (extends grace to 5min).

---

## 10. Accessibility

| Concern | Behavior |
|---|---|
| `prefers-reduced-motion` | All spring/scale/flip animations replaced with crossfade (250ms). Confetti disabled. Ken-burns disabled. |
| Haptics toggle | Settings → Haptics ON by default. Toggle disables all `expo-haptics` calls app-wide. |
| Sound toggle | Settings → Sounds OFF by default. Toggle enables. Respects system mute. |
| Color-blind safety | Match overlay does not rely on color alone. Text "It's a match!" + icon + recipe image carry the meaning. |
| Screen reader | Match overlay announces: "Match! Both of you liked {recipe title}. Cook this, or keep swiping." |
| Reduced transparency | Backdrop dim becomes a solid scrim instead of opacity gradient. |
| Large dynamic type | Overlay layout reflows; CTAs grow with text; no truncation. |

---

## 11. Performance Budget

| Metric | Target | How verified |
|---|---|---|
| Match overlay first frame from broadcast event | ≤ 100ms | Internal perf marker → analytics |
| Sustained 60fps during confetti | ≥ 58fps p95 | Reanimated FPS overlay in dev builds; Sentry perf in prod |
| Confetti JS frame work | ≤ 4ms / frame | Reanimated worklets keep work off JS thread |
| Memory ceiling during overlay | +25MB vs idle (allocations released within 5s of dismiss) | Xcode / Android profiler in pre-launch QA |
| Cold-launch impact | None | Confetti emitter lazy-loaded on first session |

If targets miss on a device class (e.g., older Android), feature-flag a "lite mode": no confetti, simpler springs, retained haptics + sounds.

---

## 12. Settings Surface

In Settings → "Vibes":

- [x] Haptics (default ON)
- [ ] Sound effects (default OFF)
- [x] Animations (default ON — toggling off cascades to reduce-motion behavior)
- [ ] "Lite mode" (auto-enabled on older devices; manual override)

Discovery: tooltip on first match overlay says "Tap ⚙️ to tune the vibe."

---

## 13. Analytics — Match Engagement

Tracked via PostHog. Used to tune the dopamine economy over time.

| Event | Properties |
|---|---|
| `match_revealed` | match_id, pod_id, recipe_id, session_id, variant (standard/first_of_session/first_ever/streak/speedy/last_card), time_to_reveal_ms |
| `match_overlay_dismissed` | match_id, duration_ms, action (cook_this / keep_swiping / closed) |
| `match_first_ever` | pod_id, time_since_pod_created_min |
| `settings_vibes_changed` | which_setting, new_value |

KPIs the team should watch monthly:
- Median session length and matches per session.
- "Cook this" CTA tap-through rate from match overlay.
- Reduced-motion adoption rate (signals if motion is excessive).

---

## 14. Anti-Patterns / Things We Refuse to Do

- ❌ "Boost your matches" paid feature. Trust-eroding.
- ❌ Fake match notifications to lure re-engagement.
- ❌ Force-prompting for app review after a match. Save it for after a *cooked* recipe.
- ❌ Streak shaming ("You broke your 7-day streak!"). Couples shouldn't owe an app daily attention.
- ❌ Animations exceeding 2.5s for the standard match. Hard cap.
- ❌ Audio that auto-plays at first match without prior opt-in.

---

## 15. Implementation Notes

**Recommended libraries:**
- `react-native-reanimated` — all motion (worklets, springs, gestures).
- `expo-haptics` — all haptic patterns.
- `react-native-skia` (preferred) **or** `lottie-react-native` (fallback) — confetti + halo.
- `expo-audio` — sound effects when enabled.
- `expo-image` — recipe images (fast decode + memory caching).

**Component sketch (interface only; implementation in `/sc:implement`):**

```text
<MatchOverlay
  match={{ id, recipe, variant, matchedAt }}
  partner={{ id, name, avatarUrl }}
  onCookThis={() => navigate to recipe with shopping prefill}
  onKeepSwiping={() => dismiss}
  onDismiss={() => dismiss}
/>

Internally portals over the swipe deck (z-index above), receives `match.detected` from session channel listener at the screen level, mounts on first event, unmounts ~500ms after dismiss.
```

---

## 16. Test Plan

| Layer | Test |
|---|---|
| Unit | Variant resolver: given (session matches, pod_lifetime_matches, swipe_time_delta_ms, deck_position) → correct variant |
| Unit | Haptic invocation count for each variant |
| Component | Match overlay renders with all variants; reduce-motion variant skips animations |
| Component | Settings toggles disable haptics / sounds / animations as advertised |
| Integration | Two simulators receive `match.detected` → overlay appears within budget |
| Manual / device | iPhone 12 + Pixel 6: visual review, 60fps confirmed, haptics felt, sounds audible (if enabled) |
| Accessibility | VoiceOver reads overlay; TalkBack reads overlay; reduce-motion path verified on both OSes |

---

## 17. Open Questions

1. **Confetti library choice — Skia vs Lottie.** Skia is more flexible and performant for procedural particles; Lottie is friendlier for a designer to author. Defer until the designer is engaged.
2. **Sound design ownership.** Need a sound designer for the final 3 sounds (standard match, first-ever, milestone) pre-launch.
3. **Brand color tokens for confetti palette.** Blocked on design system pass.
4. **Special-occasion variants (Valentine's Day, anniversary)** — out of scope v1, parking lot for v2.
