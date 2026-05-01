import type { Module7TemplateCode } from '@equity/shared';
import type { TemplateMap } from '@/lib/resend/templates';

/**
 * Variables d'exemple pour chaque template Module 7 — utilisées par
 * la sandbox /dev/notifications pour afficher des previews avec un
 * jeu de données réaliste (mais factice).
 */
export const SAMPLE_VARS: { [K in Module7TemplateCode]: TemplateMap[K] } = {
  approval_pending: {
    recipientName: 'Marie Dupont',
    awardNumber: 'AWD-2026-0042',
    awardUnits: 1500,
    awardPlanType: 'BSPCE',
    creatorName: 'Jean Martin',
    appUrl: 'https://app.capiwise.local',
    approvalUrl: 'https://app.capiwise.local/dashboard/approvals/req-uuid',
  },
  approval_approved: {
    recipientName: 'Jean Martin',
    awardNumber: 'AWD-2026-0042',
    approverName: 'Marie Dupont',
    awardUrl: 'https://app.capiwise.local/dashboard/awards/award-uuid',
  },
  approval_rejected: {
    recipientName: 'Jean Martin',
    awardNumber: 'AWD-2026-0042',
    approverName: 'Marie Dupont',
    reason: 'Le bénéficiaire n’est pas encore éligible BSPCE (ancienneté < 18 mois).',
    awardUrl: 'https://app.capiwise.local/dashboard/awards/award-uuid',
  },
  award_granted: {
    beneficiaryName: 'Sophie Bernard',
    orgName: 'Capiwise SAS',
    awardNumber: 'AWD-2026-0042',
    planType: 'BSPCE',
    units: 1500,
    exercisePrice: 1.25,
    grantDate: '2026-01-15',
    portalUrl: 'https://app.capiwise.local/portal/awards/award-uuid',
  },
  team_member_invite: {
    orgName: 'Capiwise SAS',
    inviterEmail: 'admin@capiwise.local',
    acceptUrl: 'https://app.capiwise.local/auth/invite?token=abc123',
    message:
      'Bienvenue dans l’équipe ! Tu auras accès au panel admin pour valider les attributions.',
    expiresAtHuman: '15 mai 2026 à 18:00',
  },
  beneficiary_first_invite: {
    orgName: 'Capiwise SAS',
    acceptUrl: 'https://app.capiwise.local/portal/welcome?token=xyz789',
    expiresAtHuman: '20 mai 2026 à 18:00',
  },
};
