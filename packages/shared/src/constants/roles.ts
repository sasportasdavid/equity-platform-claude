import { PERMISSIONS, type Permission } from './permissions';

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
 * Mapping standard rôle → permissions, miroir de la table `role_permissions`
 * en base (seedée par 00003 + 00006).
 *
 * Une org peut override ce mapping individuellement via
 * `memberships.permissions_grant` / `permissions_revoke`.
 *
 * Source de vérité runtime : la table `role_permissions`. Ce module sert
 * uniquement à la documentation et au gating UI sans round-trip RPC.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // OWNER : super-admin → tout le catalogue (Module 2 §3.2 : "tout").
  OWNER: PERMISSIONS,

  // ADMIN_HR : opérations RH/plans/awards/docs/valuations + sensible bénéficiaires.
  ADMIN_HR: [
    'org.view',
    'plans.create',
    'plans.read',
    'plans.update',
    'plans.lock',
    'companies.create',
    'companies.read',
    'companies.update',
    'awards.propose',
    'awards.read.all',
    'awards.update',
    'awards.cancel',
    'awards.modify',
    'awards.bulk_import',
    'beneficiaries.create',
    'beneficiaries.read',
    'beneficiaries.read.sensitive',
    'beneficiaries.update',
    'beneficiaries.invite',
    'captable.read',
    'captable.export',
    'captable.simulate',
    'documents.create_template',
    'documents.update_template',
    'documents.send_for_signature',
    'documents.read',
    'approvals.read',
    'valuations.run',
    'valuations.read',
    'valuations.export',
    'compliance.read',
    'compliance.acknowledge',
    'reports.generate',
    'reports.read',
  ],

  // APPROVER : lecture du contexte + actions d'approbation.
  APPROVER: [
    'org.view',
    'plans.read',
    'awards.read.all',
    'awards.approve',
    'beneficiaries.read',
    'captable.read',
    'documents.read',
    'approvals.read',
    'approvals.approve',
    'approvals.reject',
    'approvals.delegate',
    'approvals.act',
    'valuations.read',
    'compliance.read',
    'audit.read',
    'reports.read',
  ],

  // AUDITOR : lecture seule complète + audit + exports.
  AUDITOR: [
    'org.view',
    'plans.read',
    'awards.read.all',
    'beneficiaries.read',
    'captable.read',
    'captable.export',
    'documents.read',
    'approvals.read',
    'valuations.read',
    'valuations.export',
    'compliance.read',
    'audit.read',
    'audit.export',
    'reports.read',
    'reports.generate',
  ],

  // BENEFICIARY : son propre périmètre.
  BENEFICIARY: ['awards.read.own', 'awards.exercise', 'documents.read', 'documents.read.own'],
};
