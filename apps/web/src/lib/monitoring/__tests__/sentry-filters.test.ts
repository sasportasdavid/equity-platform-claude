import { describe, expect, it } from 'vitest';
import { shouldIgnoreSentryError } from '../sentry-filters';

describe('shouldIgnoreSentryError', () => {
  it('ignores Next.js redirect throw', () => {
    expect(shouldIgnoreSentryError(new Error('NEXT_REDIRECT;replace;/login'))).toBe(true);
  });

  it('ignores Next.js notFound throw', () => {
    expect(shouldIgnoreSentryError(new Error('NEXT_NOT_FOUND'))).toBe(true);
  });

  it('ignores AuthSessionMissingError from Supabase', () => {
    const err = new Error('AuthSessionMissingError: Auth session missing!');
    err.name = 'AuthSessionMissingError';
    expect(shouldIgnoreSentryError(err)).toBe(true);
  });

  it('does NOT ignore arbitrary application errors', () => {
    expect(shouldIgnoreSentryError(new Error('createPlan failed: pool exceeded'))).toBe(false);
  });

  it('handles non-Error values gracefully', () => {
    expect(shouldIgnoreSentryError('NEXT_REDIRECT')).toBe(true);
    expect(shouldIgnoreSentryError('something else')).toBe(false);
    expect(shouldIgnoreSentryError(null)).toBe(false);
    expect(shouldIgnoreSentryError(undefined)).toBe(false);
  });
});
