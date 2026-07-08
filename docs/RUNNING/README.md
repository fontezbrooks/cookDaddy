# Running the app

## Use a development build — Expo Go is not supported

This app **cannot run in Expo Go** and never will. It depends on native modules that
Expo Go does not ship:

- **`react-native-mmkv` (v4)** — a native TurboModule built on `react-native-nitro-modules`.
  Launching under Expo Go crashes immediately with
  `Failed to get NitroModules: The native "NitroModules" Turbo/Native-Module could not be found`
  (call chain: `mmkv.ts` → `useSettingsStore.ts` → `use-reduced-motion.ts` → `tab-bar-icon.tsx`).
- Additional native modules (`@shopify/react-native-skia`, `expo-blur`, `@sentry/react-native`,
  `react-native-reanimated` v4) also require a compiled binary.

Expo Go only contains the fixed set of native modules baked into the Expo SDK, so a
third-party TurboModule like MMKV can't be loaded at runtime. This is a structural
constraint, not a configuration bug.

## How to run

Use a **development build** (Expo Dev Client):

```bash
# One-time / after native dependency changes — regenerate native projects:
npx expo prebuild

# Build + install the dev client on a simulator or device:
npx expo run:ios      # or: npx expo run:android
#   (or install an EAS dev-client build, then `npx expo start --dev-client`)

# Start Metro for an already-installed dev client:
npx expo start --dev-client
```

If your physical device does not see the dev server on the LAN, start Metro with a tunnel:

```bash
npx expo start --dev-client --tunnel
```

## Rebuild after native dependency changes

Any change to a native dependency (versions in `package.json` for modules with native
code, e.g. `react-native-nitro-modules`, `expo-blur`) requires a **rebuild of the dev
client** — a Metro reload is not enough. Symptoms of a stale binary:

- `The native Nitro Modules core runtime version is X, but the JS code is using version Y`
- `Unable to get the view config for ExpoBlurView from module ExpoBlur` (faint text behind headers)

Fix: `npx expo prebuild` then `npx expo run:ios` / `run:android` to recompile.
