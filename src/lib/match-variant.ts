// Match-variant detection (P8 Slice 4) per MATCH-UX §7.
//
// Five overlay variants in the spec: standard / firstOfSession /
// firstEver / speedy / lastCard. This module ships four — firstEver
// requires a one-time supabase count query against the pod's matches
// history and lands when the rest of the session ergonomics are in.
//
// The streak indicator from §7 is NOT an overlay variant — it surfaces
// on the deck (a small "🔥 streak" above the next card), so its detection
// + rendering will live alongside SwipeDeck, not here.
//
// Priority (when multiple variants would match): lastCard > firstOfSession
// > speedy > standard. The most narrative-impactful variant wins because
// the overlay can only display one copy line at a time.

export type MatchVariant = 'standard' | 'firstOfSession' | 'lastCard' | 'speedy';

export type MatchVariantContext = {
  // How many matches have already fired in THIS session before the
  // current one. Zero means the current match is the first of the session.
  matchesInSessionBeforeThis: number;
  // 0-based index of the card the match landed on.
  cardIndex: number;
  // Total cards in the session's deck.
  deckSize: number;
  // Timestamp of the local user's most recent commit (Date.now()). May
  // be null if no commits have happened yet (defensive — shouldn't
  // happen at match-time since a match requires a local commit).
  lastLocalCommitAt: number | null;
  // Timestamp of the partner's most recent commit broadcast (Date.now()
  // at the moment the broadcast arrived). May be null if the partner
  // hasn't swiped yet or the broadcast hasn't landed.
  lastPartnerCommitAt: number | null;
};

// Speedy threshold per MATCH-UX §7: both swiped within 1500ms of each other.
export const SPEEDY_THRESHOLD_MS = 1500;

export function determineMatchVariant(ctx: MatchVariantContext): MatchVariant {
  // lastCard wins — "Came down to the wire!" is the most narrative
  // moment and overrides everything else.
  if (ctx.deckSize > 0 && ctx.cardIndex === ctx.deckSize - 1) return 'lastCard';

  // firstOfSession is the next-most-impactful — the first match of the
  // night deserves its own copy regardless of timing.
  if (ctx.matchesInSessionBeforeThis === 0) return 'firstOfSession';

  // speedy: both partners committed within SPEEDY_THRESHOLD_MS of each other.
  if (ctx.lastLocalCommitAt != null && ctx.lastPartnerCommitAt != null) {
    const delta = Math.abs(ctx.lastLocalCommitAt - ctx.lastPartnerCommitAt);
    if (delta <= SPEEDY_THRESHOLD_MS) return 'speedy';
  }

  return 'standard';
}

// Per-variant configuration consumed by MatchOverlay. Keeping all the
// copy + style knobs in one place so adding a new variant is a single-
// site change, not a hunt through the JSX.
export type MatchVariantConfig = {
  // Primary heading shown above the recipe title.
  heading: string;
  // Optional tag/badge rendered beneath the title for variants that
  // need a secondary callout (e.g. speedy gets "Same wavelength 🧠").
  badge: string | null;
  // Confetti particle count multiplier vs CONFETTI_PARTICLE_COUNT
  // (1.0 = default). MATCH-UX §7 specifies +20% for firstOfSession.
  confettiDensity: number;
};

export const MATCH_VARIANT_CONFIG: Record<MatchVariant, MatchVariantConfig> = {
  standard: {
    heading: 'It’s a match!',
    badge: null,
    confettiDensity: 1.0,
  },
  firstOfSession: {
    heading: 'First match of the night!',
    badge: null,
    confettiDensity: 1.2,
  },
  lastCard: {
    heading: 'Came down to the wire!',
    badge: null,
    confettiDensity: 1.0,
  },
  speedy: {
    heading: 'It’s a match!',
    badge: 'Same wavelength 🧠',
    confettiDensity: 1.0,
  },
};
