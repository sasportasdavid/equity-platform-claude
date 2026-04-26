import type { Permission } from './permissions';

/**
 * Les 5 rôles principaux (Module 1 §0.4).
 * Cumulables via `memberships.roles[]`.
 */
export const ROLES = ['OWNER', 'ADMIN_HR', 'APPROVER', 'AUDITOR', 'BENEFICIARY'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Propriétaire',
  ADMIN_HR: 'Admin RH',
  APPROVER: 'Approbateur',
  AUDITOR: 'Auditeur',
  BENEFICIARY: 'Bénéficiaire',
};

/**
 * Mapping standard rôle → permissions, seedé dans `role_permissions`.
 * Une org peut override ce mapping en grant/revoke individuellement
 * via `memberships.permissions_grant` / `permissions_revoke`.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    // OWNER a tout sauf les actions purement bénéficiaire
    'plans.create',
    'plans.read',
    'plans.update',
    'plans.delete',
    'plans.lock',
    'awards.propose',
    'awards.approve',
    'awards.read.all',
    'awards.update',
    'awards.cancel',
    'awards.modify',
    'beneficiaries.create',
    'beneficiaries.read',
    'beneficiaries.update',
    'beneficiaries.delete',
    'captable.read',
    'captable.export',
    'captable.simulate',
    'documents.create_template',
    'documents.update_template',
    'documents.send_for_signature',
    'documents.void',
    'documents.read',
    'approvals.read',
    'approvals.approve',
    'approvals.reject',
    'approvals.delegate',
    'valuations.run',
    'valuations.read',
    'compliance.read',
    'compliance.acknowledge_alert',
    'compliance.configure_rules',
    'org.manage_members',
    'org.manage_billing',
    'org.manage_settings',
    'audit.read',
    'audit.export',
    'reports.generate',
    'reports.read',
  ],
  ADMIN_HR: [
    'plans.create',
    'plans.read',
    'plans.update',
    'plans.lock',
    'awards.propose',
    'awards.read.all',
    'awards.update',
    'awards.cancel',
    'awards.modify',
    'beneficiaries.create',
    'beneficiaries.read',
    'beneficiaries.update',
    'captable.read',
    'captable.export',
    'documents.create_template',
    'documents.update_template',
    'documents.send_for_signature',
    'documents.read',
    'approvals.read',
    'valuations.run',
    'valuations.read',
    'compliance.read',
    'reports.generate',
    'reports.read',
  ],
  APPROVER: [
    'plans.read',
    'awards.read.all',
    'beneficiaries.read',
    'captable.read',
    'documents.read',
    'approvals.read',
    'approvals.approve',
    'approvals.reject',
    'approvals.delegate',
    'valuations.read',
    'compliance.read',
    'reports.read',
  ],
  AUDITOR: [
    'plans.read',
    'awards.read.all',
    'beneficiaries.read',
    'captable.read',
    'captable.export',
    'documents.read',
    'approvals.read',
    'valuations.read',
    'compliance.read',
    'audit.read',
    'audit.export',
    'reports.read',
    'reports.generate',
  ],
  BENEFICIARY: [
    'awards.read.own',
    'awards.exercise',
    'documents.read', // les siens uniquement, RLS-filtré
  ],
};
