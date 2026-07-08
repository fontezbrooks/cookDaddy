# Dependency Diet — remove MMKV(Nitro) + Sentry(ReachabilitySwift)

Status: **DESIGN (approved decisions, not yet implemented).** Phase 3 of the troubleshooting spike.
Prereq: PR #23 + #24 merged. Next: `/sc:implement`.

## Why (bedrock)

The physical-device build fails for two self-inflicted reasons, neither a platform constraint:

- **NitroModules crash** (`Failed to get NitroModules` at `state/mmkv.ts:8`) comes entirely from
  **`react-native-mmkv@4`**, which was rewritten onto the Nitro native runtime.
- **ReachabilitySwift 5.2.4 build failure** is a *transitive* pod: `@sentry/react-native` → `RNSentry`
  → `Sentry 9.19.1` → `ReachabilitySwift` (confirmed in `ios/Podfile.lock`). Not a direct dep.

Proof it's optional: the user's `TheSouthernShmooze` app is the **same platform** (Expo SDK 56 / RN 0.85.3)
and builds on device; `parkDaddy` + `gulch_stuff` too. None use MMKV, Nitro, or Sentry; all persist with
`expo-secure-store`. This migration aligns cookDaddy with that proven stack. **It is pure subtraction** —
both replacements (`expo-secure-store`, `posthog-react-native`) are already installed.

## Decisions (locked, via AskUserQuestion)

| # | Decision |
|---|---|
| D1 | Zustand persistence → **`expo-secure-store`** (already installed; encrypted Keychain/Keystore) |
| D2 | Error tracking → **remove `@sentry/react-native`, use PostHog** (already installed) |

## Current-state map (what references what)

**MMKV — two independent usages:**
- `src/state/mmkv.ts` → `createMmkvStorage(id): StateStorage` — the Zustand persist adapter.
  Consumers (all via `createJSONStorage`): `useSettingsStore` (`settings-store`), `useAuthStore`
  (`auth-store`), `useOnboardingStore` (`onboarding-store`), `usePushPrimingStore` (`push-priming-store`).
  **Async-safe** — `StateStorage` methods may return Promises; `persist.rehydrate()` already returns a Promise.
- `src/lib/swipe-queue.ts` → its **own** `createMMKV` instance, read/written **synchronously**
  (`getString`/`set`/`remove`) behind sync exports (`enqueueSwipe`, `peekSwipeQueue`,
  `removeFromSwipeQueue`, `clearSwipeQueue`). **This is the async gotcha** — it cannot move to
  async secure-store without rippling `async` through every SwipeDeck caller.

**Sentry — references:** `src/app/_layout.tsx` (`init` + `Sentry.wrap` export + `sentryDsn` extra),
`src/components/match-overlay.tsx` (`startInactiveSpan` perf marker), `app.config.ts`
(`extra.sentryDsn`), `package.json` (`@sentry/react-native`), `pnpm-workspace.yaml`
(`allowBuilds: '@sentry/cli': true`), `jest.setup.js` (mock), tests (`_layout.test.tsx`,
`match-overlay` test span assertions).

**PostHog:** `posthog-react-native@4.54.4` — exports `captureException(error, props?, hint?)`,
`PostHogErrorBoundary`, and an `error-tracking` module. `PostHogProvider` already always-mounted in
`_layout.tsx` (disabled/inert when no key).

---

## Design

### A. Persistence adapter → secure-store (drop-in)

Replace `src/state/mmkv.ts` with `src/state/persistent-storage.ts` (rename for honesty — the file is a
lie once MMKV is gone):

```ts
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

// Zustand persist adapter backed by expo-secure-store (encrypted Keychain /
// Keystore). Async, which matches how persist already rehydrates. The store's
// `persist.name` becomes the SecureStore key — valid chars [A-Za-z0-9._-],
// value < 2KB. All persisted slices here are tiny flags / profile fields.
export function createPersistentStorage(): StateStorage {
  return {
    getItem: (name) => SecureStore.getItemAsync(name),
    setItem: (name, value) => SecureStore.setItemAsync(name, value),
    removeItem: (name) => SecureStore.deleteItemAsync(name),
  };
}
```

The old adapter namespaced MMKV *instances* by `id`; secure-store is one flat keystore keyed by the
persist `name` (all four names are unique), so the `id` param is dropped. Each store changes one line:

```diff
- import { createMmkvStorage } from './mmkv';
+ import { createPersistentStorage } from './persistent-storage';
...
-      storage: createJSONStorage(() => createMmkvStorage('cookdaddy-settings')),
+      storage: createJSONStorage(() => createPersistentStorage()),
```

Keys used: `settings-store`, `auth-store`, `onboarding-store`, `push-priming-store` — all charset-valid,
all well under 2KB (4 bools / a few profile strings / a flag). No `partialize`/`onRehydrateStorage`
changes. `__reset*ForTests` helpers keep working (still `setState` + `rehydrate`).

**No data migration.** Existing MMKV data is not read; on first launch after the update the four stores
start empty → defaults (settings reset to defaults, onboarding flag lost so onboarding re-shows once, auth
cache empty → one network fill). **Accepted: cookDaddy is pre-launch (no production users).**

### B. swipe-queue → in-memory (keep the sync API)

`swipe-queue` is a **transient retry buffer**, not user data. Its stated durability requirement (header
comment / NFR-R1) is to survive a **network blip + a component remount** — both in-process events. It
drains on the next successful commit or on mount. Full-app-kill durability was never required.

Replace the MMKV instance with a module-level `Map`, preserving **every** export signature (all stay
synchronous → zero caller/SwipeDeck changes):

```ts
const queues = new Map<string, SwipeQueueItem[]>();
// readQueue/writeQueue operate on the Map; writeQueue deletes the key when empty.
```

Add `export function __resetSwipeQueueForTests() { queues.clear(); }` for test isolation (replaces the
MMKV-mock reset the tests currently lean on).

**Trade-off (documented):** pending retries are lost if the OS terminates the app mid-session. Acceptable —
the swipes can be re-done and `submit_swipe` is idempotent server-side (UNIQUE `(session_id, recipe_id)`).
The Map survives component unmount/remount (same JS runtime), which is the actual requirement.

> Alternative rejected: moving swipe-queue to secure-store/async-storage would force `async` through
> `enqueueSwipe`/`peek`/`remove` and every SwipeDeck call site — large ripple for durability the feature
> doesn't need.

### C. Remove Sentry

- **`src/app/_layout.tsx`:** drop `import * as Sentry`, the `Sentry.init({...})` block, and
  `Sentry.wrap` — `export default RootLayout` (wrapped per §D). Remove `sentryDsn` from the `AppExtra`
  type and `extra` read.
- **`src/components/match-overlay.tsx`:** drop `import * as Sentry` and the `startInactiveSpan(...).end()`
  span. PostHog is not an APM; the ≤100ms first-frame *span* is not replicated. (Optional, out-of-scope:
  a `posthog.capture('match_overlay_first_frame', { ms })` timing event if we still want the metric.)
- **`app.config.ts`:** remove `sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN` from `extra`.
- **`package.json`:** remove `@sentry/react-native`.
- **`pnpm-workspace.yaml`:** remove `'@sentry/cli': true` from `allowBuilds`.
- **Env (non-code):** stop setting `EXPO_PUBLIC_SENTRY_DSN` (`.env`, EAS secrets).

### D. PostHog error tracking (replaces Sentry.wrap)

Wrap the tree in `PostHogErrorBoundary` (must live **inside** `PostHogProvider` — it needs the client),
and enable exception autocapture on the provider when a key is present:

```tsx
return (
  <PostHogProvider
    apiKey={posthogKey || 'phc_disabled_local_dev'}
    autocapture={false}
    options={posthogKey ? { enableExceptionAutocapture: true } : { disabled: true }}
  >
    <PostHogErrorBoundary>{tree}</PostHogErrorBoundary>
  </PostHogProvider>
);
export default RootLayout;   // no more Sentry.wrap
```

- `PostHogErrorBoundary` catches render errors (the role `Sentry.wrap` played).
- `enableExceptionAutocapture` covers unhandled JS exceptions. **Implementer must confirm the exact
  option name in `posthog-react-native@4.54.4`'s `PostHogOptions`** (the `error-tracking` module implies
  it; if the flag differs or is absent, fall back to an `ErrorUtils.setGlobalHandler` that calls the
  posthog singleton's `captureException`).
- No-key path stays fully inert (`disabled: true`), so CI/dev emit nothing.

### E. Native purge

1. Remove `react-native-mmkv` + `react-native-nitro-modules` from `package.json` (the `0.35.10` nitro pin
   goes with it).
2. `pnpm install` → lockfile drops both + their transitive Nitro graph.
3. `npx expo prebuild --clean` → regenerate `ios/` (and `android/` if present).
4. **Verify** `ios/Podfile.lock` no longer contains `NitroModules`, `MMKV`, `RNSentry`, `Sentry`, or
   `ReachabilitySwift`.

### F. Tests & mocks

- Delete `__mocks__/react-native-mmkv.js` (nothing imports mmkv anymore).
- Remove the `@sentry/react-native` mock block from `jest.setup.js`.
- The **`expo-secure-store` mock already exists** in `jest.setup.js` (in-memory Map, used by Clerk token
  cache) — the four stores now ride it. **Verify test isolation:** add a global `beforeEach` (or reset in
  each `__reset*ForTests`) that clears the secure-store mock's Map, mirroring what the MMKV mock provided,
  so a persisted value from one test doesn't rehydrate into the next.
- `swipe-queue.test.ts`: call `__resetSwipeQueueForTests()` in `beforeEach` (was relying on the mmkv mock).
- `match-overlay` test: drop the `startInactiveSpan().end()` assertions.
- `_layout.test.tsx`: drop any Sentry assertions; ensure it still renders under the (now error-boundary-
  wrapped) provider tree.

---

## File-by-file change table

| File | Change |
|---|---|
| `src/state/mmkv.ts` | **Rename** → `src/state/persistent-storage.ts`; secure-store adapter; export `createPersistentStorage()` |
| `src/state/useSettingsStore.ts` | swap import + `createPersistentStorage()` |
| `src/state/useAuthStore.ts` | swap import + `createPersistentStorage()` |
| `src/state/useOnboardingStore.ts` | swap import + `createPersistentStorage()` |
| `src/state/usePushPrimingStore.ts` | swap import + `createPersistentStorage()` |
| `src/lib/swipe-queue.ts` | MMKV → in-memory `Map`; add `__resetSwipeQueueForTests` |
| `src/app/_layout.tsx` | remove Sentry init/wrap/extra; `PostHogErrorBoundary` + autocapture |
| `src/components/match-overlay.tsx` | remove Sentry span |
| `app.config.ts` | remove `sentryDsn` extra |
| `package.json` | remove `@sentry/react-native`, `react-native-mmkv`, `react-native-nitro-modules` |
| `pnpm-workspace.yaml` | remove `'@sentry/cli': true` |
| `jest.setup.js` | remove sentry mock; ensure secure-store mock reset |
| `__mocks__/react-native-mmkv.js` | **delete** |
| tests | update swipe-queue / match-overlay / _layout as above |
| `ios/` | regenerated via `prebuild --clean` |

## Sequencing

1. **A + B** (storage): add `persistent-storage.ts`, rewire 4 stores, rewrite swipe-queue → run jest (stores + swipe-queue green).
2. **C + D** (Sentry→PostHog): edit `_layout.tsx`, `match-overlay.tsx`, `app.config.ts`, tests → run jest.
3. **F** (mocks): delete mmkv mock, drop sentry mock, secure-store reset → full jest green.
4. **E** (native): remove deps → `pnpm install` → `expo prebuild --clean` → grep Podfile.lock clean.
5. Device build (per prior troubleshoot: fix `eas.json` device profile *or* `expo run:ios --device`) → app boots on phone.

## Acceptance criteria

- `package.json` + `ios/Podfile.lock` contain **no** mmkv, nitro-modules, Sentry, or ReachabilitySwift.
- `tsc --noEmit` clean; `eslint src/` clean; full jest suite green.
- App boots on a **physical device** (no NitroModules error).
- Persisted state survives restart: settings toggles, onboarding-seen, auth-cache, push-priming.
- Unhandled render errors and JS exceptions land in PostHog (with a key).
- The nitro version pin and the abandoned ReachabilitySwift `post_install` plugin are gone as dead scaffolding.

## Risks & open items

- **PostHog autocapture option name** — verify in `posthog-react-native@4.54.4`; fall back to `ErrorUtils`
  global handler if absent (§D).
- **Store test isolation** under the shared secure-store mock — verify reset (§F).
- **SecureStore 2KB/value limit** — re-confirm `auth-store` (avatarUrl) stays small; if ever large, that
  one store can use `@react-native-async-storage/async-storage` instead (secure-store for the rest).
- **Lost APM span** in match-overlay — accepted; optional analytics timing event if the metric matters.
- **First-launch reset** of persisted stores — accepted (pre-launch, no production users).

## Out of scope

- Device build mechanics (EAS device profile vs local `run:ios --device`) — tracked in the prior
  `/sc:troubleshoot` finding; do after this diet lands.
- Rotating `app.pod_invite_secret` (separate pre-launch HIGH).
- Re-adding any error-tracking span/APM parity beyond crash capture.
