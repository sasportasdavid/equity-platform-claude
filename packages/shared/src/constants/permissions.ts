/**
 * Catalogue exhaustif des permissions granulaires (Module 1 §3.3).
 * Les rôles mappent vers des sous-ensembles de ces permissions via
 * `role_permissions` (table seedée par 00003_seed_referentials.sql).
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

  // Beneficiaries
  'beneficiaries.create',
  'beneficiaries.read',
  'beneficiaries.update',
  'beneficiaries.delete',

  // Cap table
  'captable.read',
  'captable.export',
  'captable.simulate',

  // Documents & signatures
  'documents.create_template',
  'documents.update_template',
  'documents.send_for_signature',
  'documents.void',
  'documents.read',

  // Approvals
  'approvals.read',
  'approvals.approve',
  'approvals.reject',
  'approvals.delegate',

  // Valuations
  'valuations.run',
  'valuations.read',

  // Compliance
  'compliance.read',
  'compliance.acknowledge_alert',
  'compliance.configure_rules',

  // Organization
  'org.manage_members',
  'org.manage_billing',
  'org.manage_settings',

  // Audit
  'audit.read',
  'audit.export',

  // Reporting
  'reports.generate',
  'reports.read',
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
  audit: 'AUDIT',
  reports: 'REPORTS',
} as const;
