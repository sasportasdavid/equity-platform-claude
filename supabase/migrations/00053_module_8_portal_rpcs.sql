-- ============================================================================
-- Module 8 B1 — RPCs portal bénéficiaire
--
-- 3 fonctions SECURITY DEFINER appelées depuis les Server Components du
-- portal (Module 8 B2-B5) :
--
--  1. get_beneficiary_portal_dashboard()
--       → JSONB { beneficiary, org, awards_count, awards_summary[] }
--       Charge le dashboard initial après login bénéficiaire.
--
--  2. get_award_portal_detail(p_award_id UUID)
--       → JSONB { award, plan, vesting_events, leaver_rules,
--                  performance_conditions, documents }
--       Détail complet d'un award pour la page /portal/awards/[id].
--
--  3. simulate_leaver_scenario(p_award_id, p_leaver_type, p_termination_date)
--       → JSONB { units_already_vested, units_accelerated, units_forfeited,
--                  exercise_deadline, treatment, ... }
--       Cœur du simulateur leavers : calcule l'impact d'un départ hypothétique.
--
-- Adaptations vs spec §2.5-2.7 (recon B1) :
--
--  a. beneficiaries.full_name → first_name||' '||last_name (DB Module 4)
--  b. beneficiaries.tax_residence → tax_residence_country (idem)
--  c. beneficiaries.phone non exposé en clair (phone_encrypted, V2 décrypte
--     côté Server Action si besoin du portal). full_name + email + tax_country
--     suffisent pour le has_complete_profile check de B2.
--  d. leaver_type values acceptés = lowercase tels que stockés dans
--     leaver_rules_snapshot (resignation/retirement/death/company_sale/
--     end_of_contract/mutual_agreement/termination_cause/termination_no_cause).
--     Le brief mentionne 'GOOD_LEAVER'/'BAD_LEAVER'/'NEUTRAL' — c'est une
--     catégorisation V2. V1 utilise les 8 leaver_type DB existants.
--  e. treatment values lowercase (forfeit_all/keep_vested/accelerate/pro_rata).
--  f. FALLBACK SNAPSHOT : si vesting_events vide pour l'award (cas live
--     B1 confirmé sur AWD-2026-0007), parser vesting_schedule_snapshot et
--     calculer units_to_vest_at_date à partir des tranches dont
--     vesting_date <= p_termination_date.
--
-- Toutes : SECURITY DEFINER + GRANT EXECUTE TO authenticated. Auth check
-- via auth.uid() + ownership via beneficiary_id du user courant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_beneficiary_portal_dashboard
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_beneficiary_portal_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_beneficiary_id UUID;
  v_org_id         UUID;
  v_result         JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, org_id INTO v_beneficiary_id, v_org_id
    FROM public.beneficiaries
   WHERE user_id = v_user_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record found for this user' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT jsonb_build_object(
    'beneficiary', (
      SELECT jsonb_build_object(
        'id',                   b.id,
        'full_name',            b.first_name || ' ' || b.last_name,
        'first_name',           b.first_name,
        'last_name',            b.last_name,
        'preferred_name',       b.preferred_name,
        'email',                b.email,
        'tax_residence',        b.tax_residence_country,
        'is_tax_resident_france', b.is_tax_resident_france,
        'address_line_1',       b.address_line_1,
        'postal_code',          b.postal_code,
        'city',                 b.city,
        'country',              b.country,
        'has_complete_profile', (
          b.first_name IS NOT NULL
          AND b.last_name IS NOT NULL
          AND b.tax_residence_country IS NOT NULL
          AND (b.address_line_1 IS NOT NULL OR b.country IS NOT NULL)
        )
      )
      FROM public.beneficiaries b WHERE b.id = v_beneficiary_id
    ),
    'org', (
      SELECT jsonb_build_object(
        'id',         o.id,
        'name',       o.name,
        'legal_name', o.legal_name
      )
      FROM public.organizations o WHERE o.id = v_org_id
    ),
    'awards_count', (
      SELECT COUNT(*) FROM public.awards
       WHERE beneficiary_id = v_beneficiary_id
         AND status = 'GRANTED'
         AND deleted_at IS NULL
    ),
    'awards_summary', COALESCE((
      SELECT jsonb_agg(award_summary ORDER BY grant_date DESC)
        FROM (
          SELECT
            jsonb_build_object(
              'id',             a.id,
              'award_number',   a.award_number,
              'plan_name',      p.name,
              'plan_type',      p.plan_type,
              'units_granted',  a.units_granted,
              'units_vested',   COALESCE((
                SELECT SUM(units_vested) FROM public.vesting_events
                 WHERE award_id = a.id AND status = 'VESTED'
              ), a.units_vested),
              'grant_date',     a.grant_date,
              'status',         a.status
            ) as award_summary,
            a.grant_date
          FROM public.awards a
            JOIN public.plans p ON p.id = a.plan_id
          WHERE a.beneficiary_id = v_beneficiary_id
            AND a.status = 'GRANTED'
            AND a.deleted_at IS NULL
        ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_beneficiary_portal_dashboard() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_award_portal_detail
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_award_portal_detail(p_award_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_beneficiary_id UUID;
  v_award          public.awards%ROWTYPE;
  v_result         JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_beneficiary_id
    FROM public.beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_award
    FROM public.awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found or access denied' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT jsonb_build_object(
    'award', to_jsonb(v_award),
    'plan', (
      SELECT jsonb_build_object(
        'id',          p.id,
        'name',        p.name,
        'plan_type',   p.plan_type,
        'description', p.description
      )
      FROM public.plans p WHERE p.id = v_award.plan_id
    ),
    'vesting_events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',                     ve.id,
        'scheduled_date',         ve.scheduled_date,
        'effective_date',         ve.effective_date,
        'units_to_vest',          ve.units_to_vest,
        'units_vested',           ve.units_vested,
        'performance_multiplier', ve.performance_multiplier,
        'status',                 ve.status
      ) ORDER BY ve.scheduled_date)
      FROM public.vesting_events ve WHERE ve.award_id = v_award.id
    ), '[]'::jsonb),
    'leaver_rules',           v_award.leaver_rules_snapshot,
    'performance_conditions', v_award.performance_conditions_snapshot,
    'vesting_schedule',       v_award.vesting_schedule_snapshot,
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',              di.id,
        'document_number', di.document_number,
        'category',        di.category,
        'title',           di.title,
        'status',          di.status,
        'signed_at',       di.signed_at,
        'has_signed_pdf', (di.signed_pdf_storage_path IS NOT NULL)
      ))
      FROM public.document_instances di
       WHERE di.related_entity_type = 'AWARD'
         AND di.related_entity_id = v_award.id
         AND di.status = 'SIGNED'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_award_portal_detail(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. simulate_leaver_scenario
-- ----------------------------------------------------------------------------
--
-- Logique :
--   1. Auth + ownership check
--   2. Match leaver_type dans leaver_rules_snapshot (lowercase values)
--   3. Compute units_already_vested (vesting_events si présent, sinon
--      fallback snapshot par tranche vesting_date <= p_termination_date)
--   4. Apply treatment :
--        - forfeit_all : tout perdu (y compris vested)
--        - keep_vested : garde vested, perd le rest
--        - accelerate  : vested + acceleration_months suivants
--        - pro_rata    : V1 = équivalent keep_vested (V2 = pro-rata fin)
--   5. Compute exercise_deadline pour les options (BSPCE/STOCK_OPTION/BSA)

CREATE OR REPLACE FUNCTION public.simulate_leaver_scenario(
  p_award_id          UUID,
  p_leaver_type       TEXT,
  p_termination_date  DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id              UUID := auth.uid();
  v_beneficiary_id       UUID;
  v_award                public.awards%ROWTYPE;
  v_plan_type            TEXT;
  v_leaver_rule          JSONB;
  v_treatment            TEXT;
  v_acceleration_months  INTEGER := 0;
  v_exercise_window_days INTEGER := 0;
  v_units_already_vested BIGINT  := 0;
  v_units_accelerated    BIGINT  := 0;
  v_units_forfeited      BIGINT  := 0;
  v_exercise_deadline    DATE;
  v_vesting_events_count INTEGER;
  v_used_snapshot_fallback BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_beneficiary_id
    FROM public.beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_award
    FROM public.awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT plan_type INTO v_plan_type
    FROM public.plans WHERE id = v_award.plan_id;

  -- 2. Find matching leaver rule from snapshot
  SELECT rule INTO v_leaver_rule
    FROM jsonb_array_elements(v_award.leaver_rules_snapshot) rule
   WHERE rule->>'leaver_type' = p_leaver_type
   LIMIT 1;

  IF v_leaver_rule IS NULL THEN
    -- Default safety net : tout perdu si pas de règle
    v_treatment := 'forfeit_all';
  ELSE
    v_treatment            := v_leaver_rule->>'treatment';
    v_acceleration_months  := COALESCE((v_leaver_rule->>'acceleration_months')::INTEGER, 0);
    v_exercise_window_days := COALESCE((v_leaver_rule->>'exercise_window_days')::INTEGER, 0);
  END IF;

  -- 3. Compute already vested
  SELECT COUNT(*) INTO v_vesting_events_count
    FROM public.vesting_events WHERE award_id = p_award_id;

  IF v_vesting_events_count > 0 THEN
    SELECT COALESCE(SUM(units_vested), 0) INTO v_units_already_vested
      FROM public.vesting_events
     WHERE award_id = p_award_id
       AND status = 'VESTED'
       AND scheduled_date <= p_termination_date;
  ELSE
    -- FALLBACK : parser vesting_schedule_snapshot.tranches
    -- Sum percentage_of_award * units_granted / 100 for tranches dont
    -- vesting_date <= p_termination_date
    v_used_snapshot_fallback := true;
    SELECT COALESCE(
      SUM(((tranche->>'percentage_of_award')::NUMERIC * v_award.units_granted / 100)::BIGINT),
      0
    ) INTO v_units_already_vested
      FROM jsonb_array_elements(
        COALESCE(v_award.vesting_schedule_snapshot->'tranches', '[]'::jsonb)
      ) tranche
     WHERE (tranche->>'vesting_date')::DATE <= p_termination_date;
  END IF;

  -- Cap at units_granted (sécurité)
  IF v_units_already_vested > v_award.units_granted THEN
    v_units_already_vested := v_award.units_granted;
  END IF;

  -- 4. Apply treatment (lowercase values from DB snapshot)
  IF v_treatment = 'forfeit_all' THEN
    v_units_forfeited      := v_award.units_granted;
    v_units_already_vested := 0;
    v_units_accelerated    := 0;
  ELSIF v_treatment = 'keep_vested' OR v_treatment = 'pro_rata' THEN
    -- V1 : pro_rata == keep_vested (le pro-rata fin de période = V2)
    v_units_forfeited   := v_award.units_granted - v_units_already_vested;
    v_units_accelerated := 0;
  ELSIF v_treatment = 'accelerate' THEN
    IF v_vesting_events_count > 0 THEN
      SELECT COALESCE(SUM(units_to_vest), 0) INTO v_units_accelerated
        FROM public.vesting_events
       WHERE award_id = p_award_id
         AND status = 'PENDING'
         AND scheduled_date >  p_termination_date
         AND scheduled_date <= p_termination_date + (v_acceleration_months || ' months')::INTERVAL;
    ELSE
      -- FALLBACK : tranches du snapshot dans la fenêtre acceleration
      SELECT COALESCE(
        SUM(((tranche->>'percentage_of_award')::NUMERIC * v_award.units_granted / 100)::BIGINT),
        0
      ) INTO v_units_accelerated
        FROM jsonb_array_elements(
          COALESCE(v_award.vesting_schedule_snapshot->'tranches', '[]'::jsonb)
        ) tranche
       WHERE (tranche->>'vesting_date')::DATE >  p_termination_date
         AND (tranche->>'vesting_date')::DATE <= p_termination_date + (v_acceleration_months || ' months')::INTERVAL;
    END IF;
    v_units_forfeited := v_award.units_granted - v_units_already_vested - v_units_accelerated;
  ELSE
    -- Treatment inconnu : safety = forfeit_all
    v_treatment            := 'forfeit_all';
    v_units_forfeited      := v_award.units_granted;
    v_units_already_vested := 0;
    v_units_accelerated    := 0;
  END IF;

  -- Sécurité : pas de valeurs négatives
  IF v_units_forfeited < 0 THEN v_units_forfeited := 0; END IF;

  -- 5. Compute exercise_deadline pour les options
  IF v_plan_type IN ('BSPCE','STOCK_OPTION','BSA') AND v_exercise_window_days > 0 THEN
    v_exercise_deadline := p_termination_date + (v_exercise_window_days || ' days')::INTERVAL;
  ELSE
    v_exercise_deadline := NULL;
  END IF;

  RETURN jsonb_build_object(
    'leaver_type',              p_leaver_type,
    'termination_date',         p_termination_date,
    'treatment',                v_treatment,
    'units_granted',            v_award.units_granted,
    'units_already_vested',     v_units_already_vested,
    'units_accelerated',        v_units_accelerated,
    'units_forfeited',          v_units_forfeited,
    'units_total_after_leave',  v_units_already_vested + v_units_accelerated,
    'exercise_window_days',     v_exercise_window_days,
    'exercise_deadline',        v_exercise_deadline,
    'acceleration_months',      v_acceleration_months,
    'used_snapshot_fallback',   v_used_snapshot_fallback
  );
END $$;

GRANT EXECUTE ON FUNCTION public.simulate_leaver_scenario(UUID, TEXT, DATE) TO authenticated;
