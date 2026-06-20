import { mapClerkError } from '@/lib/auth/clerk-errors';

describe('mapClerkError', () => {
  it('maps form_identifier_exists to sign-in switch', () => {
    expect(mapClerkError({ errors: [{ code: 'form_identifier_exists' }] })).toEqual({
      message: 'That email already has an account.',
      switchTo: 'signin',
    });
  });

  it('maps form_identifier_not_found to sign-up switch', () => {
    expect(mapClerkError({ errors: [{ code: 'form_identifier_not_found' }] })).toEqual({
      message: 'No account for that email yet.',
      switchTo: 'signup',
    });
  });

  it('maps form_code_incorrect without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'form_code_incorrect' }] })).toEqual({
      message: "That code isn't right — check it and try again.",
    });
  });

  it('maps verification_expired without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'verification_expired' }] })).toEqual({
      message: 'That code expired. Tap Resend for a new one.',
    });
  });

  it('maps verification_failed without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'verification_failed' }] })).toEqual({
      message: "That code isn't right — check it and try again.",
    });
  });

  it('maps rate_limit_exceeded without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'rate_limit_exceeded' }] })).toEqual({
      message: 'Too many tries. Wait a moment and resend.',
    });
  });

  it('maps form_param_format_invalid without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'form_param_format_invalid' }] })).toEqual({
      message: 'Please enter a valid email address.',
    });
  });

  it('maps form_param_nil without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'form_param_nil' }] })).toEqual({
      message: 'Please enter a valid email address.',
    });
  });

  it('falls back to a generic message for a plain Error', () => {
    expect(mapClerkError(new Error('raw failure'))).toEqual({
      message: 'Something went wrong. Please try again.',
    });
  });

  it('falls back to a generic message for null and undefined', () => {
    expect(mapClerkError(null)).toEqual({ message: 'Something went wrong. Please try again.' });
    expect(mapClerkError(undefined)).toEqual({
      message: 'Something went wrong. Please try again.',
    });
  });

  it('uses longMessage when no code matches', () => {
    expect(
      mapClerkError({ errors: [{ code: 'unknown', longMessage: 'Use this detail.' }] }),
    ).toEqual({ message: 'Use this detail.' });
  });

  it('uses message when no code or longMessage matches', () => {
    expect(mapClerkError({ errors: [{ code: 'unknown', message: 'Short detail.' }] })).toEqual({
      message: 'Short detail.',
    });
  });

  it('maps top-level 429 status without switchTo', () => {
    expect(mapClerkError({ errors: [{ code: 'unknown' }], status: 429 })).toEqual({
      message: 'Too many tries. Wait a moment and resend.',
    });
  });
});
