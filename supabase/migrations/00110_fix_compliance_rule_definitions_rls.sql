-- ============================================================
-- Fix sécurité (audit 2026-06-10, P0-1) — RLS sur compliance_rule_definitions
-- ============================================================
--
-- La table compliance_rule_definitions (registre global des 23 ComplianceRule)
-- était PUBLIC sans RLS et le rôle anon disposait de tous les privilèges
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE). N'importe qui avec la clé publique
-- anon pouvait lire et RÉÉCRIRE les définitions des règles (severity, params).
--
-- Correctif :
--   - REVOKE de tous les droits écriture sur anon + authenticated (le registre
--     n'est modifié que par migration / service_role ; les overrides par org
--     vivent dans compliance_rule_overrides).
--   - ENABLE RLS + policy SELECT pour authenticated uniquement (référentiel
--     lisible par les users connectés, invisible pour anon).
-- ============================================================

-- 1. Couper les droits de mutation et l'accès anon
REVOKE ALL ON TABLE public.compliance_rule_definitions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.compliance_rule_definitions FROM authenticated;

-- 2. RLS
ALTER TABLE public.compliance_rule_definitions ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié (référentiel global, pas de scope org)
DROP POLICY IF EXISTS compliance_rule_definitions_read ON public.compliance_rule_definitions;
CREATE POLICY compliance_rule_definitions_read
  ON public.compliance_rule_definitions
  FOR SELECT
  TO authenticated
  USING (true);

-- Aucune policy d'écriture pour anon/authenticated : INSERT/UPDATE/DELETE
-- restent réservés au service_role (bypass RLS) et aux migrations.

COMMENT ON TABLE public.compliance_rule_definitions IS
  'Registre global des ComplianceRule (Module 12). RLS read-only authenticated ; mutations via service_role/migrations uniquement (fix audit 2026-06-10 P0-1).';
