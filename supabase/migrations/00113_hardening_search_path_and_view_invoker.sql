-- ============================================================
-- Hardening DB (audit 2026-06-10, P1) — search_path + vues security_invoker
-- ============================================================
--
-- 1. function_search_path_mutable (advisor WARN ×13) : ces fonctions n'ont pas
--    de search_path figé → risque de hijack via un schéma malveillant dans le
--    search_path du rôle appelant. On fixe `search_path = public, pg_temp`
--    (pratique recommandée Supabase, sans effet fonctionnel — toutes ces
--    fonctions ne référencent que des objets de public).
--
-- 2. security_definer_view (advisor ERROR ×3) : les 3 vues tournaient avec les
--    privilèges du propriétaire (postgres, BYPASSRLS) → la RLS des tables
--    sous-jacentes n'était PAS appliquée. Pour `effective_compliance_rules`,
--    qui CROSS JOIN `organizations`, cela renvoyait toutes les orgs (fuite +
--    produit cartésien masqué par un filtre .eq applicatif). On passe en
--    security_invoker : la vue respecte désormais la RLS de l'appelant.
--    Vérifié : organizations (orgs_select_member), compliance_rule_overrides
--    (select_org), compliance_rule_definitions (read authenticated),
--    valuation_runs/results (select authenticated) ont toutes une policy
--    SELECT org-scopée pour `authenticated`. Consommateurs vue (cookie client
--    authentifié uniquement) : loadAllEffectiveRules, listComplianceRulesForUI.
--    loadEffectiveRule passe par la RPC get_effective_rule (non impacté).
-- ============================================================

-- 1. search_path figé
ALTER FUNCTION public.apply_scenario(jsonb, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_events_prevent_chain_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.canonical_audit_payload(uuid, uuid, uuid, text, text, text, uuid, jsonb, jsonb, jsonb, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_award_pool_consistency() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_perf_condition_market_data() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_exercise_request_number(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.list_my_plan_drafts() SET search_path = public, pg_temp;
ALTER FUNCTION public.load_plan_draft(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.on_exercise_payment_confirmed() SET search_path = public, pg_temp;
ALTER FUNCTION public.plan_drafts_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_plan_draft(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_peer_group_market_data(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_weighted_peer_groups_market_data(jsonb) SET search_path = public, pg_temp;

-- 2. vues en security_invoker (respect RLS de l'appelant)
ALTER VIEW public.effective_compliance_rules SET (security_invoker = true);
ALTER VIEW public.latest_valuation_per_plan SET (security_invoker = true);
ALTER VIEW public.valuation_runs_audit SET (security_invoker = true);
