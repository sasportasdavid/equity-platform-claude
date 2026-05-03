/**
 * Module 8 — Types portail bénéficiaire.
 *
 * Source de vérité pour les payloads retournés par les RPCs SECURITY DEFINER
 * (Module 8 B1) :
 *   - get_beneficiary_portal_dashboard()  → PortalDashboardData
 *   - get_award_portal_detail(award_id)   → AwardPortalDetail
 *
 * Aligné sur les sélections JSONB côté SQL (cf. migration 00053). Les noms
 * de champs respectent les colonnes DB en snake_case (pas de transformation).
 */

// AwardStatus est ré-utilisé depuis les schemas (Module 3b — 16 valeurs).
import type { AwardStatus } from '../schemas/award';
// LeaverTreatment est ré-utilisé depuis les constants Module 3a (5 valeurs DB).
import type { LeaverTreatment } from '../constants/plan-types';

export type VestingEventStatus = 'PENDING' | 'VESTED' | 'FORFEITED' | 'CANCELLED';

export type DocumentStatus = 'DRAFT' | 'GENERATED' | 'SENT_FOR_SIGNATURE' | 'SIGNED' | 'VOID';

// ---------------------------------------------------------------------------
// PortalDashboardData (RPC get_beneficiary_portal_dashboard)
// ---------------------------------------------------------------------------

export type PortalBeneficiarySummary = {
  id: string;
  full_name: string;
  email: string;
  /** phone_encrypted ne ressort PAS du RPC V1 (B1 closure decision #4 dette) */
  tax_residence_country: string | null;
  has_complete_profile: boolean;
};

export type PortalOrgSummary = {
  id: string;
  name: string;
  legal_name: string | null;
};

export type PortalAwardSummary = {
  id: string;
  award_number: string;
  plan_name: string;
  plan_type: string;
  units_granted: number;
  units_vested: number;
  grant_date: string;
  status: AwardStatus;
};

export type PortalDashboardData = {
  beneficiary: PortalBeneficiarySummary;
  org: PortalOrgSummary;
  awards_count: number;
  awards_summary: PortalAwardSummary[] | null;
};

// ---------------------------------------------------------------------------
// AwardPortalDetail (RPC get_award_portal_detail)
// ---------------------------------------------------------------------------

export type PortalVestingEvent = {
  id: string;
  scheduled_date: string;
  effective_date: string | null;
  units_to_vest: number;
  units_vested: number;
  performance_multiplier: number | null;
  status: VestingEventStatus;
};

export type PortalLeaverRule = {
  leaver_type: string;
  treatment: string;
  acceleration_months?: number | null;
  exercise_window_days?: number | null;
  notes?: string | null;
};

export type PortalPerformanceCondition = {
  id?: string;
  name: string;
  type?: string;
  threshold?: number | null;
  weight?: number | null;
};

export type PortalVestingScheduleTranche = {
  id?: string;
  sort_order?: number;
  vesting_date: string;
  percentage_of_award: number;
  performance_condition_id?: string | null;
};

export type PortalVestingScheduleSnapshot = {
  schedule: {
    id?: string;
    name?: string | null;
    vesting_type?: string | null;
    cliff_months?: number | null;
    total_months?: number | null;
    cliff_percentage?: number | null;
    single_vesting_date?: string | null;
    [key: string]: unknown;
  };
  tranches: PortalVestingScheduleTranche[];
};

export type PortalDocumentLink = {
  id: string;
  document_number: string | null;
  category: string | null;
  status: DocumentStatus;
  signed_at: string | null;
  has_signed_pdf: boolean;
};

export type PortalAwardRecord = {
  id: string;
  org_id: string;
  plan_id: string;
  beneficiary_id: string;
  award_number: string;
  units_granted: number;
  exercise_price: string | number | null;
  grant_date: string;
  accepted_at: string | null;
  status: AwardStatus;
  vesting_schedule_snapshot: PortalVestingScheduleSnapshot | null;
  performance_conditions_snapshot: PortalPerformanceCondition[] | null;
  leaver_rules_snapshot: PortalLeaverRule[] | null;
  [key: string]: unknown;
};

export type PortalPlanSummary = {
  id: string;
  name: string;
  plan_type: string;
  description: string | null;
};

export type AwardPortalDetail = {
  award: PortalAwardRecord;
  plan: PortalPlanSummary;
  vesting_events: PortalVestingEvent[] | null;
  leaver_rules: PortalLeaverRule[] | null;
  performance_conditions: PortalPerformanceCondition[] | null;
  vesting_schedule?: PortalVestingScheduleSnapshot | null;
  documents: PortalDocumentLink[] | null;
};

// ---------------------------------------------------------------------------
// LeaverScenarioResult (RPC simulate_leaver_scenario, Module 8 B1 + B4)
// ---------------------------------------------------------------------------

/**
 * 5 treatments existant en DB (réutilisé depuis Module 3a constants) :
 *   - forfeit_all       : tout perdre (vested inclus)
 *   - keep_vested       : garder le vested, perdre le reste
 *   - pro_rata          : V1 alias keep_vested (pro_rata fin-de-période = V2)
 *   - accelerate        : vested + tranches dans
 *                         [termination_date, +acceleration_months]
 *   - full_accelerate   : toutes les unités non acquises sont accélérées
 *                         (cas company_sale / death généreux). Module 8 B4.
 */

export type LeaverScenarioResult = {
  leaver_type: string;
  termination_date: string;
  treatment: LeaverTreatment;
  units_granted: number;
  units_already_vested: number;
  units_accelerated: number;
  units_forfeited: number;
  units_total_after_leave: number;
  exercise_window_days: number;
  /** ISO date `YYYY-MM-DD`, NULL si plan non-option (AGA, RSU, …) */
  exercise_deadline: string | null;
  acceleration_months: number;
  used_snapshot_fallback: boolean;
};
