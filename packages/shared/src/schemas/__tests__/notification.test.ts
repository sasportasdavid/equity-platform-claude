import { describe, expect, it } from 'vitest';
import {
  cancelPendingNotificationSchema,
  insertNotificationWithRenderSchema,
  module7TemplateCodeEnum,
  notificationChannelEnum,
  notificationStatusEnum,
  renderAndFillNotificationSchema,
} from '../notification';

const validInput = {
  orgId: '00000000-0000-4000-8000-000000000001',
  templateCode: 'approval_pending' as const,
  channel: 'EMAIL' as const,
  recipientEmail: 'test@capiwise.local',
  userId: '00000000-0000-4000-8000-000000000002',
  variables: { recipient_name: 'Alice', award_number: 'AWD-2026-0001', award_units: 1500 },
};

describe('insertNotificationWithRenderSchema', () => {
  it('happy path : EMAIL channel + recipientEmail + userId', () => {
    expect(insertNotificationWithRenderSchema.safeParse(validInput).success).toBe(true);
  });

  it('happy path : IN_APP channel sans recipientEmail', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      channel: 'IN_APP',
      recipientEmail: undefined,
    });
    expect(r.success).toBe(true);
  });

  it('reject : EMAIL channel sans recipientEmail', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      recipientEmail: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('reject : ni userId ni beneficiaryId', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      userId: undefined,
      beneficiaryId: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('accepte beneficiaryId sans userId', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      userId: undefined,
      beneficiaryId: '00000000-0000-4000-8000-000000000003',
    });
    expect(r.success).toBe(true);
  });

  it('reject : templateCode invalide', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      templateCode: 'bogus_template',
    });
    expect(r.success).toBe(false);
  });

  it('reject : recipientEmail invalide', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      recipientEmail: 'not-an-email',
    });
    expect(r.success).toBe(false);
  });

  it('reject : orgId pas un UUID', () => {
    const r = insertNotificationWithRenderSchema.safeParse({
      ...validInput,
      orgId: 'not-uuid',
    });
    expect(r.success).toBe(false);
  });
});

describe('renderAndFillNotificationSchema', () => {
  it('happy path : UUID valide', () => {
    expect(
      renderAndFillNotificationSchema.safeParse({
        notificationId: '00000000-0000-4000-8000-000000000004',
      }).success,
    ).toBe(true);
  });
  it('reject : notificationId pas un UUID', () => {
    expect(renderAndFillNotificationSchema.safeParse({ notificationId: 'foo' }).success).toBe(
      false,
    );
  });
});

describe('cancelPendingNotificationSchema', () => {
  it('happy path', () => {
    expect(
      cancelPendingNotificationSchema.safeParse({
        notificationId: '00000000-0000-4000-8000-000000000005',
      }).success,
    ).toBe(true);
  });
});

describe('enums', () => {
  it('notificationStatusEnum couvre les 6 valeurs DB', () => {
    expect(notificationStatusEnum.options).toEqual([
      'PENDING',
      'SENDING',
      'SENT',
      'DELIVERED',
      'FAILED',
      'BOUNCED',
    ]);
  });
  it('notificationChannelEnum couvre EMAIL/IN_APP/SMS', () => {
    expect(notificationChannelEnum.options).toEqual(['EMAIL', 'IN_APP', 'SMS']);
  });
  it('module7TemplateCodeEnum expose les 11 codes (6 B2 + 5 Module 9 B5)', () => {
    expect(module7TemplateCodeEnum.options).toEqual([
      'approval_pending',
      'approval_approved',
      'approval_rejected',
      'award_granted',
      'team_member_invite',
      'beneficiary_first_invite',
      // Module 9 B5
      'exercise_request_submitted',
      'exercise_request_approved',
      'exercise_request_rejected',
      'exercise_payment_confirmed',
      'exercise_request_cancelled_by_admin',
    ]);
  });
});
