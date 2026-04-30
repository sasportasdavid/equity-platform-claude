import type {
  ApprovalAwardCheckContext,
  ApprovalAwardCheckInput,
  ApprovalDecisionCheckContext,
  ApprovalDecisionCheckInput,
  ApprovalWorkflowCheckContext,
  ApprovalWorkflowCheckInput,
  ComplianceRule,
} from '../types';

/**
 * Règles compliance V1 pour le moteur d'approbation — Module 5 B2.
 *
 * Spec : docs/MODULE_05_APPROVAL_ENGINE.md §6.
 *
 * 3 règles V1 :
 *   1. WORKFLOW_REQUIRED_FOR_AGA   (soft) — plans AGA devraient avoir un
 *      workflow attaché ou un default org pour AWARD_GRANT
 *   2. NO_SELF_APPROVAL            (hard) — un user ne peut pas approuver
 *      un award qu'il a lui-même créé
 *   3. WORKFLOW_HAS_VALID_STEPS    (hard) — chaque step doit avoir au moins
 *      1 approbateur résolvable (USER existant + actif, ou ROLE avec ≥1 user)
 *
 * V2 (Module 12) : configurable par org. V1 = hardcodé.
 */

// ---------------------------------------------------------------------------
// 1. WORKFLOW_REQUIRED_FOR_AGA (soft)
// ---------------------------------------------------------------------------

export const WORKFLOW_REQUIRED_FOR_AGA: ComplianceRule<
  ApprovalAwardCheckInput,
  ApprovalAwardCheckContext
> = {
  code: 'WORKFLOW_REQUIRED_FOR_AGA',
  description: "Plans AGA devraient avoir un workflow d'approbation configuré",
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (_data, ctx) => {
    if (ctx.plan?.plan_type !== 'AGA') return null;
    if (ctx.workflowAttached) return null;
    return {
      severity: 'WARNING',
      code: 'WORKFLOW_REQUIRED_FOR_AGA',
      message:
        "Plans AGA devraient avoir un workflow d'approbation. Configurer dans Settings → Approbations.",
      suggestedAction:
        "Créer un workflow AWARD_GRANT et l'attacher à ce plan, ou définir un default org.",
    };
  },
};

// ---------------------------------------------------------------------------
// 2. NO_SELF_APPROVAL (hard)
// ---------------------------------------------------------------------------

export const NO_SELF_APPROVAL: ComplianceRule<
  ApprovalDecisionCheckInput,
  ApprovalDecisionCheckContext
> = {
  code: 'NO_SELF_APPROVAL',
  description: "Un user ne peut pas approuver un award qu'il a lui-même créé",
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (!ctx.relatedAward?.created_by) return null;
    if (ctx.relatedAward.created_by !== data.approverUserId) return null;
    return {
      severity: 'ERROR',
      code: 'NO_SELF_APPROVAL',
      message:
        'Vous ne pouvez pas approuver un award que vous avez vous-même proposé. ' +
        'Demandez à un autre approbateur du workflow de prendre la décision.',
      suggestedAction:
        'Skipper cette décision (elle restera SKIPPED si un autre approver couvre le step).',
    };
  },
};

// ---------------------------------------------------------------------------
// 3. WORKFLOW_HAS_VALID_STEPS (hard)
// ---------------------------------------------------------------------------

export const WORKFLOW_HAS_VALID_STEPS: ComplianceRule<
  ApprovalWorkflowCheckInput,
  ApprovalWorkflowCheckContext
> = {
  code: 'WORKFLOW_HAS_VALID_STEPS',
  description: 'Chaque step doit avoir au moins 1 approbateur résolvable',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    for (const step of data.steps) {
      if (step.approverType === 'USER') {
        const userId = step.approverUserId;
        if (!userId || ctx.userExistsMap.get(userId) !== true) {
          return {
            severity: 'ERROR',
            code: 'WORKFLOW_HAS_VALID_STEPS',
            message: `Step ${step.stepOrder} : approverUserId ${userId ?? '(manquant)'} ne correspond à aucun user actif de l'organisation.`,
            suggestedAction: 'Choisir un user actif comme approbateur pour ce step.',
          };
        }
      } else {
        const role = step.approverRole;
        const count = role ? (ctx.roleUserCountMap.get(role) ?? 0) : 0;
        if (!role || count === 0) {
          return {
            severity: 'ERROR',
            code: 'WORKFLOW_HAS_VALID_STEPS',
            message: `Step ${step.stepOrder} : aucun user actif avec le rôle ${role ?? '(manquant)'} dans l'organisation.`,
            suggestedAction:
              "Inviter ou activer au moins 1 user avec ce rôle, ou changer le type d'approbateur du step.",
          };
        }
        if (count < step.requiredApprovals) {
          return {
            severity: 'ERROR',
            code: 'WORKFLOW_HAS_VALID_STEPS',
            message: `Step ${step.stepOrder} : ${count} user(s) avec le rôle ${role} mais ${step.requiredApprovals} approbations requises.`,
            suggestedAction: "Réduire requiredApprovals ou inviter plus d'users avec ce rôle.",
          };
        }
      }
    }
    return null;
  },
};

export const APPROVAL_AWARD_RULES = [WORKFLOW_REQUIRED_FOR_AGA];
export const APPROVAL_DECISION_RULES = [NO_SELF_APPROVAL];
export const APPROVAL_WORKFLOW_RULES = [WORKFLOW_HAS_VALID_STEPS];
