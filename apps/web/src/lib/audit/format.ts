/**
 * PR #39 B1 — Verbalisation éditoriale FR des audit_events.
 *
 * Transforme un `event_type` technique (ex `auth.org_switched`, `plan.locked`)
 * en phrase éditoriale lisible par un CFO non-tech (ex "a basculé vers
 * Paragraphe", "a verrouillé le plan BSPCE-2026-001").
 *
 * Pure helper — pas d'I/O, testable en isolation.
 *
 * 30 event_types couverts (cf brief PR #39 §verbalization). Fallback
 * robuste pour event_types inconnus (V2 ajoute des familles, ce helper
 * doit dégrader gracieusement).
 */

export type AuditEventForFormat = {
  event_type: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EventVerbalization = {
  /** Verbe principal (ex "s'est connecté", "a verrouillé le plan"). */
  verb: string;
  /** Objet/cible optionnel (ex "BSPCE-2026-001", "Paragraphe"). Mis en valeur dans le rendu. */
  object?: string;
  /** Détail contextuel optionnel (ex "DRAFT → PROPOSED", "approuvé"). */
  context?: string;
};

/** Lecteur safe pour metadata.X — retourne string ou undefined. */
function readString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Tronque un UUID/ID à 8 chars hex pour fallback éditorial. */
function shortId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return `#${id.slice(0, 8)}`;
}

export function verbalizeEvent(event: AuditEventForFormat): EventVerbalization {
  const meta = event.metadata ?? {};

  switch (event.event_type) {
    // === AUTH ============================================================
    case 'auth.login_success':
      return { verb: "s'est connecté" };
    case 'auth.logout':
      return { verb: "s'est déconnecté" };
    case 'auth.magic_link_sent':
      return { verb: 'a demandé un lien magique' };
    case 'auth.org_switched':
      return {
        verb: 'a basculé vers',
        object:
          readString(meta, 'to_org_name') ??
          shortId(readString(meta, 'to_org_id')) ??
          'une autre organisation',
      };

    // === PLAN ============================================================
    case 'plan.created':
      return {
        verb: 'a créé le plan',
        object: readString(meta, 'plan_name') ?? shortId(event.resource_id) ?? 'un plan',
      };
    case 'plan.locked':
      return {
        verb: 'a verrouillé le plan',
        object: readString(meta, 'plan_name') ?? shortId(event.resource_id) ?? 'un plan',
      };

    // === AWARD ===========================================================
    case 'award.created':
      return {
        verb: "a créé l'attribution",
        object: readString(meta, 'award_number') ?? shortId(event.resource_id) ?? 'une attribution',
        context: readString(meta, 'beneficiary_name')
          ? `pour ${readString(meta, 'beneficiary_name')}`
          : undefined,
      };
    case 'award.status_changed':
      return {
        verb: "a fait passer l'attribution",
        object: readString(meta, 'award_number') ?? shortId(event.resource_id) ?? 'une attribution',
        context: `${readString(meta, 'before_status') ?? '?'} → ${readString(meta, 'after_status') ?? '?'}`,
      };
    case 'award.modified':
      return {
        verb: "a modifié l'attribution",
        object: readString(meta, 'award_number') ?? shortId(event.resource_id) ?? 'une attribution',
      };

    // === APPROVAL ========================================================
    case 'approval.workflow_created':
      return { verb: "a créé un workflow d'approbation" };
    case 'approval.workflow_started':
      return {
        verb: "a lancé l'approbation pour",
        object:
          readString(meta, 'resource_label') ??
          readString(meta, 'resource_type') ??
          'une ressource',
      };
    case 'approval.decision_recorded': {
      const decision = readString(meta, 'decision');
      return {
        verb: 'a enregistré sa décision',
        context: decision === 'APPROVE' ? 'approuvé' : decision === 'REJECT' ? 'rejeté' : decision,
      };
    }
    case 'approval.workflow_approved':
      return {
        verb: 'le workflow a été approuvé pour',
        object: readString(meta, 'resource_label') ?? 'une ressource',
      };
    case 'approval.workflow_rejected':
      return {
        verb: 'le workflow a été rejeté pour',
        object: readString(meta, 'resource_label') ?? 'une ressource',
      };

    // === DOCUMENT ========================================================
    case 'document.generated':
      return {
        verb: 'a généré le document',
        object: readString(meta, 'document_type') ?? readString(meta, 'document_name') ?? 'PDF',
      };
    case 'document.sent_for_signature':
      return {
        verb: 'a envoyé pour signature',
        object: readString(meta, 'document_type') ?? 'le document',
      };
    case 'document.signed':
      return {
        verb: 'a signé',
        object: readString(meta, 'document_type') ?? 'le document',
      };
    case 'document.preview_accessed':
      return {
        verb: "a consulté l'aperçu de",
        object: readString(meta, 'document_type') ?? 'le document',
      };
    case 'document.signature_cancelled':
      return {
        verb: 'a annulé la signature de',
        object: readString(meta, 'document_type') ?? 'le document',
      };
    case 'document.send_signature_failed':
      return {
        verb: "n'a pas pu envoyer pour signature",
        object: readString(meta, 'document_type') ?? 'le document',
        context: readString(meta, 'error_reason'),
      };

    // === VALUATION =======================================================
    case 'valuation.started':
      return {
        verb: 'a lancé une valorisation',
        context: readString(meta, 'plan_name')
          ? `pour ${readString(meta, 'plan_name')}`
          : undefined,
      };

    // === EXERCISE ========================================================
    case 'exercise.requested': {
      const units = meta.units;
      return {
        verb: "a demandé l'exercice de",
        object: typeof units === 'number' ? `${units} u.` : 'une attribution',
      };
    }
    case 'exercise.completed':
      return { verb: "a finalisé l'exercice" };
    case 'exercise.cancelled':
      return { verb: "a annulé une demande d'exercice" };

    // === BENEFICIARY =====================================================
    case 'beneficiary.created':
      return {
        verb: 'a ajouté le bénéficiaire',
        object:
          readString(meta, 'beneficiary_name') ??
          readString(meta, 'beneficiary_email') ??
          'un bénéficiaire',
      };
    case 'beneficiary.invited':
      return {
        verb: 'a invité',
        object: readString(meta, 'beneficiary_email') ?? 'un bénéficiaire',
      };
    case 'beneficiary.profile_completed':
      return { verb: 'a complété son profil' };

    // === PORTAL ==========================================================
    case 'portal.leaver_simulated':
      return { verb: 'a simulé un départ' };
    case 'portal.document_downloaded':
      return {
        verb: 'a téléchargé',
        object: readString(meta, 'document_type') ?? 'un document',
      };

    // === INVITATION ======================================================
    case 'invitation.created':
      return {
        verb: 'a invité',
        object: readString(meta, 'invitee_email') ?? 'un nouvel utilisateur',
      };

    // === FALLBACK ========================================================
    default:
      return {
        verb: "a déclenché l'événement",
        object: event.event_type,
        context: event.resource_type ? `sur ${event.resource_type}` : undefined,
      };
  }
}
