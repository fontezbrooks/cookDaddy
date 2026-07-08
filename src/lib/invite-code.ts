export const INVITE_BASE_URL = 'https://cookdaddy.app/invite/';

export function formatInviteCode(code: string): string {
  const normalized = code.toUpperCase();
  return normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

export function inviteLinkFor(code: string): string {
  return `${INVITE_BASE_URL}${code}`;
}

export function sanitizeCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}
