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
