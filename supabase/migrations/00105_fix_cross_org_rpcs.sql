-- =============================================================================
-- Migration 00105 : Tenant guards sur les RPCs SECURITY DEFINER restantes
-- =============================================================================
--
-- Suite à l'audit RBAC du 2026-05-19 (Risk R1) : 3 RPCs SECURITY DEFINER
-- bypassaient les RLS sans valider que le caller appartient bien à l'org
-- ciblée. Pattern dérivé du fix `00101_module_14_fix_cross_org_leak.sql`.
--
-- ⚠️ create_award_full / bulk_create_awards / apply_award_modification /
-- request_exercise / record_approval_decision / on_exercise_payment_confirmed /
-- create_plan_full / create_funding_round : déjà SAFE (audit confirmé).
--
-- Fix 3 RPCs vulnérables :
--
--   1. compute_cap_table(p_org_id, ...) — p_org_id pris du payload sans
--      comparaison à current_org_id(). Un user OWNER de org A peut lire
--      le cap table de org B → fuite données financières.
--
--   2. materialize_snapshot(p_org_id, ...) — idem, p_org_id input non
--      validé. Un user peut créer un snapshot pour une org cible
--      (perturbation cap table + INSERT audit_events dans org cible).
--
--   3. materialize_vesting_events(p_award_id) — aucun check perm / org.
--      Charge l'award sans filtre. Un user peut matérialiser les
--      vesting_events d'un award d'une autre org (perturbation flux IFRS 2).
--
-- Pattern de fix : `IF p_org_id IS DISTINCT FROM current_org_id()` →
-- `RAISE EXCEPTION 'TENANT_VIOLATION'` avec ERRCODE='P0001'. Pour les
-- RPCs qui prennent un ID d'entité (award_id, etc.), on charge l'org de
-- l'entité et on compare à current_org_id().
--
-- 4. (Defense-in-depth) next_award_number(p_org_id) — counter atomique
--    utility, appelé en interne par create_award_full. Pas critique mais
--    on ajoute le guard pour cohérence (~3 LOC).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. compute_cap_table
-- ---------------------------------------------------------------------------
-- Patch : ajoute le tenant guard JUSTE après le permission check existant.
-- Le reste de la fonction (~120 LOC) reste inchangé — on utilise une
-- approche surgicale via DO block + ALTER. Ici on réécrit la fonction
-- entière pour éviter les diff fragiles ; le corps métier vient directement
-- de 00085 + 00089 + corrections successives.
--
-- Note : on lit la définition courante via pg_proc pour éviter de figer
-- une version obsolète. À défaut, on patche uniquement les checks initiaux
-- via une wrapper. Stratégie retenue : créer une fonction interne renommée
-- puis wrapper. Mais c'est trop intrusif → on duplique le check au début.
--
-- Approche pragmatique : on ajoute une fonction _enforce_tenant_org(p_org_id)
-- qu'on appelle EN PREMIER, et on REPLACE compute_cap_table pour qu'elle
-- l'invoque. Le reste reste tel quel.

CREATE OR REPLACE FUNCTION _enforce_tenant_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current UUID := current_org_id();
BEGIN
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'No active org in JWT (current_org_id is NULL)'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_org_id <> v_current THEN
    RAISE EXCEPTION 'TENANT_VIOLATION: requested org % does not match active org %',
      p_org_id, v_current
      USING ERRCODE = 'P0001',
            HINT = 'A user can only operate on their active_org_id from the JWT.';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION _enforce_tenant_org(UUID) TO authenticated;

COMMENT ON FUNCTION _enforce_tenant_org IS
  'Helper interne — RAISE si p_org_id != current_org_id(). À appeler au début de toute RPC SECURITY DEFINER qui prend p_org_id en paramètre, sinon cross-org leak possible (audit RBAC 2026-05-19).';


-- ---------------------------------------------------------------------------
-- 2. PATCH compute_cap_table — ajoute _enforce_tenant_org au début
-- ---------------------------------------------------------------------------
-- Wrapper minimal : on RENOMME l'existante via ALTER FUNCTION, puis on crée
-- une nouvelle compute_cap_table qui delegate. Trop fragile → on duplique
-- le corps. PR équivalente.
--
-- Stratégie retenue : créer un wrapper compute_cap_table_safe qui fait le
-- check puis appelle l'ancienne via SQL function. Plus simple : on injecte
-- le check au début par CREATE OR REPLACE de la fonction complète.
--
-- ⚠️ Implémentation : on prend l'approche TRIGGER-LIKE via une fonction
-- compute_cap_table_internal qu'on appelle. Mais ça impose de réécrire
-- aussi materialize_snapshot. Pour éviter ce ripple, on duplique le check
-- en début de compute_cap_table existante via CREATE OR REPLACE.
--
-- IMPORTANT : pg_dump du corps métier de compute_cap_table (~120 LOC) est
-- préservé identiquement, seuls les 4 premières lignes du BEGIN changent.

-- On ne peut pas patcher partiellement une fonction PL/pgSQL — il faut
-- la réécrire. Comme la fonction est gigantesque (00085 + amendements),
-- on adopte une stratégie ALTERNATIVE : un GUARD TRIGGER fait au niveau
-- d'un wrapper. Mais pas de trigger possible sur les RPCs.
--
-- Solution finale : on remplace compute_cap_table par un wrapper qui
-- (a) check tenant puis (b) appelle compute_cap_table_impl (renommée).

ALTER FUNCTION compute_cap_table(UUID, DATE, UUID, TEXT)
  RENAME TO compute_cap_table_impl;

REVOKE EXECUTE ON FUNCTION compute_cap_table_impl(UUID, DATE, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION compute_cap_table_impl(UUID, DATE, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION compute_cap_table(
  p_org_id UUID,
  p_asof_date DATE DEFAULT CURRENT_DATE,
  p_scenario_id UUID DEFAULT NULL,
  p_view_mode TEXT DEFAULT 'CONSOLIDATED'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _enforce_tenant_org(p_org_id);
  RETURN compute_cap_table_impl(p_org_id, p_asof_date, p_scenario_id, p_view_mode);
END $$;

GRANT EXECUTE ON FUNCTION compute_cap_table(UUID, DATE, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION compute_cap_table(UUID, DATE, UUID, TEXT) IS
  'Module 10 (00085) + fix tenant guard 00105 — Calcule le cap table à p_asof_date pour p_org_id. Tenant guard via _enforce_tenant_org. Délègue à compute_cap_table_impl pour le calcul.';


-- ---------------------------------------------------------------------------
-- 3. PATCH materialize_snapshot — même approche wrapper
-- ---------------------------------------------------------------------------

ALTER FUNCTION materialize_snapshot(UUID, DATE, TEXT, UUID, TEXT)
  RENAME TO materialize_snapshot_impl;

REVOKE EXECUTE ON FUNCTION materialize_snapshot_impl(UUID, DATE, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION materialize_snapshot_impl(UUID, DATE, TEXT, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION materialize_snapshot(
  p_org_id UUID,
  p_asof_date DATE,
  p_snapshot_type TEXT,
  p_triggered_by_round_id UUID DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _enforce_tenant_org(p_org_id);
  RETURN materialize_snapshot_impl(
    p_org_id, p_asof_date, p_snapshot_type, p_triggered_by_round_id, p_label
  );
END $$;

GRANT EXECUTE ON FUNCTION materialize_snapshot(UUID, DATE, TEXT, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION materialize_snapshot(UUID, DATE, TEXT, UUID, TEXT) IS
  'Module 10 (00087) + fix tenant guard 00105 — Crée un snapshot immutable. Tenant guard via _enforce_tenant_org. Délègue à materialize_snapshot_impl.';


-- ---------------------------------------------------------------------------
-- 4. PATCH materialize_vesting_events — charge l'org via award et compare
-- ---------------------------------------------------------------------------
-- Cette RPC prend un award_id (pas d'org_id en paramètre). On résout l'org
-- via awards.org_id et on compare à current_org_id().
-- Le reste du corps reste inchangé : on remplace uniquement le check initial.
--
-- Pour éviter de réécrire ~80 LOC, on adopte la même approche wrapper.

ALTER FUNCTION materialize_vesting_events(UUID)
  RENAME TO materialize_vesting_events_impl;

REVOKE EXECUTE ON FUNCTION materialize_vesting_events_impl(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION materialize_vesting_events_impl(UUID) TO service_role;

CREATE OR REPLACE FUNCTION materialize_vesting_events(p_award_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_award_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT user_has_permission('awards.read.all') AND NOT user_has_permission('awards.propose') THEN
    RAISE EXCEPTION 'Permission denied for materialize_vesting_events'
      USING ERRCODE = '42501';
  END IF;
  IF p_award_id IS NULL THEN
    RAISE EXCEPTION 'p_award_id is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT org_id INTO v_award_org
    FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM _enforce_tenant_org(v_award_org);

  RETURN materialize_vesting_events_impl(p_award_id);
END $$;

GRANT EXECUTE ON FUNCTION materialize_vesting_events(UUID) TO authenticated;

COMMENT ON FUNCTION materialize_vesting_events(UUID) IS
  'Module 3b (00021) + fix tenant guard 00105 — Matérialise les vesting_events d''un award. Tenant guard via _enforce_tenant_org (org chargée depuis awards.org_id). Permission awards.propose ou awards.read.all requise. Délègue à materialize_vesting_events_impl.';


-- ---------------------------------------------------------------------------
-- 5. PATCH next_award_number — defense-in-depth (utility appelée en interne)
-- ---------------------------------------------------------------------------
-- Cette RPC est uniquement appelée par create_award_full (qui valide déjà
-- l'org). Mais elle est GRANT TO authenticated → exploitable directement
-- pour incrémenter le counter d'une autre org (= perturbation numérotation).
-- Fix défensif via le helper.

ALTER FUNCTION next_award_number(UUID)
  RENAME TO next_award_number_impl;

REVOKE EXECUTE ON FUNCTION next_award_number_impl(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION next_award_number_impl(UUID) TO service_role;

CREATE OR REPLACE FUNCTION next_award_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _enforce_tenant_org(p_org_id);
  RETURN next_award_number_impl(p_org_id);
END $$;

GRANT EXECUTE ON FUNCTION next_award_number(UUID) TO authenticated;

COMMENT ON FUNCTION next_award_number(UUID) IS
  'Module 3b (00020) + fix tenant guard 00105 — Génère le prochain numéro d''award atomique pour p_org_id. Tenant guard via _enforce_tenant_org. Délègue à next_award_number_impl.';

-- Note : create_award_full appelle next_award_number internally via
-- SECURITY DEFINER → la chain est OK (le caller initial est checké en
-- haut, et le tenant guard ici est cohérent puisque v_org_id = current_org_id).
