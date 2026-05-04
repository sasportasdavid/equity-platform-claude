-- =============================================================================
-- Module 10 B1 — Migration 00082b : aligne Module 10 sur namespace captable.*
-- =============================================================================
--
-- Recon B1 a manqué la préfiguration M1 du namespace `captable.*` (4 perms
-- seedées + role mappings dans packages/shared/src/constants/{permissions,roles}.ts)
-- et la fonction `has_permission()` (pattern dominant — `user_has_permission`
-- est juste un alias).
--
-- Les migrations 00080-00082 ont été appliquées en cloud avec :
--   - cap_table.*           (au lieu de captable.*)
--   - user_has_permission() (au lieu de has_permission())
--
-- Cette migration corrective DROP+RECREATE les policies des 3 tables
-- (share_classes, funding_rounds, cap_table_positions) pour aligner sur
-- le namespace captable.* + has_permission().
--
-- Erratum spec MODULE_10 §2.10 : namespace `cap_table.*` → `captable.*`,
-- `user_has_permission` → `has_permission`. Documenté en
-- memory/module_10_recon.md.
-- =============================================================================

-- 1. share_classes — DROP + RECREATE (fichier 00080 also patched localement)
DROP POLICY IF EXISTS share_classes_select_own_org ON share_classes;
DROP POLICY IF EXISTS share_classes_insert_admin ON share_classes;
DROP POLICY IF EXISTS share_classes_update_admin ON share_classes;

CREATE POLICY share_classes_select_own_org
  ON share_classes FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY share_classes_insert_admin
  ON share_classes FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('captable.share_class.create')
  );

CREATE POLICY share_classes_update_admin
  ON share_classes FOR UPDATE
  USING (
    org_id = current_org_id()
    AND has_permission('captable.share_class.update')
  );

-- 2. funding_rounds
DROP POLICY IF EXISTS funding_rounds_select_own_org ON funding_rounds;
DROP POLICY IF EXISTS funding_rounds_insert_admin ON funding_rounds;
DROP POLICY IF EXISTS funding_rounds_update_admin ON funding_rounds;

CREATE POLICY funding_rounds_select_own_org
  ON funding_rounds FOR SELECT
  USING (
    org_id = current_org_id()
    AND has_permission('captable.round.read')
  );

CREATE POLICY funding_rounds_insert_admin
  ON funding_rounds FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('captable.round.create')
  );

CREATE POLICY funding_rounds_update_admin
  ON funding_rounds FOR UPDATE
  USING (
    org_id = current_org_id()
    AND has_permission('captable.round.create')
  );

-- 3. cap_table_positions
DROP POLICY IF EXISTS positions_select_admin ON cap_table_positions;
DROP POLICY IF EXISTS positions_select_own_beneficiary ON cap_table_positions;
DROP POLICY IF EXISTS positions_insert_admin ON cap_table_positions;

CREATE POLICY positions_select_admin
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND has_permission('captable.read.all')
  );

CREATE POLICY positions_select_own_beneficiary
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND stakeholder_type = 'BENEFICIARY'
    AND has_permission('captable.read.own')
    AND stakeholder_id IN (
      SELECT id FROM beneficiaries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY positions_insert_admin
  ON cap_table_positions FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('captable.read.all')
  );

COMMENT ON TABLE share_classes IS
  'Module 10 B1 — Classes d''actions. Policies aligned namespace captable.* (Module 1 + Module 10 cohérents). Audit via logAuditEvent côté Server Action.';
COMMENT ON TABLE funding_rounds IS
  'Module 10 B1 — Levees de fonds. Policies aligned namespace captable.*.';
COMMENT ON TABLE cap_table_positions IS
  'Module 10 B1 — Positions atomiques. Policies aligned namespace captable.* (read.all admin / read.own BENEFICIARY).';
