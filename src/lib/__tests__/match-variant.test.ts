/**
 * Match-variant detection (P8 Slice 4) per MATCH-UX §7.
 *
 * Pure function so the test surface is deterministic and the variant
 * priority (firstEver > lastCard > firstOfSession > speedy > standard) is locked in.
 */

import {
  determineMatchVariant,
  MATCH_VARIANT_CONFIG,
  SPEEDY_THRESHOLD_MS,
  type MatchVariantContext,
} from '@/lib/match-variant';

function ctx(overrides: Partial<MatchVariantContext> = {}): MatchVariantContext {
  return {
    matchesInSessionBeforeThis: 1, // not first
    cardIndex: 3, // not last
    deckSize: 10,
    lastLocalCommitAt: 1_000_000,
    lastPartnerCommitAt: 1_000_000 - SPEEDY_THRESHOLD_MS - 1, // not speedy
    ...overrides,
  };
}

describe('determineMatchVariant', () => {
  it('returns "standard" when no special condition applies', () => {
    expect(determineMatchVariant(ctx())).toBe('standard');
  });

  it('returns "firstOfSession" when this is the first match of the session', () => {
    expect(determineMatchVariant(ctx({ matchesInSessionBeforeThis: 0 }))).toBe('firstOfSession');
  });

  it('returns "firstEver" when the pod has no prior matches and this is session match #1', () => {
    expect(
      determineMatchVariant(ctx({ podHasPriorMatches: false, matchesInSessionBeforeThis: 0 })),
    ).toBe('firstEver');
  });

  it('does not return "firstEver" when the pod has prior matches', () => {
    expect(
      determineMatchVariant(ctx({ podHasPriorMatches: true, matchesInSessionBeforeThis: 0 })),
    ).toBe('firstOfSession');
  });

  it('does not return "firstEver" when podHasPriorMatches is omitted', () => {
    expect(determineMatchVariant(ctx({ matchesInSessionBeforeThis: 0 }))).toBe('firstOfSession');
  });

  it('does not return "firstEver" on the second match of a no-prior-match pod session', () => {
    expect(
      determineMatchVariant(
        ctx({
          podHasPriorMatches: false,
          matchesInSessionBeforeThis: 1,
          lastLocalCommitAt: 1_000_000,
          lastPartnerCommitAt: 1_000_000,
        }),
      ),
    ).toBe('speedy');
  });

  it('returns "lastCard" when the match lands on the deck\'s final card', () => {
    expect(determineMatchVariant(ctx({ cardIndex: 9, deckSize: 10 }))).toBe('lastCard');
  });

  it('returns "speedy" when local + partner commits are within the threshold', () => {
    expect(
      determineMatchVariant(
        ctx({
          lastLocalCommitAt: 1_000_000,
          lastPartnerCommitAt: 1_000_000 - SPEEDY_THRESHOLD_MS + 1,
        }),
      ),
    ).toBe('speedy');
  });

  it('does not return "speedy" when delta exceeds the threshold by 1ms', () => {
    expect(
      determineMatchVariant(
        ctx({
          lastLocalCommitAt: 1_000_000,
          lastPartnerCommitAt: 1_000_000 - SPEEDY_THRESHOLD_MS - 1,
        }),
      ),
    ).toBe('standard');
  });

  it('treats partner commits ahead of the local commit symmetrically', () => {
    // Partner clock can lead the local clock if their broadcast lands
    // before the local commitMutation onSuccess fires.
    expect(
      determineMatchVariant(
        ctx({
          lastLocalCommitAt: 1_000_000,
          lastPartnerCommitAt: 1_000_000 + 500,
        }),
      ),
    ).toBe('speedy');
  });

  it('does not return "speedy" when either timestamp is null', () => {
    expect(
      determineMatchVariant(ctx({ lastLocalCommitAt: null, lastPartnerCommitAt: 1_000_000 })),
    ).toBe('standard');
    expect(
      determineMatchVariant(ctx({ lastLocalCommitAt: 1_000_000, lastPartnerCommitAt: null })),
    ).toBe('standard');
  });

  it('prioritises lastCard over firstOfSession when both would apply', () => {
    expect(
      determineMatchVariant(ctx({ matchesInSessionBeforeThis: 0, cardIndex: 9, deckSize: 10 })),
    ).toBe('lastCard');
  });

  it('prioritises firstEver over lastCard and firstOfSession when applicable', () => {
    expect(
      determineMatchVariant(
        ctx({
          podHasPriorMatches: false,
          matchesInSessionBeforeThis: 0,
          cardIndex: 9,
          deckSize: 10,
        }),
      ),
    ).toBe('firstEver');
  });

  it('prioritises firstOfSession over speedy when both would apply', () => {
    expect(
      determineMatchVariant(
        ctx({
          matchesInSessionBeforeThis: 0,
          lastLocalCommitAt: 1_000_000,
          lastPartnerCommitAt: 1_000_000,
        }),
      ),
    ).toBe('firstOfSession');
  });

  it('handles a one-card deck (deckSize = 1) — that one card is the last card', () => {
    expect(determineMatchVariant(ctx({ cardIndex: 0, deckSize: 1 }))).toBe('lastCard');
  });

  it('handles an empty deck defensively (deckSize = 0) → no lastCard collapse', () => {
    // deckSize 0 should never reach this code path in practice, but the
    // function must not crash; falls through to firstOfSession / speedy /
    // standard based on the other inputs.
    expect(
      determineMatchVariant(ctx({ cardIndex: 0, deckSize: 0, matchesInSessionBeforeThis: 0 })),
    ).toBe('firstOfSession');
  });
});

describe('MATCH_VARIANT_CONFIG', () => {
  it('exposes a config entry for every MatchVariant value', () => {
    const variants = ['standard', 'firstOfSession', 'firstEver', 'lastCard', 'speedy'] as const;
    for (const v of variants) {
      expect(MATCH_VARIANT_CONFIG[v]).toBeDefined();
      expect(typeof MATCH_VARIANT_CONFIG[v].heading).toBe('string');
      expect(MATCH_VARIANT_CONFIG[v].heading.length).toBeGreaterThan(0);
    }
  });

  it('only the speedy variant carries a badge', () => {
    expect(MATCH_VARIANT_CONFIG.speedy.badge).toMatch(/Same wavelength/i);
    expect(MATCH_VARIANT_CONFIG.standard.badge).toBeNull();
    expect(MATCH_VARIANT_CONFIG.firstOfSession.badge).toBeNull();
    expect(MATCH_VARIANT_CONFIG.firstEver.badge).toBeNull();
    expect(MATCH_VARIANT_CONFIG.lastCard.badge).toBeNull();
  });

  it('firstOfSession bumps confetti density by +20% per MATCH-UX §7', () => {
    expect(MATCH_VARIANT_CONFIG.firstOfSession.confettiDensity).toBeCloseTo(1.2);
    expect(MATCH_VARIANT_CONFIG.standard.confettiDensity).toBe(1.0);
  });

  it('firstEver uses MATCH-UX §7 copy, density, and 3.0s auto-close', () => {
    expect(MATCH_VARIANT_CONFIG.firstEver.heading).toBe(
      'Your first match. Welcome to the cookbook.',
    );
    expect(MATCH_VARIANT_CONFIG.firstEver.confettiDensity).toBeCloseTo(1.5);
    expect(MATCH_VARIANT_CONFIG.firstEver.autoCloseMs).toBe(3000);
  });

  it('does not set variant auto-close overrides for existing variants', () => {
    expect(MATCH_VARIANT_CONFIG.standard.autoCloseMs).toBeUndefined();
    expect(MATCH_VARIANT_CONFIG.firstOfSession.autoCloseMs).toBeUndefined();
    expect(MATCH_VARIANT_CONFIG.lastCard.autoCloseMs).toBeUndefined();
    expect(MATCH_VARIANT_CONFIG.speedy.autoCloseMs).toBeUndefined();
  });
});
