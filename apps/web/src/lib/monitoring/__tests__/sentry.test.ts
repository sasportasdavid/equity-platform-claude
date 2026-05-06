import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  setLevel: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (cb: (scope: unknown) => unknown) => {
    const scope = {
      setTag: mocks.setTag,
      setUser: mocks.setUser,
      setLevel: mocks.setLevel,
    };
    return cb(scope);
  },
  captureException: mocks.captureException,
}));

import { captureServerError, withSentryServerAction } from '../sentry';

describe('lib/monitoring/sentry', () => {
  beforeEach(() => {
    mocks.captureException.mockReset();
    mocks.setTag.mockReset();
    mocks.setUser.mockReset();
    mocks.setLevel.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('captureServerError', () => {
    it('attaches server_action, org_id, route tags + user id', () => {
      const err = new Error('boom');
      captureServerError(err, {
        serverAction: 'inviteBeneficiary',
        orgId: 'org-123',
        userId: 'user-456',
        route: '/dashboard/beneficiaries',
      });

      expect(mocks.captureException).toHaveBeenCalledWith(err);
      expect(mocks.setTag).toHaveBeenCalledWith('server_action', 'inviteBeneficiary');
      expect(mocks.setTag).toHaveBeenCalledWith('org_id', 'org-123');
      expect(mocks.setTag).toHaveBeenCalledWith('route', '/dashboard/beneficiaries');
      expect(mocks.setUser).toHaveBeenCalledWith({ id: 'user-456' });
    });

    it('omits org_id/user/route when absent', () => {
      captureServerError(new Error('x'), { serverAction: 'foo' });

      expect(mocks.setTag).toHaveBeenCalledTimes(1);
      expect(mocks.setTag).toHaveBeenCalledWith('server_action', 'foo');
      expect(mocks.setUser).not.toHaveBeenCalled();
    });
  });

  describe('withSentryServerAction', () => {
    it('returns the wrapped fn result and tags the scope', async () => {
      const result = await withSentryServerAction(
        'computeFmv',
        async () => ({ ok: true as const, value: 42 }),
        { orgId: 'org-1' },
      );

      expect(result).toEqual({ ok: true, value: 42 });
      expect(mocks.setTag).toHaveBeenCalledWith('server_action', 'computeFmv');
      expect(mocks.setTag).toHaveBeenCalledWith('org_id', 'org-1');
      expect(mocks.captureException).not.toHaveBeenCalled();
    });

    it('captures and rethrows on error', async () => {
      const err = new Error('db down');

      await expect(
        withSentryServerAction('createPlan', async () => {
          throw err;
        }),
      ).rejects.toThrow('db down');

      expect(mocks.captureException).toHaveBeenCalledWith(err);
      expect(mocks.setTag).toHaveBeenCalledWith('server_action', 'createPlan');
    });
  });
});
