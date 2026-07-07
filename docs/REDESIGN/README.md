# cookDaddy — Complete Redesign: Design Spec

**Status:** Design (post-brainstorm). Next: `/sc:implement` per slice.
**Owner:** Fontez Brooks
**Last updated:** 2026-07-07
**Source of truth (visual):** Figma `vpNhCYjD2neFYUO0De9roO` (Stitch-generated, imported).
**Inputs:** `docs/PRD/README.md` (as-built v2 brief), `docs/MATCH-UX/README.md` (motion contract).

> Values below are **extracted from the actual Figma** (Welcome `1:7`, Cookbook `1:571`). Remaining screens are sampled during Slice 0 to fill gaps; the token architecture here is complete enough to build against.

---

## 1. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Missing screens (Home, Settings + subs, Lobby, Session Summary, OTP step, push priming) | **Derive** from the extracted system |
| D2 | Fidelity | **Faithful, re-implemented for RN** (Stitch/web → native idioms) |
| D3 | Tokens | **Extract fresh, replace** `src/constants/design-tokens.ts` |
| D4 | Rollout | **Foundation-first, then reviewable slices**; 538 tests green each slice |
| D5 | Fonts | **New:** Plus Jakarta Sans (display) + Be Vietnam Pro (text). Retire Inter/Space Grotesk/JetBrains Mono from UI |
| D6 | Theme | **Light-only v1**; token shape stays `{light,dark}`-ready, dark deferred |
| D7 | Motion | Keep **MATCH-UX §3** timing/haptic contract; reskin visuals only |
| D8 | Navigation | Same 5-slot tab bar; **Home → "Recipes"**: Recipes · Cookbook · Fridge · Shopping · Settings |

---

## 2. Design language — "Warm Arcade Kitchen"

Warm cream-pink canvas, deep-plum brand ink, high-energy orange accent, tactile "chunky" controls (hard bottom borders + hard-offset shadows), soft plum-tinted elevation on cards, generous pill geometry, friendly two-font pairing.

---

## 3. Design tokens (extracted)

### 3.1 Color
| Token | Value | Usage |
|---|---|---|
| `canvas` | `#FFF8F9` | app background (warm cream-pink) |
| `surface` | `#FFFFFF` | cards, inputs, sheets |
| `brand` | `#491E3D` | brand plum — wordmark, headings accent, links |
| `brandDeep` | `#300827` | app-bar title, deepest plum |
| `ink` | `#1F1A1D` | primary text / titles on light |
| `inkBody` | `#4F444A` | secondary/body text |
| `inkMuted` | `#D3C2CA` | placeholder, hairline borders, inactive dots |
| `accent` | `#FF850B` | primary action, active nav, highlights (orange) |
| `accentPressBorder` | `#412909` | primary button hard bottom border |
| `accentBorderAlt` | `#311E09` | input border / chip hard shadow base |
| `onAccent` | `#602E00` | label on orange fills (dark brown) |
| `accentGlow` | `rgba(248,128,0,0.25)` | primary-button drop shadow |
| `badgeGradient` | `linear-gradient(134deg, #F88000 0%, #620B49 100%)` | match/co-op badge |
| `elevationTint` | `rgba(98,11,73,0.1)` | plum-tinted card shadow color |

> Semantic **success/danger** (swipe like/pass, destructive) are not present on the two sampled screens — extract from the Swipe Deck (`1:204`) + Recipe Details (`1:258`) in Slice 0; fall back to MATCH-UX §8.1 if absent. Preserve AA (destructive fill needs a white-safe deep tone).

### 3.2 Typography — families `PlusJakartaSans` (display), `BeVietnamPro` (text)
| Role | Family / weight | Size / line | Tracking |
|---|---|---|---|
| `display` | Jakarta ExtraBold | 48 / 56 | -0.96 |
| `h1` (screen title) | Jakarta Bold | 24 / 32 | — |
| `h2` (section) | Jakarta Bold | 24 / 32 | — |
| `heroHeading` | Jakarta Bold | 28 / 36 | — |
| `cardTitle` | Jakarta/BeVietnam 16 | 16 / 24 | — |
| `bodyLg` | BeVietnam Regular | 18 / 28 | — |
| `body` | BeVietnam Regular | 16 / 24 | — |
| `button` | BeVietnam SemiBold | 14 / 20 | 0.14 |
| `caption`/nav | BeVietnam Bold | 12 / 16 | — |

### 3.3 Spacing (4-based): `4, 8, 12, 16, 20, 24, 32, 64, 96`
Screen gutter = 20. Card padding = 12–16. Section gap = 24. Content top inset (below app bar) = 64; bottom inset (above nav) = 96.

### 3.4 Radius: `sm 12` (cards, inputs, small), `lg 16` (featured card), `pill 9999` (buttons, chips, badges, active nav)

### 3.5 Elevation (plum-tinted; translate to RN shadow + `elevation`)
| Token | Value |
|---|---|
| `card` | `0 4 12 rgba(98,11,73,0.1)` |
| `logo` | `0 8 32 rgba(73,30,61,0.1)` |
| `buttonGlow` | `0 4 6 rgba(248,128,0,0.25)` + hard `borderBottomWidth:2 #412909` |
| `chipActive` | hard offset `0 2 0 rgba(49,30,9,0.2)` |
| `nav` | `0 -4 12 rgba(0,0,0,0.05)` + top hairline `#D3C2CA` |
| `appBar` | `0 1 2 rgba(0,0,0,0.05)` |

### 3.6 Motion — unchanged
Reuse the existing `DesignTokens.motion` spring/timing tokens sourced from MATCH-UX §3/§4. Only colors of animated elements change (confetti hues re-sampled from the new palette).

---

## 4. Component architecture

New/updated shared primitives (build in Slice 1, before screens). Map to existing files where possible.

| Component | Spec | Current file |
|---|---|---|
| `PrimaryButton` | orange pill, label `onAccent` BeVietnam SemiBold 14, **hard 2px bottom border** `accentPressBorder`, `buttonGlow` shadow, optional trailing icon; press flattens the border (tactile) | `components/primary-button.tsx` (rework) |
| `SecondaryButton`/Link | transparent pill, `brand` text | new |
| `AppBar` | translucent blur bar (h64), left/right 40px icon buttons, centered `brandDeep` Jakarta Bold 24 title | new (`components/app-bar.tsx`) |
| `TabBar` | translucent blur, 5 items, **active = orange pill** w/ `onAccent` label; inactive icon+label `inkBody` BeVietnam Bold 12 | `(tabs)/_layout.tsx` + `tab-bar-icon.tsx` |
| `RecipeCard` | white, radius 12/16, `card` shadow, top image, title + meta row (icon · dot · tag), heart overlay (blurred white circle), match badge | new (`components/recipe-card.tsx`) |
| `MatchBadge` | gradient pill (orange→plum), white label + icon | new |
| `FilterChip` | pill; active orange + `chipActive` shadow + `onAccent`; inactive white + `inkMuted` border | new |
| `SearchInput` | white, 1px `accentBorderAlt` border, radius 12, leading icon, `inkMuted` placeholder, `card` shadow | new |
| `ThemedText` | remap `type` variants to §3.2 scale + new families | `components/themed-text.tsx` (rework) |
| `Confetti` | reskin hues to new palette; keep Skia impl (Three.js → Skia per D2) | `components/confetti.tsx` |
| `MatchOverlay` | reskin surfaces/badges; keep MATCH-UX motion | `components/match-overlay.tsx` |

---

## 5. Screen inventory, routes & status

**Delivered (Figma → route):**
| Figma | Route/component |
|---|---|
| Welcome `1:7` | `(auth)/sign-in.tsx` method step |
| Join the Pod `1:26` | `(app)/invite/[token].tsx` |
| Invite Your Partner `1:81` | invite CTA surfaces |
| Dietary Profile (Step 1/2/3) `1:137` | `(app)/onboarding/index.tsx` + `settings/dietary.tsx` |
| Recipe Swipe Deck `1:204` | `components/swipe-deck.tsx` |
| Recipe Details `1:258` | `cookbook/[matchId].tsx` |
| Match Reveal (static `1:423` + animated `1:523`) | `match-overlay.tsx` + `confetti.tsx` |
| Shared Cookbook `1:571` | `cookbook/index.tsx` |
| Shared Shopping List `1:706` | `(tabs)/shopping.tsx` |
| Our Fridge `1:809` | `(tabs)/fridge.tsx` |

**Derived (design from system, D1):** Recipes/Home (`(tabs)/home.tsx`), Session Lobby, Session Summary + Streak (`session-summary.tsx`), Settings hub + Notifications/Pod/Profile/Account/Vibes, Auth **OTP code step** (`auth-code-step`), push-priming sheet, all empty/loading/error states.

---

## 6. Navigation / IA

Tab bar (translucent, active = orange pill): **Recipes · Cookbook · Fridge · Shopping · Settings**. "Recipes" is the former Home (session entry / discovery). Focused flows outside tabs: auth, onboarding, session (lobby → deck → summary), match overlay (portal above deck), invite accept.

---

## 7. Token migration strategy

1. **Replace** `src/constants/design-tokens.ts` with the §3 tokens (keep `{light,dark}` shape; dark = light values for v1).
2. Reconcile `src/constants/theme.ts` `Spacing`/`Colors` to the new scale; keep exported names stable where consumers rely on them, alias where values change.
3. Rework `ThemedText` `type`→ §3.2 map so every text consumer updates centrally.
4. Retire pencil/Arcade tokens (`persimmon*`, `poolTeal`, `arcadeAmber`, `ink*`, `canvas`, etc.) — grep consumers and repoint. Keep MATCH-UX-sourced `motion` + dot/scrim tokens.
5. Add fonts: `@expo-google-fonts/plus-jakarta-sans`, `@expo-google-fonts/be-vietnam-pro`; load in root `_layout.tsx` alongside/replacing current families.

---

## 8. Native-translation rules (Stitch/web → RN)

- **Gradients** (`linear-gradient`) → `expo-linear-gradient` (badge, decorative). No CSS gradient bg — use a solid `canvas` or a Skia/gradient view.
- **`backdrop-blur`** (app bar, nav, heart overlay) → `expo-blur` `BlurView` with the translucent tint over it; provide a solid-fill fallback where blur is costly.
- **Chunky button** = `borderBottomWidth: 2` + shadow; on `pressIn` reduce bottom border / translateY to fake the press. Not a CSS-only effect.
- **`shadow-[…]`** → RN `shadowColor/Offset/Opacity/Radius` + Android `elevation`; keep the plum tint.
- **Pill (`rounded-[9999px]`)** → `borderRadius: 999`.
- **Grid** (`grid-cols-2`) → flex-wrap row or `FlatList numColumns={2}`.
- **`text-ellipsis`** → `numberOfLines` + `ellipsizeMode`.
- **Three.js confetti** → existing Skia `Confetti` (D2), re-hued.
- **Icons/logo/illustrations** → export from Figma assets (Slice 0), store locally; the remote MCP asset URLs expire in 7 days — do **not** ship those URLs.

---

## 9. Slice plan (each = its own PR, tests green)

| Slice | Scope | Key files | Test impact |
|---|---|---|---|
| **0 — Foundation: tokens + fonts + assets** | Replace `design-tokens.ts`; add 2 fonts; export/store icons+logo; sample remaining screens for semantic colors | `constants/design-tokens.ts`, `theme.ts`, root `_layout.tsx`, `package.json` | token/theme snapshot updates |
| **1 — Shared primitives** | PrimaryButton, SecondaryButton, AppBar, TabBar, RecipeCard, MatchBadge, FilterChip, SearchInput, ThemedText remap | `components/*` | component tests reworked |
| **2 — Auth + onboarding** | Welcome, OTP step (derived), dietary stepper, join pod, invite | `(auth)/*`, `onboarding/*`, `invite/*`, `settings/dietary` | screen tests |
| **3 — Core loop** | Swipe deck, recipe details, match overlay (Skia confetti), lobby (derived), session summary + streak (derived) | `swipe-deck`, `cookbook/[matchId]`, `match-overlay`, `confetti`, `session/*`, `session-summary` | heaviest; motion preserved |
| **4 — Collections** | Cookbook index, shopping, fridge | `cookbook/index`, `shopping`, `fridge` | list/grid tests |
| **5 — Shell + settings + home** | Recipes/Home (derived), settings hub + Notifications/Pod/Profile/Account/Vibes (derived), push priming | `(tabs)/home`, `settings/*`, `push-priming-sheet` | settings tests |

---

## 10. Open questions (remaining)
1. **Semantic colors** (like/pass/success/danger) not on sampled screens — confirm after Slice 0 sampling of Swipe Deck + Recipe Details; else reuse MATCH-UX §8.1 (AA-checked).
2. **"Recipes" tab content** — is it the session/discovery entry (former Home) or a standalone recipe browse? Assumed = session entry.
3. **Illustrations/decorative layers** (e.g. "Background Decorative Elements", Three.js on Fridge) — reproduce natively, simplify, or drop? Assumed: simplify to static where cheap.
4. **Match badge "% Match"** — is a numeric match score available in data, or decorative? If decorative, drop the number.

## 11. Risks
- **Font swap is app-wide** — every text surface shifts; do it centrally in Slice 0/1 to avoid drift.
- **Blur/gradient/shadow perf** on low-end Android — provide solid fallbacks; keep 60fps on the deck/overlay.
- **Derived-screen consistency** — 9+ surfaces have no reference; Slice 0 must publish explicit "system rules" (this doc's §2–§4) so derived screens stay on-language.
- **Asset expiry** — Figma MCP asset URLs live 7 days; export locally in Slice 0.
- **Test churn** across ~20 screens — budget per-slice snapshot/testID updates; never bypass the coverage gate.

---

## Next
`/sc:implement` **Slice 0** (tokens + fonts + assets) via codeagent → then slices 1–5 in order, each its own PR.
