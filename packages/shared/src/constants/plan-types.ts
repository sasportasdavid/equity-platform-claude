/**
 * Types d'instruments d'actionnariat supportés (Module 1 §4.4).
 */
export const PLAN_TYPES = [
  'BSPCE',
  'AGA',
  'STOCK_OPTION',
  'BSA',
  'RSU',
  'PERFORMANCE_SHARE',
  'PHANTOM',
  'ESOP',
  'SAR',
] as const;

export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Options',
  BSA: 'BSA',
  RSU: 'RSU',
  PERFORMANCE_SHARE: 'Actions de performance',
  PHANTOM: 'Phantom Stock',
  ESOP: 'ESOP',
  SAR: 'SAR',
};

export const SETTLEMENT_TYPES = ['EQUITY', 'CASH'] as const;
export type SettlementType = (typeof SETTLEMENT_TYPES)[number];

export const PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const BENEFICIARY_TYPES = [
  'EMPLOYEE',
  'OFFICER', // mandataire social
  'CONSULTANT',
  'ADVISOR',
  'OTHER',
] as const;
export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number];

// Module 4 B1 : enum lowercase migré depuis ['ACTIVE','FORMER','ARCHIVED'] (Module 1).
// Mapping legacy : FORMER+ARCHIVED → terminated.
export const BENEFICIARY_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number];

export const LEAVER_TYPES = [
  'resignation',
  'termination_cause',
  'termination_no_cause',
  'death',
  'retirement',
  'company_sale',
  'mutual_agreement',
  'end_of_contract',
] as const;
export type LeaverType = (typeof LEAVER_TYPES)[number];

export const LEAVER_TREATMENTS = [
  'forfeit_all',
  'keep_vested',
  'pro_rata',
  'accelerate',
  'full_accelerate',
] as const;
export type LeaverTreatment = (typeof LEAVER_TREATMENTS)[number];
