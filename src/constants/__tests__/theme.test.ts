import { DesignTokens } from '@/constants/design-tokens';
import { Colors } from '@/constants/theme';

describe('theme palette', () => {
  it('light primary text is Ink', () => {
    expect(Colors.light.text).toBe(DesignTokens.color.ink.light);
  });

  it('light secondary text is Ink-Muted', () => {
    expect(Colors.light.textSecondary).toBe(DesignTokens.color.inkMuted.light);
  });

  it('dark primary text is Ink-on-Dark', () => {
    expect(Colors.dark.text).toBe(DesignTokens.color.ink.dark);
  });

  it('dark secondary text is Ink-Muted-Dark', () => {
    expect(Colors.dark.textSecondary).toBe(DesignTokens.color.inkMuted.dark);
  });
});
