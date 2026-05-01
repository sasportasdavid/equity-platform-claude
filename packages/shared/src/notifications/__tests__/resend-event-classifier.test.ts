import { describe, expect, it } from 'vitest';
import { classifyResendEvent } from '../resend-event-classifier';

/**
 * Module 7 B4 — Tests sur le classifier Resend events.
 *
 * Le classifier est dupliqué dans la EF resend-webhook (Deno standalone).
 * Si on modifie ici, tenir l'EF en sync (~30 lignes).
 */

describe('classifyResendEvent — apply path', () => {
  it('email.delivered → DELIVERED + delivered_at depuis eventData.created_at', () => {
    const r = classifyResendEvent('email.delivered', {
      created_at: '2026-05-01T10:30:00.000Z',
    });
    expect(r).toEqual({
      kind: 'apply',
      updates: {
        status: 'DELIVERED',
        delivered_at: '2026-05-01T10:30:00.000Z',
      },
    });
  });

  it('email.delivered sans created_at → fallback now()', () => {
    const r = classifyResendEvent('email.delivered', null);
    expect(r.kind).toBe('apply');
    if (r.kind === 'apply') {
      expect(r.updates.status).toBe('DELIVERED');
      expect(r.updates.delivered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('email.bounced → BOUNCED + failure_reason avec bounce.message', () => {
    const r = classifyResendEvent('email.bounced', {
      bounce: { message: 'Mailbox does not exist' },
    });
    expect(r).toEqual({
      kind: 'apply',
      updates: {
        status: 'BOUNCED',
        failure_reason: 'Bounced: Mailbox does not exist',
      },
    });
  });

  it('email.bounced sans bounce.message → "unknown bounce reason"', () => {
    const r = classifyResendEvent('email.bounced', {});
    expect(r.kind).toBe('apply');
    if (r.kind === 'apply') {
      expect(r.updates.failure_reason).toBe('Bounced: unknown bounce reason');
    }
  });

  it('email.complained → COMPLAINED + failure_reason fixe', () => {
    const r = classifyResendEvent('email.complained', {});
    expect(r).toEqual({
      kind: 'apply',
      updates: {
        status: 'COMPLAINED',
        failure_reason: 'Spam complaint received from recipient',
      },
    });
  });

  it('email.failed → FAILED + failure_reason avec failed.reason', () => {
    const r = classifyResendEvent('email.failed', {
      failed: { reason: 'Recipient blocked sender' },
    });
    expect(r).toEqual({
      kind: 'apply',
      updates: {
        status: 'FAILED',
        failure_reason: 'Resend failed: Recipient blocked sender',
      },
    });
  });
});

describe('classifyResendEvent — ignore path', () => {
  it('email.delivery_delayed → ignore (transient)', () => {
    const r = classifyResendEvent('email.delivery_delayed', {});
    expect(r).toEqual({
      kind: 'ignore',
      reason: 'transient delay (waiting final event)',
    });
  });

  it('email.opened → ignore (V2 analytics)', () => {
    const r = classifyResendEvent('email.opened', {});
    expect(r.kind).toBe('ignore');
    if (r.kind === 'ignore') expect(r.reason).toContain('V2 analytics');
  });

  it('email.clicked → ignore (V2 analytics)', () => {
    expect(classifyResendEvent('email.clicked', {}).kind).toBe('ignore');
  });

  it('email.sent → ignore (V2 analytics)', () => {
    expect(classifyResendEvent('email.sent', {}).kind).toBe('ignore');
  });

  it('event inconnu → ignore avec reason qui contient le type', () => {
    const r = classifyResendEvent('email.bogus_future_event', {});
    expect(r.kind).toBe('ignore');
    if (r.kind === 'ignore') expect(r.reason).toContain('email.bogus_future_event');
  });
});
