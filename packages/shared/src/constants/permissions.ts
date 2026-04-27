/**
 * Catalogue exhaustif des permissions granulaires.
 *
 * Module 1 §3.3 a livré 41 permissions ; Module 2 §3.1 (migration 00005)
 * en ajoute 20 (granularité supplémentaire : org.view, companies.*,
 * .read.sensitive, .bulk_import, .read.own, .archive, .edit, .override,
 * .acknowledge, .configure, .dsn_export).
 *
 * Source de vérité runtime : la table `permissions_catalog`.
 * Ce module ne sert qu'au typage TypeScript côté front.
 */
export const PERMISSIONS = [
  // Plans
  'plans.create',
  'plans.read',
  'plans.update',
  'plans.delete',
  'plans.lock',

  // Awards
  'awards.propose',
  'awards.approve',
  'awards.read.own',
  'awards.read.all',
  'awards.update',
  'awards.exercise',
  'awards.cancel',
  'awards.modify',
  'awards.bulk_import', // M2

  // Beneficiaries
  'beneficiaries.create',
  'beneficiaries.read',
  'beneficiaries.read.sensitive', // M2 — déchiffrement données sensibles
  'beneficiaries.update',
  'beneficiaries.delete',
  'beneficiaries.invite', // M2 — envoi d'invitation au portail

  // Cap table
  'captable.read',
  'captable.export',
  'captable.simulate',
  'captable.edit', // M2

  // Documents & signatures
  'documents.create_template',
  'documents.update_template',
  'documents.send_for_signature',
  'documents.void',
  'documents.read',
  'documents.read.own', // M2 — bénéficiaire voit SES propres docs
  'documents.archive', // M2

  // Approvals
  'approvals.read',
  'approvals.approve',
  'approvals.reject',
  'approvals.delegate',
  'approvals.act', // M2 — alias combiné approve/reject
  'approvals.configure', // M2 — workflows

  // Valuations
  'valuations.run',
  'valuations.read',
  'valuations.export', // M2

  // Compliance
  'compliance.read',
  'compliance.acknowledge_alert',
  'compliance.configure_rules',
  'compliance.acknowledge', // M2 — alias court
  'compliance.override', // M2 — outrepasser un blocage soft
  'compliance.configure', // M2 — alias court de configure_rules

  // Organization
  'org.view', // M2
  'org.update', // M2
  'org.delete', // M2
  'org.manage_members',
  'org.manage_billing',
  'org.manage_settings',

  // Companies
  'companies.create', // M2
  'companies.read', // M2
  'companies.update', // M2
  'companies.delete', // M2

  // Audit
  'audit.read',
  'audit.export',

  // Reporting
  'reports.generate',
  'reports.read',
  'reports.dsn_export', // M2 — DSN spécifique
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Catégories utilisées dans `permissions_catalog.category` (référentiel). */
export const PERMISSION_CATEGORIES = {
  plans: 'PLANS',
  awards: 'AWARDS',
  beneficiaries: 'BENEFICIARIES',
  captable: 'CAP_TABLE',
  documents: 'DOCUMENTS',
  approvals: 'APPROVALS',
  valuations: 'VALUATIONS',
  compliance: 'COMPLIANCE',
  org: 'ORGANIZATION',
  companies: 'COMPANIES', // M2
  audit: 'AUDIT',
  reports: 'REPORTS',
} as const;
