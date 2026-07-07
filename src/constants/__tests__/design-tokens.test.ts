/**
 * Design tokens contract (pencil-MCP design pass, 2026-05-23).
 *
 * These tests pin the *values* that ship with v1 so a token drift PR
 * has to face them. Anchors:
 *   • MATCH-UX §3 timing budget
 *   • MATCH-UX §4.1 spring profiles
 *   • MATCH-UX §8.1 card-edge flash colors
 *   • MATCH-UX §8.2 dot-row fill colors
 */

import { DesignTokens, resolveThemedColor } from '@/constants/design-tokens';

describe('DesignTokens', () => {
  it('exposes the card-edge flash colors that swipe-deck currently hard-codes (MATCH-UX §8.1)', () => {
    expect(DesignTokens.color.accentSuccess).toBe('#16A34A');
    expect(DesignTokens.color.accentDanger).toBe('#7A1F1F');
  });

  it('exposes three distinct confetti hues per MATCH-UX §4.3', () => {
    const hues = new Set([
      DesignTokens.color.accentCelebration1,
      DesignTokens.color.accentCelebration2,
      DesignTokens.color.accentCelebration3,
    ]);
    expect(hues.size).toBe(3);
  });

  it('exposes the Arcade Kitchen brand palette (DESIGN.md)', () => {
    expect(DesignTokens.color.persimmon).toBe('#F1582E');
    expect(DesignTokens.color.spotlight).toBe('#241F1B');
    expect(DesignTokens.color.punchPink).toBe('#FF4F87');
    expect(DesignTokens.color.successFresh).toBe('#1FAE55');
    expect(DesignTokens.color.successDeep).toBe('#15803D');
    expect(DesignTokens.color.dangerDeep).toBe('#B00020');
    expect(DesignTokens.color.ink).toEqual({ light: '#1F1A1D', dark: '#F5F4F2' });
  });

  it('exposes the Warm Arcade Kitchen redesign tokens', () => {
    expect(DesignTokens.color.brand.light).toBe('#491E3D');
    expect(DesignTokens.color.brandDeep.light).toBe('#300827');
    expect(DesignTokens.color.accent).toBe('#FF850B');
    expect(DesignTokens.color.onAccent).toBe('#602E00');
    expect(DesignTokens.color.accentPressBorder).toBe('#412909');
    expect(DesignTokens.color.surface.light).toBe('#FFFFFF');
  });

  it('exposes the Warm Arcade Kitchen font families', () => {
    expect(DesignTokens.fontFamily.display).toBe('PlusJakartaSans_800ExtraBold');
    expect(DesignTokens.fontFamily.body).toBe('BeVietnamPro_400Regular');
  });

  it('preserves the match-overlay timing budget (MATCH-UX §3)', () => {
    const t = DesignTokens.motion.timings;
    expect(t.backdropMs).toBe(280);
    expect(t.cardScaleUpMs).toBe(280);
    expect(t.cardFlipMs).toBe(350);
    expect(t.revealFromCommitMs).toBe(750);
    expect(t.ctaTappableFromCommitMs).toBe(1200);
    expect(t.overlayAutoCloseMs).toBe(2500);
    expect(t.flashEdgeMs).toBe(200);
    expect(t.reducedMotionCrossfadeMs).toBe(250);
  });

  it('preserves the spring damping/stiffness/mass triplets from MATCH-UX §4.1', () => {
    const s = DesignTokens.motion.springs;
    expect(s.card).toEqual({ damping: 12, stiffness: 180, mass: 1 });
    expect(s.text).toEqual({ damping: 10, stiffness: 160, mass: 0.9 });
    expect(s.avatar).toEqual({ damping: 10, stiffness: 200, mass: 0.8 });
    expect(s.cta).toEqual({ damping: 14, stiffness: 200, mass: 1 });
    expect(s.dismiss).toEqual({ damping: 18, stiffness: 220, mass: 1 });
  });

  it('keeps Spacing scale identical to constants/theme.ts so adoption is mechanical', () => {
    const sp = DesignTokens.space;
    expect(sp.half).toBe(2);
    expect(sp.one).toBe(4);
    expect(sp.two).toBe(8);
    expect(sp.three).toBe(16);
    expect(sp.four).toBe(24);
    expect(sp.five).toBe(32);
    expect(sp.six).toBe(64);
  });

  it('exposes themed colors with both light and dark variants', () => {
    expect(DesignTokens.color.canvas).toEqual({ light: '#FFF8F9', dark: '#FFF8F9' });
  });
});

describe('resolveThemedColor', () => {
  it('passes a plain hex string through unchanged', () => {
    expect(resolveThemedColor('#16A34A', 'light')).toBe('#16A34A');
    expect(resolveThemedColor('#16A34A', 'dark')).toBe('#16A34A');
  });

  it('picks the matching variant from a themed color object', () => {
    expect(resolveThemedColor(DesignTokens.color.canvas, 'light')).toBe('#FFF8F9');
    expect(resolveThemedColor(DesignTokens.color.canvas, 'dark')).toBe('#FFF8F9');
  });
});
