/**
 * Module 5 B4 — Helper extrait du composant ApprovalRequestTimeline
 * pour permettre des tests Vitest unitaires sans React.
 */

export type StepStatus = 'approved' | 'rejected' | 'in_progress' | 'upcoming' | 'skipped';

export type TimelineStep = {
  step_order: number;
  required_approvals: number;
};

export type TimelineDecision = {
  step_order: number;
  status: string; // 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED' | 'EXPIRED'
};

export function computeStepStatus(
  step: TimelineStep,
  decisions: TimelineDecision[],
  currentStepOrder: number | null,
  requestStatus: string,
): StepStatus {
  const stepDecisions = decisions.filter((d) => d.step_order === step.step_order);
  const approved = stepDecisions.filter((d) => d.status === 'APPROVED').length;
  const rejected = stepDecisions.filter((d) => d.status === 'REJECTED').length;
  const skipped = stepDecisions.filter((d) => d.status === 'SKIPPED').length;
  const pending = stepDecisions.filter((d) => d.status === 'PENDING').length;

  if (rejected > 0) return 'rejected';
  if (approved >= step.required_approvals) return 'approved';
  if (
    requestStatus === 'CANCELLED' ||
    (requestStatus === 'REJECTED' && stepDecisions.length > 0 && skipped > 0)
  ) {
    return 'skipped';
  }
  if (pending > 0 && step.step_order === currentStepOrder) return 'in_progress';
  if (step.step_order > (currentStepOrder ?? 0)) return 'upcoming';
  return 'skipped';
}
