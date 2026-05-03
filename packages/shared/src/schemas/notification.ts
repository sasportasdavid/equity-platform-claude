import { z } from 'zod';

/**
 * Module 7 — Notifications schemas Zod.
 *
 * Validation des inputs des Server Actions du système de notifications
 * (queue pattern : INSERT en PENDING avec subject/body rendered, le
 * consumer EF B3 dépile et envoie via Resend).
 */

export const NOTIFICATION_STATUSES = [
  'PENDING',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
] as const;
export const notificationStatusEnum = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof notificationStatusEnum>;

export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP', 'SMS'] as const;
export const notificationChannelEnum = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof notificationChannelEnum>;

/**
 * Codes templates Module 7 B2 + B5 (workflow approval + signature +
 * onboarding). Garde les 5 templates Module 2 hors de cet enum car
 * ils ont leurs propres call-sites typés (auth.ts, identity.ts).
 *
 * Module 9 B5 ajoute 5 templates exercise — étendus dans le même enum
 * pour réutiliser le wrapper queue Module 7 (insertNotificationWithRender).
 */
export const MODULE_7_TEMPLATE_CODES = [
  'approval_pending',
  'approval_approved',
  'approval_rejected',
  'award_granted',
  'team_member_invite',
  'beneficiary_first_invite',
  // Module 9 B5 — workflow exercise
  'exercise_request_submitted',
  'exercise_request_approved',
  'exercise_request_rejected',
  'exercise_payment_confirmed',
  'exercise_request_cancelled_by_admin',
] as const;
export const module7TemplateCodeEnum = z.enum(MODULE_7_TEMPLATE_CODES);
export type Module7TemplateCode = z.infer<typeof module7TemplateCodeEnum>;

const uuidSchema = z.string().uuid();

/**
 * Input pour `insertNotificationWithRender` (Server Action interne,
 * appelée par les hooks Module 5/6 ou via l'admin UI).
 *
 * Au moins un parmi `userId` ou `beneficiaryId` doit être renseigné
 * pour que le destinataire soit identifiable côté UI IN_APP. Le
 * `recipientEmail` est obligatoire pour le canal EMAIL.
 */
export const insertNotificationWithRenderSchema = z
  .object({
    orgId: uuidSchema,
    templateCode: module7TemplateCodeEnum,
    channel: notificationChannelEnum.default('EMAIL'),
    recipientEmail: z.string().email().optional().nullable(),
    userId: uuidSchema.optional().nullable(),
    beneficiaryId: uuidSchema.optional().nullable(),
    /** Variables passées au template React Email — typé large
     * intentionnellement, validation strict côté template. */
    variables: z.record(z.string(), z.unknown()),
    relatedEntityType: z.string().max(50).optional().nullable(),
    relatedEntityId: uuidSchema.optional().nullable(),
  })
  .refine((d) => d.channel !== 'EMAIL' || !!d.recipientEmail, {
    message: 'recipientEmail required for EMAIL channel',
    path: ['recipientEmail'],
  })
  .refine((d) => !!d.userId || !!d.beneficiaryId, {
    message: 'At least one of userId or beneficiaryId is required',
  });

export type InsertNotificationWithRenderInput = z.infer<typeof insertNotificationWithRenderSchema>;

/**
 * Input pour `renderAndFillNotification` — re-render une notification
 * déjà insérée (Module 5 RPC inserts sans subject/body, B5 hook
 * appelle ensuite cette action).
 */
export const renderAndFillNotificationSchema = z.object({
  notificationId: uuidSchema,
});
export type RenderAndFillNotificationInput = z.infer<typeof renderAndFillNotificationSchema>;

/**
 * Input pour `insertManualNotification` — exposed admin Server Action
 * (panel Settings, futur usage). Wrap insertNotificationWithRender
 * mais avec requirePermission('notifications.send').
 */
export const insertManualNotificationSchema = insertNotificationWithRenderSchema;
export type InsertManualNotificationInput = z.infer<typeof insertManualNotificationSchema>;

/**
 * Input pour `cancelPendingNotification` (admin only).
 */
export const cancelPendingNotificationSchema = z.object({
  notificationId: uuidSchema,
});
export type CancelPendingNotificationInput = z.infer<typeof cancelPendingNotificationSchema>;
