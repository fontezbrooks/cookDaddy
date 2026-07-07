// Design tokens for the Warm Arcade Kitchen redesign.
//
// Source of truth: docs/REDESIGN/README.md. Legacy pencil/Arcade keys are
// retained for un-migrated screens and will be retired in later redesign
// slices.
//
// Naming convention:
//   • Themed colors expose { light, dark } — caller picks via useTheme.
//   • Unthemed colors are plain hex strings.
//   • Numeric tokens (space, radius, fontSize, motion) are plain numbers.
//   • Motion spring tokens map directly to Reanimated `withSpring` config.
//   • Motion timing tokens map directly to setTimeout / withTiming ms.
//
// All values trace back to docs/MATCH-UX/README.md (§3 timeline, §4
// motion, §8.1 card-edge flash, §8.2 dot row) or constants/theme.ts.

export const DesignTokens = {
  color: {
    // Intentional dark surface for the swipe-deck recipe card (forced dark in v1; see swipe-deck.tsx). NOT a general card bg — light cards use `surface`.
    swipeCardSurface: { light: '#111111', dark: '#1F1F22' },
    // Match-overlay backdrop scrim (70% black) — MATCH-UX §4.2.
    bgOverlayScrim: '#000000B3',
    // Locked colors for content sitting on dark surfaces (card, CTAs).
    textOnDark: '#FFFFFF',
    textOnLight: '#000000',
    // Card-edge flash + Like/Pass buttons — MATCH-UX §8.1.
    accentSuccess: '#16A34A',
    accentSuccessSoft: '#22C55E',
    accentDanger: '#7A1F1F',
    accentDangerSoft: '#B91C1C',
    // Confetti palette — MATCH-UX §4.3 (3 hues from design tokens).
    accentCelebration1: '#FF6B9D',
    accentCelebration2: '#FFC107',
    accentCelebration3: '#4ECDC4',
    borderMuted: { light: '#E0E1E6', dark: '#2E3135' },
    borderStrong: { light: '#60646C', dark: '#B0B4BA' },
    // Partner-progress dot row — MATCH-UX §8.2.
    dotEmptyBorder: '#666666',
    dotHalfFill: '#666666',
    dotFullFill: '#FFFFFF',
    // Arcade Kitchen redesign palette — see DESIGN.md
    persimmon: '#F1582E',
    persimmonDeep: '#CB4421',
    punchPink: '#FF4F87',
    poolTeal: '#3FC8BE',
    arcadeAmber: '#FFB627',
    spotlight: '#241F1B',
    inkOnDark: '#F5F4F2',
    successFresh: '#1FAE55',
    successDeep: '#15803D',
    dangerChili: '#E23A2C',
    dangerDeep: '#B00020', // AA-safe destructive fill with white label (~7.3:1); dangerChili is 4.31:1.
    ink: { light: '#1F1A1D', dark: '#F5F4F2' },
    inkMuted: { light: '#4F444A', dark: '#A8A39B' },
    canvas: { light: '#FFF8F9', dark: '#FFF8F9' },
    surface: { light: '#FFFFFF', dark: '#FFFFFF' },
    brand: { light: '#491E3D', dark: '#491E3D' },
    brandDeep: { light: '#300827', dark: '#300827' },
    accent: '#FF850B',
    accentPressBorder: '#412909',
    accentBorderAlt: '#311E09',
    onAccent: '#602E00',
    accentGlow: 'rgba(248,128,0,0.25)',
    inkBody: { light: '#4F444A', dark: '#4F444A' },
    inkPlaceholder: '#D3C2CA',
    badgeGradientStart: '#F88000',
    badgeGradientEnd: '#620B49',
    elevationTint: 'rgba(98,11,73,0.1)',
  },

  space: {
    half: 2,
    one: 4,
    two: 8,
    three: 16,
    four: 24,
    five: 32,
    six: 64,
  },

  radius: {
    sm: 4,
    md: 12,
    lg: 16,
    xl: 28,
    pill: 999,
  },

  fontSize: {
    display: 32,
  },

  fontFamily: {
    // Loaded via useFonts in app/_layout.tsx — see DESIGN.md §3
    sans: 'BeVietnamPro_400Regular',
    display: 'PlusJakartaSans_800ExtraBold',
    displaySemibold: 'PlusJakartaSans_700Bold',
    body: 'BeVietnamPro_400Regular',
    bodyMedium: 'BeVietnamPro_500Medium',
    bodySemibold: 'BeVietnamPro_600SemiBold',
    bodyBold: 'BeVietnamPro_700Bold',
    mono: 'JetBrainsMono_500Medium',
    jakartaSemibold: 'PlusJakartaSans_600SemiBold',
  },

  motion: {
    // Reanimated `withSpring` configs — MATCH-UX §4.1.
    springs: {
      card: { damping: 12, stiffness: 180, mass: 1 },
      text: { damping: 10, stiffness: 160, mass: 0.9 },
      avatar: { damping: 10, stiffness: 200, mass: 0.8 },
      cta: { damping: 14, stiffness: 200, mass: 1 },
      dismiss: { damping: 18, stiffness: 220, mass: 1 },
    },
    // Match-overlay sequence timings (ms from commit) — MATCH-UX §3.
    timings: {
      cardScaleUpMs: 280,
      cardFlipMs: 350,
      backdropMs: 280,
      flashEdgeMs: 200,
      revealFromCommitMs: 750,
      ctaTappableFromCommitMs: 1200,
      overlayAutoCloseMs: 2500,
      reducedMotionCrossfadeMs: 250,
    },
  },

  elevation: {
    card: {
      shadowColor: '#620B49',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 3,
    },
    buttonGlow: {
      shadowColor: '#F88000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 4,
    },
    nav: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 8,
    },
    appBar: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
  },
} as const;

// Convenience: resolve a themed color given a colorScheme. Caller is
// usually `useColorScheme()` from react-native, but this helper takes the
// scheme directly so it stays testable.
export type ColorScheme = 'light' | 'dark';
export type ThemedColor = { light: string; dark: string };

export function resolveThemedColor(value: string | ThemedColor, scheme: ColorScheme): string {
  return typeof value === 'string' ? value : value[scheme];
}
