/**
 * Module 6 B2 — Type partagé du payload des templates PDF.
 *
 * Construit côté Server Action via la RPC `load_award_document_context`
 * qui retourne un JSONB structuré.
 */

export type DocumentContext = {
  award: {
    id: string;
    award_number: string | null;
    status: string;
    units_granted: number;
    exercise_price: number | null;
    grant_date: string;
    vesting_start_date: string | null;
    expiry_date: string | null;
  };
  plan: {
    id: string;
    name: string;
    plan_type: string;
  };
  beneficiary: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    tax_residence: string | null;
    address_line_1: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  };
  org: {
    id: string;
    name: string;
    legal_name: string | null;
    siren: string | null;
    registered_address: string | null;
  };
  /** Informations de génération injectées par le caller. */
  generation: {
    document_number: string;
    generated_at: string; // ISO
  };
};

/**
 * Module 9 B5 — Type partagé du payload des templates PDF exercise.
 *
 * Construit côté Server Action via la RPC `load_exercise_document_context`
 * (migration 00069) qui retourne un JSONB structuré + caller injecte
 * `generation` (numéro doc + date).
 */
export type DocumentContextExercise = {
  exercise: {
    id: string;
    request_number: string | null;
    status: string;
    units_to_exercise: number;
    exercise_price_per_unit: number;
    exercise_cost_total: number;
    fmv_at_request: number | null;
    payment_method: string | null;
    payment_reference: string | null;
    payment_amount_received: number | null;
    payment_received_at: string | null;
    tax_simulation_snapshot: {
      regime?: string;
      grossGainAmount?: number;
      totalTaxAmount?: number;
      netGainAmount?: number;
      effectiveTaxRate?: number;
    } | null;
    beneficiary_notes: string | null;
    admin_notes: string | null;
    requested_at: string;
    approved_at: string | null;
    confirmed_at: string | null;
    cancelled_at: string | null;
    rejection_reason: string | null;
    cancellation_reason: string | null;
  };
  award: {
    id: string;
    award_number: string | null;
    grant_date: string | null;
    exercise_price: number | null;
    units_granted: number;
    units_already_exercised: number;
    expiry_date: string | null;
  } | null;
  plan: {
    id: string;
    name: string;
    plan_type: string;
  } | null;
  beneficiary: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    tax_residence_country: string | null;
    hire_date: string | null;
  } | null;
  company: {
    id: string;
    name: string;
    legal_name: string | null;
    siren: string | null;
    share_capital: number | null;
    last_known_fmv_per_share: number | null;
  } | null;
  org: {
    id: string;
    name: string;
    legal_name: string | null;
    siren: string | null;
    registered_address: string | null;
    bank_iban: string | null;
    bank_bic: string | null;
    bank_name: string | null;
  } | null;
  generation: {
    document_number: string;
    generated_at: string; // ISO
  };
};
