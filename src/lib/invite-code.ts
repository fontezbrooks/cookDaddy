export const INVITE_BASE_URL = 'https://cookdaddy.app/invite/';

export function formatInviteCode(code: string): string {
  const normalized = code.toUpperCase();
  return normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

export function inviteLinkFor(code: string): string {
  return `${INVITE_BASE_URL}${code}`;
}

export function sanitizeCodeInput(raw: string): string {
  return normalizeCode(extractCodeSource(raw));
}

// Pull the invite code out of shared text before normalizing. The invite link
// (.../invite/<code>) is the most reliable anchor; the share message also labels
// the code as "code <formatted-code>". Anything else is treated as a directly
// typed/pasted code.
function extractCodeSource(raw: string): string {
  const link = raw.match(/invite\/([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})/i);
  if (link) return link[1] ?? raw;
  const labelled = raw.match(/code[\s:]+([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})\b/i);
  if (labelled) return labelled[1] ?? raw;
  return raw;
}

function normalizeCode(source: string): string {
  return source
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}
