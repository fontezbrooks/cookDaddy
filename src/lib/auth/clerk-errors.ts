export type ClerkErrorSwitch = 'signin' | 'signup';

export type ClerkErrorResult = { message: string; switchTo?: ClerkErrorSwitch };

type ClerkErrorDetail = {
  code?: string;
  message?: string;
  longMessage?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getFirstError(err: unknown): ClerkErrorDetail | undefined {
  if (!isRecord(err) || !Array.isArray(err.errors)) return undefined;
  const first = err.errors[0];
  return isRecord(first) ? first : undefined;
}

export function mapClerkError(err: unknown): ClerkErrorResult {
  const firstError = getFirstError(err);
  const code = typeof firstError?.code === 'string' ? firstError.code : undefined;
  const status = isRecord(err) && typeof err.status === 'number' ? err.status : undefined;

  switch (code) {
    case 'form_identifier_exists':
      return { message: 'That email already has an account.', switchTo: 'signin' };
    case 'form_identifier_not_found':
      return { message: 'No account for that email yet.', switchTo: 'signup' };
    case 'form_code_incorrect':
    case 'verification_failed':
      return { message: "That code isn't right — check it and try again." };
    case 'verification_expired':
      return { message: 'That code expired. Tap Resend for a new one.' };
    case 'rate_limit_exceeded':
      return { message: 'Too many tries. Wait a moment and resend.' };
    case 'form_param_format_invalid':
    case 'form_param_nil':
      return { message: 'Please enter a valid email address.' };
  }

  if (status === 429) return { message: 'Too many tries. Wait a moment and resend.' };
  if (typeof firstError?.longMessage === 'string') return { message: firstError.longMessage };
  if (typeof firstError?.message === 'string') return { message: firstError.message };

  return { message: 'Something went wrong. Please try again.' };
}
