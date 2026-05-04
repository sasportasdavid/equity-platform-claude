/**
 * Module 12 B4 — Pure helpers extraits des composants compliance
 * pour tests Vitest unitaires (pas de DOM).
 *
 * - Validation des params (single field bornes + cross-field ESOP)
 * - Formattage des values pour affichage
 * - Mapping audit events → labels FR
 * - Détection des rules à comportement mixte (badge tooltip)
 */

import type { ParamField } from '@equity/shared';

/**
 * Anomalie connue : `HIRE_DATE_REASONABLE` est `severity_default='warning'`
 * en DB mais son checker code peut émettre 'ERROR' si année < 1900.
 * Cf inventaire B3a §"Anomalies détectées".
 *
 * UI : badge "⚠️ Comportement mixte" + tooltip explicatif sur ces rules.
 */
export const MIXED_SEVERITY_RULES = new Set<string>(['HIRE_DATE_REASONABLE']);

export function isMixedSeverity(ruleCode: string): boolean {
  return MIXED_SEVERITY_RULES.has(ruleCode);
}

/**
 * Format une value de param pour affichage UI (chips).
 *  - number → fr-FR (séparateur milliers)
 *  - boolean → "oui" / "non"
 *  - string → tel quel
 *  - null/undefined → "—"
 */
export function formatParamValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (value == null) return '—';
  return String(value);
}

/**
 * Validation single-field selon `params_schema` :
 *   - integer / number : type + bornes min/max
 *   - boolean / string : type seul
 *
 * Retourne `null` si OK, ou un message d'erreur court (FR).
 */
export function validateField(field: ParamField, raw: unknown): string | null {
  if (raw === '' || raw === undefined || raw === null) return 'Champ requis';
  if (field.type === 'integer') {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Doit être un entier';
    if (field.min !== undefined && n < field.min) return `Min ${field.min}`;
    if (field.max !== undefined && n > field.max) return `Max ${field.max}`;
    return null;
  }
  if (field.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'Doit être un nombre';
    if (field.min !== undefined && n < field.min) return `Min ${field.min}`;
    if (field.max !== undefined && n > field.max) return `Max ${field.max}`;
    return null;
  }
  if (field.type === 'boolean') {
    if (typeof raw !== 'boolean') return 'Doit être un booléen';
    return null;
  }
  if (field.type === 'string') {
    if (typeof raw !== 'string' || raw.length === 0) return 'Texte requis';
    return null;
  }
  return null;
}

/**
 * Validation cross-field spéciale par rule_code.
 *
 * V1 : seulement `ESOP_PERCENT_BEST_PRACTICE` (minPct < maxPct).
 * V2+ : ajouter ici si d'autres rules paramétriques avec contraintes ordinales.
 */
export function validateCrossField(
  ruleCode: string,
  values: Record<string, number | string | boolean>,
): string | null {
  if (ruleCode === 'ESOP_PERCENT_BEST_PRACTICE') {
    const minPct = values.minPct;
    const maxPct = values.maxPct;
    if (typeof minPct === 'number' && typeof maxPct === 'number' && minPct >= maxPct) {
      return `Plancher (${minPct}%) doit être < Plafond (${maxPct}%)`;
    }
  }
  return null;
}

/**
 * Mapping audit event_type → label FR pour la timeline UI.
 */
export function eventLabel(eventType: string): string {
  if (eventType === 'compliance_rule.activated') return 'Activée';
  if (eventType === 'compliance_rule.deactivated') return 'Désactivée';
  if (eventType === 'compliance_rule.params_updated') return 'Paramètres modifiés';
  if (eventType === 'compliance_rule.reset_all') return 'Réinitialisation globale';
  return eventType;
}

/**
 * Calcule le diff entre deux records pour audit.
 * Utilisé indirectement (Server Action B3b) — exposé ici pour cohérence.
 */
export function computeParamsDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }
  return diff;
}
