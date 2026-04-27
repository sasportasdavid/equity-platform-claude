-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00003 : Seed des référentiels globaux (Module 1 §11)
--
-- Charge les données de référence indispensables :
--   - permissions_catalog (40 permissions exhaustives, cf. spec §3.3)
--   - role_permissions     (mapping standard des 5 rôles)
--   - compliance_rules_catalog (BSPCE, AGA, pool — règles FR fondamentales)
--   - notification_templates   (emails transactionnels minimaux)
--
-- Toutes les insertions sont idempotentes (ON CONFLICT DO UPDATE) pour
-- pouvoir replay la migration sans casser l'état.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. permissions_catalog
-- --------------------------------------------------------------------------

INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  -- Plans
  ('plans.create',                  'PLANS',         'Créer un nouveau plan d''actionnariat',                false),
  ('plans.read',                    'PLANS',         'Consulter les plans de l''organisation',               false),
  ('plans.update',                  'PLANS',         'Modifier un plan existant',                            false),
  ('plans.delete',                  'PLANS',         'Supprimer un plan (soft delete)',                      true),
  ('plans.lock',                    'PLANS',         'Verrouiller un plan pour empêcher toute modification', false),
  -- Awards
  ('awards.propose',                'AWARDS',        'Proposer une attribution à un bénéficiaire',           false),
  ('awards.approve',                'AWARDS',        'Approuver une attribution proposée',                   false),
  ('awards.read.own',               'AWARDS',        'Consulter ses propres attributions',                   false),
  ('awards.read.all',               'AWARDS',        'Consulter toutes les attributions de l''organisation', false),
  ('awards.update',                 'AWARDS',        'Modifier une attribution',                             false),
  ('awards.exercise',               'AWARDS',        'Exercer ses options',                                  false),
  ('awards.cancel',                 'AWARDS',        'Annuler une attribution',                              true),
  ('awards.modify',                 'AWARDS',        'Effectuer une modification IFRS 2 (repricing, extension)', true),
  -- Beneficiaries
  ('beneficiaries.create',          'BENEFICIARIES', 'Créer un bénéficiaire',                                false),
  ('beneficiaries.read',            'BENEFICIARIES', 'Consulter les bénéficiaires',                          false),
  ('beneficiaries.update',          'BENEFICIARIES', 'Modifier les informations d''un bénéficiaire',         false),
  ('beneficiaries.delete',          'BENEFICIARIES', 'Archiver un bénéficiaire',                             true),
  -- Cap table
  ('captable.read',                 'CAP_TABLE',     'Consulter la cap table',                               false),
  ('captable.export',               'CAP_TABLE',     'Exporter la cap table (PDF, Excel)',                   false),
  ('captable.simulate',             'CAP_TABLE',     'Créer des scénarios de dilution',                      false),
  -- Documents
  ('documents.create_template',     'DOCUMENTS',     'Créer un template de document',                        false),
  ('documents.update_template',     'DOCUMENTS',     'Modifier un template de document',                     false),
  ('documents.send_for_signature',  'DOCUMENTS',     'Envoyer un document pour signature électronique',      false),
  ('documents.void',                'DOCUMENTS',     'Annuler un document signé',                            true),
  ('documents.read',                'DOCUMENTS',     'Consulter les documents',                              false),
  -- Approvals
  ('approvals.read',                'APPROVALS',     'Consulter les demandes d''approbation',                false),
  ('approvals.approve',             'APPROVALS',     'Approuver une demande',                                false),
  ('approvals.reject',              'APPROVALS',     'Rejeter une demande',                                  false),
  ('approvals.delegate',            'APPROVALS',     'Déléguer une approbation à un autre utilisateur',      false),
  -- Valuations
  ('valuations.run',                'VALUATIONS',    'Lancer une valorisation IFRS 2',                       false),
  ('valuations.read',               'VALUATIONS',    'Consulter les résultats de valorisation',              false),
  -- Compliance
  ('compliance.read',               'COMPLIANCE',    'Consulter les alertes de conformité',                  false),
  ('compliance.acknowledge_alert',  'COMPLIANCE',    'Acquitter une alerte de conformité',                   false),
  ('compliance.configure_rules',    'COMPLIANCE',    'Configurer les règles de conformité de l''organisation', true),
  -- Organization
  ('org.manage_members',            'ORGANIZATION',  'Gérer les membres et invitations',                     true),
  ('org.manage_billing',            'ORGANIZATION',  'Gérer la facturation et l''abonnement',                true),
  ('org.manage_settings',           'ORGANIZATION',  'Gérer les paramètres de l''organisation',              true),
  -- Audit
  ('audit.read',                    'AUDIT',         'Consulter le journal d''audit',                        false),
  ('audit.export',                  'AUDIT',         'Exporter le journal d''audit',                         false),
  -- Reports
  ('reports.generate',              'REPORTS',       'Générer un rapport (IFRS 2, DSN, audit)',              false),
  ('reports.read',                  'REPORTS',       'Consulter les rapports générés',                       false)
ON CONFLICT (code) DO UPDATE
  SET category = EXCLUDED.category,
      description = EXCLUDED.description,
      is_dangerous = EXCLUDED.is_dangerous;

-- --------------------------------------------------------------------------
-- 2. role_permissions (5 rôles standard)
-- --------------------------------------------------------------------------

-- OWNER : tout sauf les actions purement bénéficiaire
INSERT INTO role_permissions (role, permission_code)
SELECT 'OWNER', code FROM permissions_catalog WHERE code NOT IN ('awards.read.own', 'awards.exercise')
ON CONFLICT DO NOTHING;

-- ADMIN_HR : opérations RH/plans/docs/valorisation, pas de gouvernance ni audit
INSERT INTO role_permissions (role, permission_code) VALUES
  ('ADMIN_HR', 'plans.create'),
  ('ADMIN_HR', 'plans.read'),
  ('ADMIN_HR', 'plans.update'),
  ('ADMIN_HR', 'plans.lock'),
  ('ADMIN_HR', 'awards.propose'),
  ('ADMIN_HR', 'awards.read.all'),
  ('ADMIN_HR', 'awards.update'),
  ('ADMIN_HR', 'awards.cancel'),
  ('ADMIN_HR', 'awards.modify'),
  ('ADMIN_HR', 'beneficiaries.create'),
  ('ADMIN_HR', 'beneficiaries.read'),
  ('ADMIN_HR', 'beneficiaries.update'),
  ('ADMIN_HR', 'captable.read'),
  ('ADMIN_HR', 'captable.export'),
  ('ADMIN_HR', 'documents.create_template'),
  ('ADMIN_HR', 'documents.update_template'),
  ('ADMIN_HR', 'documents.send_for_signature'),
  ('ADMIN_HR', 'documents.read'),
  ('ADMIN_HR', 'approvals.read'),
  ('ADMIN_HR', 'valuations.run'),
  ('ADMIN_HR', 'valuations.read'),
  ('ADMIN_HR', 'compliance.read'),
  ('ADMIN_HR', 'reports.generate'),
  ('ADMIN_HR', 'reports.read')
ON CONFLICT DO NOTHING;

-- APPROVER : lecture + actions d'approbation
INSERT INTO role_permissions (role, permission_code) VALUES
  ('APPROVER', 'plans.read'),
  ('APPROVER', 'awards.read.all'),
  ('APPROVER', 'beneficiaries.read'),
  ('APPROVER', 'captable.read'),
  ('APPROVER', 'documents.read'),
  ('APPROVER', 'approvals.read'),
  ('APPROVER', 'approvals.approve'),
  ('APPROVER', 'approvals.reject'),
  ('APPROVER', 'approvals.delegate'),
  ('APPROVER', 'valuations.read'),
  ('APPROVER', 'compliance.read'),
  ('APPROVER', 'reports.read')
ON CONFLICT DO NOTHING;

-- AUDITOR : lecture seule + audit + export
INSERT INTO role_permissions (role, permission_code) VALUES
  ('AUDITOR', 'plans.read'),
  ('AUDITOR', 'awards.read.all'),
  ('AUDITOR', 'beneficiaries.read'),
  ('AUDITOR', 'captable.read'),
  ('AUDITOR', 'captable.export'),
  ('AUDITOR', 'documents.read'),
  ('AUDITOR', 'approvals.read'),
  ('AUDITOR', 'valuations.read'),
  ('AUDITOR', 'compliance.read'),
  ('AUDITOR', 'audit.read'),
  ('AUDITOR', 'audit.export'),
  ('AUDITOR', 'reports.read'),
  ('AUDITOR', 'reports.generate')
ON CONFLICT DO NOTHING;

-- BENEFICIARY : minimal
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'awards.read.own'),
  ('BENEFICIARY', 'awards.exercise'),
  ('BENEFICIARY', 'documents.read')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 3. compliance_rules_catalog (règles fondamentales BSPCE, AGA, pool)
--    Cette liste est volontairement réduite ; le Module 12 (Compliance Engine)
--    enrichira avec l'ensemble des règles CGI / Code de Commerce.
-- --------------------------------------------------------------------------

INSERT INTO compliance_rules_catalog (code, name, description, applies_to_plan_types, category, default_enforcement, legal_reference) VALUES
  ('BSPCE_COMPANY_ELIGIBILITY',
   'Société éligible BSPCE',
   'La société doit avoir moins de 15 ans, être passible de l''IS, ne pas être issue de la concentration, restructuration, extension ou reprise d''activités préexistantes, et être détenue à 25 % au moins par des personnes physiques (directement ou indirectement).',
   ARRAY['BSPCE'],
   'ELIGIBILITY',
   'hard',
   'CGI art. 163 bis G'),
  ('BSPCE_BENEFICIARY_ELIGIBILITY',
   'Bénéficiaire éligible BSPCE',
   'Le bénéficiaire doit être salarié ou dirigeant soumis au régime fiscal des salariés, ou membre du conseil d''administration / surveillance / dirigeant exerçant une fonction technique.',
   ARRAY['BSPCE'],
   'ELIGIBILITY',
   'hard',
   'CGI art. 163 bis G I'),
  ('BSPCE_EXERCISE_PRICE',
   'Prix d''exercice BSPCE',
   'Le prix d''exercice doit être au moins égal au prix d''émission des actions souscrites par les actionnaires lors de la dernière augmentation de capital, ou à la valeur réelle de l''action si l''augmentation date de plus de 6 mois.',
   ARRAY['BSPCE'],
   'QUANTITY',
   'hard',
   'CGI art. 163 bis G II'),
  ('AGA_MIN_VESTING_1Y',
   'Période d''acquisition minimale AGA (1 an)',
   'Pour une AGA, la période d''acquisition (vesting) doit être d''au moins un an.',
   ARRAY['AGA'],
   'TIMING',
   'hard',
   'Code de commerce L. 225-197-1'),
  ('AGA_MIN_HOLDING_1Y',
   'Période de conservation minimale AGA (1 an)',
   'Pour une AGA, la période d''acquisition + conservation cumulée doit être d''au moins 2 ans (régime de faveur fiscal/social).',
   ARRAY['AGA'],
   'TIMING',
   'soft',
   'Code de commerce L. 225-197-1'),
  ('AGA_10PCT_CAPITAL',
   'Plafond 10 % du capital pour AGA',
   'Le total des actions attribuées gratuitement ne peut excéder 10 % du capital social (15 % pour PME, 30 % avec ratio).',
   ARRAY['AGA'],
   'QUANTITY',
   'hard',
   'Code de commerce L. 225-197-1 II'),
  ('AGA_AUTHORIZATION_38_MONTHS',
   'Validité autorisation AGE pour AGA (38 mois)',
   'L''autorisation de l''Assemblée Générale Extraordinaire pour des AGA est valide pendant 38 mois maximum.',
   ARRAY['AGA'],
   'PROCEDURE',
   'hard',
   'Code de commerce L. 225-197-1 I'),
  ('PLAN_POOL_NOT_OVERFLOW',
   'Pool du plan non dépassé',
   'La somme des units attribuées (allocated) ne peut excéder pool_size du plan.',
   ARRAY['BSPCE','AGA','STOCK_OPTION','BSA','RSU','PERFORMANCE_SHARE','PHANTOM','ESOP','SAR'],
   'QUANTITY',
   'hard',
   NULL),
  ('PLAN_POOL_BURNOUT_WARNING',
   'Alerte pool > 80 % consommé',
   'Lorsque le pool d''un plan dépasse 80 % de consommation, une alerte est levée pour anticiper l''ouverture d''un nouveau plan.',
   ARRAY['BSPCE','AGA','STOCK_OPTION','BSA','RSU','PERFORMANCE_SHARE','PHANTOM','ESOP','SAR'],
   'QUANTITY',
   'soft',
   NULL),
  ('AWARD_EXPIRY_BSPCE_10Y',
   'Durée de validité BSPCE (10 ans max)',
   'Les BSPCE sont en pratique attribués pour une durée maximale de 10 ans à compter de leur attribution.',
   ARRAY['BSPCE'],
   'TIMING',
   'soft',
   'Pratique de marché')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      applies_to_plan_types = EXCLUDED.applies_to_plan_types,
      category = EXCLUDED.category,
      default_enforcement = EXCLUDED.default_enforcement,
      legal_reference = EXCLUDED.legal_reference;

-- --------------------------------------------------------------------------
-- 4. notification_templates (emails transactionnels minimaux)
--    Variables {{xxx}} interpolées par le moteur Resend (lib/resend).
-- --------------------------------------------------------------------------

INSERT INTO notification_templates (code, channel, locale, subject, body_template, available_variables) VALUES
  ('USER_INVITED',
   'EMAIL',
   'fr-FR',
   'Vous êtes invité à rejoindre {{org_name}} sur Capiwise',
   'Bonjour {{full_name}},\n\n{{inviter_name}} vous invite à rejoindre l''organisation {{org_name}} sur Capiwise.\n\nCliquez sur le lien suivant pour accepter l''invitation et créer votre compte :\n{{invitation_url}}\n\nCe lien expire le {{expires_at}}.\n\nL''équipe Capiwise',
   '{"full_name":"string","inviter_name":"string","org_name":"string","invitation_url":"string","expires_at":"date"}'::jsonb),
  ('AWARD_PROPOSED',
   'EMAIL',
   'fr-FR',
   'Une nouvelle attribution vous est proposée — Capiwise',
   'Bonjour {{beneficiary_name}},\n\nUne attribution de {{units}} {{plan_type}} vous est proposée par {{org_name}}.\n\nConsultez les détails et acceptez votre attribution :\n{{award_url}}\n\nL''équipe Capiwise',
   '{"beneficiary_name":"string","units":"number","plan_type":"string","org_name":"string","award_url":"string"}'::jsonb),
  ('AWARD_GRANTED',
   'EMAIL',
   'fr-FR',
   'Votre attribution est confirmée — Capiwise',
   'Bonjour {{beneficiary_name}},\n\nVotre attribution n° {{award_number}} de {{units}} {{plan_type}} est désormais effective.\n\nDate d''attribution : {{grant_date}}\nDébut du vesting : {{vesting_start_date}}\n\nVous pouvez consulter votre attribution dans votre espace bénéficiaire :\n{{award_url}}\n\nL''équipe Capiwise',
   '{"beneficiary_name":"string","award_number":"string","units":"number","plan_type":"string","grant_date":"date","vesting_start_date":"date","award_url":"string"}'::jsonb),
  ('VESTING_OCCURRED',
   'EMAIL',
   'fr-FR',
   '{{units_vested}} de vos {{plan_type}} viennent de vester — Capiwise',
   'Bonjour {{beneficiary_name}},\n\n{{units_vested}} de vos {{plan_type}} (attribution n° {{award_number}}) viennent de vester ce {{effective_date}}.\n\nTotal vesté à ce jour : {{total_vested}} / {{total_granted}}.\n\nConsultez votre attribution :\n{{award_url}}\n\nL''équipe Capiwise',
   '{"beneficiary_name":"string","award_number":"string","plan_type":"string","units_vested":"number","total_vested":"number","total_granted":"number","effective_date":"date","award_url":"string"}'::jsonb),
  ('EXERCISE_REQUESTED',
   'EMAIL',
   'fr-FR',
   'Demande d''exercice à approuver — {{beneficiary_name}}',
   'Bonjour,\n\n{{beneficiary_name}} a demandé l''exercice de {{units}} {{plan_type}} (attribution n° {{award_number}}).\n\nMontant total à régler : {{total_amount}} €.\n\nApprouvez ou rejetez la demande :\n{{request_url}}\n\nL''équipe Capiwise',
   '{"beneficiary_name":"string","award_number":"string","plan_type":"string","units":"number","total_amount":"number","request_url":"string"}'::jsonb),
  ('EXERCISE_APPROVED',
   'EMAIL',
   'fr-FR',
   'Votre demande d''exercice est approuvée — Capiwise',
   'Bonjour {{beneficiary_name}},\n\nVotre demande d''exercice n° {{request_number}} pour {{units}} {{plan_type}} a été approuvée.\n\nMerci de procéder au règlement de {{total_amount}} € selon les instructions communiquées par votre administrateur.\n\nDétails :\n{{request_url}}\n\nL''équipe Capiwise',
   '{"beneficiary_name":"string","request_number":"string","plan_type":"string","units":"number","total_amount":"number","request_url":"string"}'::jsonb),
  ('SIGNATURE_REQUESTED',
   'EMAIL',
   'fr-FR',
   'Document à signer — {{document_title}}',
   'Bonjour {{signer_name}},\n\nVous êtes invité à signer le document suivant :\n\n{{document_title}}\n\nSignez en ligne (Yousign) :\n{{sign_url}}\n\nCe lien expire le {{expires_at}}.\n\nL''équipe Capiwise',
   '{"signer_name":"string","document_title":"string","sign_url":"string","expires_at":"date"}'::jsonb),
  ('COMPLIANCE_ALERT',
   'EMAIL',
   'fr-FR',
   '[{{severity}}] Alerte de conformité — {{rule_name}}',
   'Bonjour,\n\nUne alerte de conformité a été levée :\n\nRègle : {{rule_name}}\nSévérité : {{severity}}\nSujet : {{subject_type}} #{{subject_id}}\n\nMessage :\n{{message}}\n\nConsultez les détails dans Capiwise :\n{{alert_url}}\n\nL''équipe Capiwise',
   '{"severity":"string","rule_name":"string","subject_type":"string","subject_id":"string","message":"string","alert_url":"string"}'::jsonb)
ON CONFLICT (code) DO UPDATE
  SET subject = EXCLUDED.subject,
      body_template = EXCLUDED.body_template,
      available_variables = EXCLUDED.available_variables,
      is_active = true;

-- ===========================================================================
-- Fin de la migration 00003 — Seed des référentiels
-- ===========================================================================
