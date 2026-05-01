/**
 * Module 7 B4 — Pure helper to classify Resend webhook events into DB
 * notification updates. Extracted from the resend-webhook EF body so it
 * can be tested in Vitest (Node) — the EF runtime is Deno and not directly
 * testable.
 *
 * Also imported by Server Actions / sandbox / future admin UI that needs
 * to display human-friendly event labels.
 */

export type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.failed';

export type NotificationUpdate = {
  status?: 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'FAILED';
  delivered_at?: string;
  failure_reason?: string;
};

export type ClassifyResult =
  | { kind: 'apply'; updates: NotificationUpdate }
  | { kind: 'ignore'; reason: string };

/**
 * Map un Resend webhook event vers les champs à UPDATE sur la notification.
 * Retourne `{ kind: 'ignore' }` pour les events V2 (opened, clicked, etc.)
 * — pas de side-effect sur la DB tant que le canal IN_APP n'est pas
 * implémenté.
 *
 * Spec mapping (cf. §6.1) :
 *  - email.delivered → DELIVERED + delivered_at
 *  - email.bounced → BOUNCED + failure_reason avec bounce.message
 *  - email.complained → COMPLAINED + failure_reason "spam complaint"
 *  - email.failed → FAILED + failure_reason (Resend-side hard failure)
 *  - email.delivery_delayed → ignore (transient, on attend l'event final)
 *  - email.opened / clicked / sent → ignore (V2 analytics, hors V1)
 */
export function classifyResendEvent(
  eventType: string,
  eventData:
    | {
        created_at?: string;
        bounce?: { message?: string };
        failed?: { reason?: string };
      }
    | null
    | undefined,
): ClassifyResult {
  switch (eventType) {
    case 'email.delivered':
      return {
        kind: 'apply',
        updates: {
          status: 'DELIVERED',
          delivered_at: eventData?.created_at ?? new Date().toISOString(),
        },
      };
    case 'email.bounced':
      return {
        kind: 'apply',
        updates: {
          status: 'BOUNCED',
          failure_reason: `Bounced: ${eventData?.bounce?.message ?? 'unknown bounce reason'}`,
        },
      };
    case 'email.complained':
      return {
        kind: 'apply',
        updates: {
          status: 'COMPLAINED',
          failure_reason: 'Spam complaint received from recipient',
        },
      };
    case 'email.failed':
      return {
        kind: 'apply',
        updates: {
          status: 'FAILED',
          failure_reason: `Resend failed: ${eventData?.failed?.reason ?? 'unknown'}`,
        },
      };
    case 'email.delivery_delayed':
      return { kind: 'ignore', reason: 'transient delay (waiting final event)' };
    case 'email.opened':
    case 'email.clicked':
    case 'email.sent':
      return { kind: 'ignore', reason: 'V2 analytics (not tracked V1)' };
    default:
      return { kind: 'ignore', reason: `unknown event type: ${eventType}` };
  }
}
