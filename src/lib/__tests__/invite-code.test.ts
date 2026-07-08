import { formatInviteCode, inviteLinkFor, sanitizeCodeInput } from '@/lib/invite-code';

describe('invite-code', () => {
  it('formats 8-character pod codes into display groups', () => {
    expect(formatInviteCode('A2FGH4K9')).toBe('A2FG-H4K9');
  });

  it('returns non-8-length input uppercased as-is', () => {
    expect(formatInviteCode('abc123')).toBe('ABC123');
  });

  it('builds invite links', () => {
    expect(inviteLinkFor('A2FGH4K9')).toBe('https://cookdaddy.app/invite/A2FGH4K9');
  });

  it('sanitizes typed input toward the canonical code', () => {
    expect(sanitizeCodeInput('a2-fg h4k9zz')).toBe('A2FGH4K9');
  });
});
