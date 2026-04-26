-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00005 : Extension du catalogue de permissions (Module 2 §3.1)
--
-- Module 1 a livré 41 permissions ; Module 2 §3.1 en demande davantage,
-- plus granulaires (org.view/update/delete, companies.*, .sensitive,
-- .bulk_import, .archive, .override, etc.).
--
-- Stratégie : pure ajout via INSERT ON CONFLICT DO UPDATE.
--   - Aucun DELETE : les 41 codes Module 1 restent.
--   - Aucune migration de données : seules les rows référentielles bougent.
--   - Idempotent : peut être replay sans effet de bord.
--
-- Note : on garde temporairement `compliance.acknowledge_alert` et
-- `compliance.configure_rules` du Module 1, et on ajoute les alias plus
-- propres `compliance.acknowledge` et `compliance.configure` introduits
-- par la spec Module 2. Les deux jeux coexistent ; le code applicatif
-- migrera vers les nouveaux codes au fil des modules.
-- ===========================================================================

INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  -- Organization (granularité supplémentaire)
  ('org.view',                    'ORGANIZATION', 'Voir les détails de l''organisation',                  false),
  ('org.update',                  'ORGANIZATION', 'Modifier les paramètres généraux de l''organisation',  false),
  ('org.delete',                  'ORGANIZATION', 'Supprimer l''organisation',                            true),

  -- Companies (entité métier distincte d'organization)
  ('companies.create',            'COMPANIES',    'Créer une société',                                    false),
  ('companies.read',              'COMPANIES',    'Voir les sociétés rattachées à l''organisation',       false),
  ('companies.update',            'COMPANIES',    'Modifier les sociétés',                                false),
  ('companies.delete',            'COMPANIES',    'Supprimer une société (soft delete)',                  true),

  -- Beneficiaries (accès aux données chiffrées + invitation)
  ('beneficiaries.read.sensitive','BENEFICIARIES','Lire les données sensibles déchiffrées (NSS, DOB, etc.)', true),
  ('beneficiaries.invite',        'BENEFICIARIES','Inviter un bénéficiaire à son espace personnel',       false),

  -- Awards
  ('awards.bulk_import',          'AWARDS',       'Import massif d''attributions (CSV)',                  true),

  -- Approvals
  ('approvals.act',               'APPROVALS',    'Agir sur une demande d''approbation (approuver/rejeter)', false),
  ('approvals.configure',         'APPROVALS',    'Configurer les workflows d''approbation',              true),

  -- Documents
  ('documents.read.own',          'DOCUMENTS',    'Lire ses propres documents (bénéficiaire)',            false),
  ('documents.archive',           'DOCUMENTS',    'Archiver un document signé',                           false),

  -- Cap table
  ('captable.edit',               'CAP_TABLE',    'Éditer manuellement la cap table',                     true),

  -- Valuations
  ('valuations.export',           'VALUATIONS',   'Exporter les rapports de valorisation',                false),

  -- Compliance (alias plus courts du Module 2)
  ('compliance.acknowledge',      'COMPLIANCE',   'Acquitter une alerte de conformité (alias court)',     false),
  ('compliance.override',         'COMPLIANCE',   'Outrepasser un blocage soft de conformité',            true),
  ('compliance.configure',        'COMPLIANCE',   'Configurer les règles de conformité (alias court)',    true),

  -- Reports
  ('reports.dsn_export',          'REPORTS',      'Exporter pour la Déclaration Sociale Nominative',      true)

ON CONFLICT (code) DO UPDATE
  SET category = EXCLUDED.category,
      description = EXCLUDED.description,
      is_dangerous = EXCLUDED.is_dangerous;

-- ===========================================================================
-- Fin de la migration 00005 — devrait porter le total à 41 + 20 = 61 permissions.
-- ===========================================================================
