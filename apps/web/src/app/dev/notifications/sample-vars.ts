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
  // Module 9 B5 — workflow exercise
  exercise_request_submitted: {
    recipientName: 'Marie Dupont',
    requestNumber: 'EXR-2026-0042',
    beneficiaryName: 'Sophie Bernard',
    beneficiaryEmail: 'sophie.bernard@capiwise.local',
    awardNumber: 'AWD-2026-0042',
    planType: 'BSPCE',
    units: 1500,
    totalCost: 1875,
    fmvAtRequest: 25,
    taxRegime: 'BSPCE — détention < 3 ans (49% effective)',
    totalTaxes: 18375,
    netGain: 17250,
    approvalUrl: 'https://app.capiwise.local/dashboard/exercises/req-uuid',
  },
  exercise_request_approved: {
    recipientName: 'Sophie Bernard',
    requestNumber: 'EXR-2026-0042',
    awardNumber: 'AWD-2026-0042',
    units: 1500,
    planType: 'BSPCE',
    strikePrice: 1.25,
    totalCost: 1875,
    bankIban: 'FR76 3000 4000 5000 6000 7000 800',
    bankBic: 'BNPAFRPPXXX',
    bankName: 'BNP Paribas',
    orgName: 'Capiwise SAS',
    paymentDeadlineDays: 15,
    exerciseUrl: 'https://app.capiwise.local/portal/exercises/req-uuid',
  },
  exercise_request_rejected: {
    recipientName: 'Sophie Bernard',
    requestNumber: 'EXR-2026-0042',
    awardNumber: 'AWD-2026-0042',
    approverName: 'Marie Dupont',
    stepName: 'Validation RH',
    reason:
      'La fenêtre d’exercice n’est pas ouverte. Reportez votre demande à la prochaine fenêtre Q2 2026.',
    adminContactEmail: 'admin@capiwise.local',
    awardUrl: 'https://app.capiwise.local/portal/awards/award-uuid',
  },
  exercise_payment_confirmed: {
    recipientName: 'Sophie Bernard',
    requestNumber: 'EXR-2026-0042',
    awardNumber: 'AWD-2026-0042',
    units: 1500,
    planType: 'BSPCE',
    totalAmount: 1875,
    paymentReference: 'EXR-2026-0042',
    confirmedAt: '2026-05-20T10:30:00Z',
    orgName: 'Capiwise SAS',
    exerciseUrl: 'https://app.capiwise.local/portal/exercises/req-uuid',
  },
  exercise_request_cancelled_by_admin: {
    recipientName: 'Sophie Bernard',
    requestNumber: 'EXR-2026-0042',
    awardNumber: 'AWD-2026-0042',
    adminName: 'Jean Martin',
    reason: 'Paiement non reçu après 30 jours. Votre award reste GRANTED, vous pouvez ré-exercer.',
    awardUrl: 'https://app.capiwise.local/portal/awards/award-uuid',
  },
};
