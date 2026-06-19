// Design tokens generated from the pencil-MCP design pass (2026-05-23).
//
// Source of truth: the cookDaddy `.pen` file (pencil-new.pen, opened via
// `mcp__pencil__open_document`). Variables defined via set_variables; this
// TS file mirrors them for the React Native side. The shape is additive
// to constants/theme.ts — adopt incrementally per surface, do NOT clobber
// the legacy palette during the design pass.
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
    bg: { light: '#FFFFFF', dark: '#000000' },
    bgElevated: { light: '#F0F0F3', dark: '#1A1A1A' },
    bgCard: { light: '#111111', dark: '#1F1F22' },
    // Match-overlay backdrop scrim (70% black) — MATCH-UX §4.2.
    bgOverlayScrim: '#000000B3',
    textPrimary: { light: '#000000', dark: '#FFFFFF' },
    textSecondary: { light: '#60646C', dark: '#B0B4BA' },
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
    ink: { light: '#2A2521', dark: '#F5F4F2' },
    inkMuted: { light: '#5E5B55', dark: '#A8A39B' },
    canvas: { light: '#F6F6F8', dark: '#1C1916' },
    surface: { light: '#FFFFFF', dark: '#2A2622' },
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
    micro: 10,
    small: 12,
    body: 16,
    subtitle: 18,
    title: 24,
    display: 32,
  },

  fontFamily: {
    // Loaded via useFonts in app/_layout.tsx — see DESIGN.md §3
    sans: 'Inter',
    display: 'SpaceGrotesk_700Bold',
    displaySemibold: 'SpaceGrotesk_600SemiBold',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
    mono: 'JetBrainsMono_500Medium',
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
} as const;

// Convenience: resolve a themed color given a colorScheme. Caller is
// usually `useColorScheme()` from react-native, but this helper takes the
// scheme directly so it stays testable.
export type ColorScheme = 'light' | 'dark';
export type ThemedColor = { light: string; dark: string };

export function resolveThemedColor(value: string | ThemedColor, scheme: ColorScheme): string {
  return typeof value === 'string' ? value : value[scheme];
}
