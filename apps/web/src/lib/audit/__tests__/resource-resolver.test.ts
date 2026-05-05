import { describe, expect, it } from 'vitest';
import { resolveResource } from '../resource-resolver';

const SAMPLE_UUID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

describe('resolveResource — UPPERCASE convention (PR #41 B3)', () => {
  it('PLAN → /dashboard/plans/{id}', () => {
    const r = resolveResource('PLAN', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBe(`/dashboard/plans/${SAMPLE_UUID}`);
  });

  it('AWARD → /dashboard/awards/{id}', () => {
    const r = resolveResource('AWARD', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBe(`/dashboard/awards/${SAMPLE_UUID}`);
  });

  it('BENEFICIARY → /dashboard/beneficiaries/{id}', () => {
    const r = resolveResource('BENEFICIARY', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBe(`/dashboard/beneficiaries/${SAMPLE_UUID}`);
  });

  it('VALUATION_RUN → /dashboard/valuations/runs/{id} (note runs/ segment)', () => {
    const r = resolveResource('VALUATION_RUN', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBe(`/dashboard/valuations/runs/${SAMPLE_UUID}`);
  });

  it('USER → exists true mais href null (pas de page user)', () => {
    const r = resolveResource('USER', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });

  it('MEMBERSHIP → exists true mais href null', () => {
    const r = resolveResource('MEMBERSHIP', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });

  it('DOCUMENT → exists true mais href null V1.5 (pas de route détail)', () => {
    const r = resolveResource('DOCUMENT', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });
});

describe('resolveResource — snake_case convention (PR #41 B3)', () => {
  it('approval_request → /dashboard/approvals/{id}', () => {
    const r = resolveResource('approval_request', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBe(`/dashboard/approvals/${SAMPLE_UUID}`);
  });

  it('approval_decision → exists true mais href null (sub-resource)', () => {
    const r = resolveResource('approval_decision', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });

  it('document_instance → exists true mais href null', () => {
    const r = resolveResource('document_instance', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });

  it('signature_request → exists true mais href null', () => {
    const r = resolveResource('signature_request', SAMPLE_UUID);
    expect(r.exists).toBe(true);
    expect(r.href).toBeNull();
  });
});

describe('resolveResource — edge cases (PR #41 B3)', () => {
  it('type inconnu → exists false', () => {
    const r = resolveResource('SOMETHING_WEIRD', SAMPLE_UUID);
    expect(r.exists).toBe(false);
    expect(r.href).toBeNull();
  });

  it('resourceType null → exists false', () => {
    const r = resolveResource(null, SAMPLE_UUID);
    expect(r.exists).toBe(false);
    expect(r.href).toBeNull();
  });

  it('resourceId null → exists false', () => {
    const r = resolveResource('PLAN', null);
    expect(r.exists).toBe(false);
    expect(r.href).toBeNull();
  });

  it('case-insensitive lookup : "Plan", "plan", "PLAN" → tous résolus', () => {
    expect(resolveResource('Plan', SAMPLE_UUID).href).toBe(`/dashboard/plans/${SAMPLE_UUID}`);
    expect(resolveResource('plan', SAMPLE_UUID).href).toBe(`/dashboard/plans/${SAMPLE_UUID}`);
    expect(resolveResource('PLAN', SAMPLE_UUID).href).toBe(`/dashboard/plans/${SAMPLE_UUID}`);
  });

  it('label depuis metadata.plan_name si disponible', () => {
    const r = resolveResource('PLAN', SAMPLE_UUID, { plan_name: 'BSPCE-2026-001' });
    expect(r.label).toBe('BSPCE-2026-001');
  });

  it('label depuis metadata.beneficiary_name pour BENEFICIARY', () => {
    const r = resolveResource('BENEFICIARY', SAMPLE_UUID, {
      beneficiary_name: 'Marie Lambert',
    });
    expect(r.label).toBe('Marie Lambert');
  });

  it('label fallback si metadata absent : "TYPE · #xxxxxxxx"', () => {
    const r = resolveResource('AWARD', SAMPLE_UUID);
    expect(r.label.startsWith('AWARD · #')).toBe(true);
    expect(r.label.length).toBeGreaterThan('AWARD · #'.length);
  });

  it('label préserve le casing original (UPPERCASE vs snake)', () => {
    expect(resolveResource('AWARD', SAMPLE_UUID).label.startsWith('AWARD')).toBe(true);
    expect(
      resolveResource('approval_request', SAMPLE_UUID).label.startsWith('approval_request'),
    ).toBe(true);
  });
});
