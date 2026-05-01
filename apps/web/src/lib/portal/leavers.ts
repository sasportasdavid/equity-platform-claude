import type { LeaverTreatment } from '@equity/shared';

/**
 * Module 8 B4 — Helper labels FR pour le simulateur de départ.
 *
 * Source des labels alignée sur Module 3a `Step7Review.tsx` (wizard plan)
 * + recon B4 SQL (DISTINCT leaver_type FROM awards.leaver_rules_snapshot).
 *
 * 8 leaver_types lowercase observés en DB :
 *   resignation / retirement / death / company_sale / mutual_agreement /
 *   end_of_contract / termination_cause / termination_no_cause
 *
 * 5 treatments lowercase observés en DB :
 *   forfeit_all / keep_vested / pro_rata / accelerate / full_accelerate
 */

export const LEAVER_TYPE_LABELS_FR: Record<string, string> = {
  resignation: 'Démission',
  retirement: 'Retraite',
  death: 'Décès',
  company_sale: 'Cession de la société',
  mutual_agreement: 'Rupture conventionnelle',
  end_of_contract: 'Fin de contrat',
  termination_cause: 'Licenciement (faute)',
  termination_no_cause: 'Licenciement (sans faute)',
};

export const TREATMENT_LABELS_FR: Record<LeaverTreatment, string> = {
  forfeit_all: 'Toutes les unités sont perdues',
  pro_rata: 'Pro rata sur les unités acquises',
  keep_vested: 'Vous conservez les unités déjà acquises',
  accelerate: 'Acquisition accélérée partielle',
  full_accelerate: 'Acquisition accélérée totale',
};

export const TREATMENT_DESCRIPTIONS_FR: Record<LeaverTreatment, string> = {
  forfeit_all: 'Vous perdez toutes vos unités, y compris celles déjà acquises au moment du départ.',
  pro_rata: 'Vous conservez les unités acquises au prorata du temps passé dans l’entreprise.',
  keep_vested:
    'Vous gardez les unités déjà acquises au moment du départ. Les unités non acquises sont perdues.',
  accelerate:
    'En plus des unités déjà acquises, certaines unités futures sont acquises immédiatement (selon la durée d’accélération prévue).',
  full_accelerate:
    'Toutes vos unités non encore acquises sont acquises immédiatement, indépendamment du calendrier prévu.',
};

/**
 * 3 catégories visuelles pour styliser le résultat :
 *   - 'negative' (rouge)  : forfeit_all
 *   - 'neutral'  (gris)   : keep_vested, pro_rata
 *   - 'positive' (vert)   : accelerate, full_accelerate
 */
export type TreatmentTone = 'negative' | 'neutral' | 'positive';

export function getTreatmentTone(treatment: string): TreatmentTone {
  if (treatment === 'forfeit_all') return 'negative';
  if (treatment === 'accelerate' || treatment === 'full_accelerate') return 'positive';
  return 'neutral';
}

export function getLeaverTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return LEAVER_TYPE_LABELS_FR[type] ?? type;
}

export function getTreatmentLabel(treatment: string | null | undefined): string {
  if (!treatment) return '—';
  return TREATMENT_LABELS_FR[treatment as LeaverTreatment] ?? treatment;
}

export function getTreatmentDescription(treatment: string | null | undefined): string {
  if (!treatment) return '';
  return TREATMENT_DESCRIPTIONS_FR[treatment as LeaverTreatment] ?? '';
}

/**
 * Extrait la liste des leaver_types disponibles depuis le snapshot d'un
 * award. Limite la combobox aux types réellement définis dans le contrat
 * (pas de "GOOD_LEAVER" générique exposé V1).
 *
 * Retourne un tableau (vide si snapshot mal formé).
 *
 * Sécurité : on ne retourne QUE les `leaver_type`, pas les `treatment` ni
 * les `acceleration_months` / `exercise_window_days`. Le bénéficiaire ne
 * doit pas pouvoir comparer les traitements de plusieurs types sans avoir
 * lancé une simulation (cf. spec §10 "ne JAMAIS retourner les
 * leaver_rules_snapshot complets").
 */
export function getAvailableLeaverTypes(leaverRulesSnapshot: unknown): string[] {
  if (!Array.isArray(leaverRulesSnapshot)) return [];
  const types: string[] = [];
  for (const rule of leaverRulesSnapshot) {
    if (
      rule != null &&
      typeof rule === 'object' &&
      'leaver_type' in rule &&
      typeof (rule as { leaver_type: unknown }).leaver_type === 'string'
    ) {
      types.push((rule as { leaver_type: string }).leaver_type);
    }
  }
  // Dedup en respectant l'ordre d'apparition
  return Array.from(new Set(types));
}
