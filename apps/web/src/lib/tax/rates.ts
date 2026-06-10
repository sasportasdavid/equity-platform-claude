/**
 * Taux fiscaux français 2026 — sources officielles LEGIFRANCE / BOFiP.
 *
 * ⚠ Ces taux ont changé en 2026 (hausse CSG 9,2 → 10,6 sur revenus
 * du capital). Ne pas extrapoler depuis 2024/2025.
 */

/**
 * Barème IR 2026 (revenus 2025) — Loi finances n° 2026-103 du 19 février
 * 2026 art. 4 (revalorisation +0,9%).
 *
 * Source : https://www.service-public.gouv.fr/particuliers/vosdroits/F1419
 */
export type TaxBracket = {
  /** Plancher (inclus). Le premier bracket commence à 0. */
  min: number;
  /** Plafond (inclus). null = au-delà. */
  max: number | null;
  /** Taux marginal (0..1). */
  rate: number;
};

export const TAX_BRACKETS_2026: readonly TaxBracket[] = [
  { min: 0, max: 11_600, rate: 0 },
  { min: 11_601, max: 29_579, rate: 0.11 },
  { min: 29_580, max: 84_577, rate: 0.3 },
  { min: 84_578, max: 181_917, rate: 0.41 },
  { min: 181_918, max: null, rate: 0.45 },
] as const;

/**
 * Prélèvements sociaux 2026 — LFSS n° 2025-1403 du 30 décembre 2025
 * art. 12 (hausse CSG 9,2% → 10,6% pour revenus du capital).
 *
 * Détail : 10,6% CSG + 0,5% CRDS + 7,5% prélèvement de solidarité.
 *
 * Source : https://www.dlapiper.com/fr-fr/insights/publications/2026/01/loi-de-finance-de-la-securite-sociale-2026
 */
export const PS_CAPITAL_GAINS_2026 = 0.186;

/** Flat tax IR (PFU) 2026 sur valeurs mobilières. Inchangé. */
export const PFU_IR_2026 = 0.128;

/** PFU total = IR + PS (12,8 + 18,6 = 31,4%). */
export const PFU_TOTAL_2026 = PFU_IR_2026 + PS_CAPITAL_GAINS_2026;

/**
 * CSG/CRDS revenus d'activité 2026 — assiette salaires (SO/AGA gain
 * d'acquisition). Inchangé depuis 2018.
 *
 * Détail : 7,5% CSG non déductible + 2,2% CSG déductible + 0,5% CRDS
 * = 9,7% (V1 forfait simplifié).
 */
export const CSG_CRDS_ACTIVITY_2026 = 0.097;

/**
 * Forfait cotisations sociales salariales pour Stock Options non-qualifiées
 * (V1 forfait simplifié).
 *
 * TODO V2 : décliner par tranche de plafond SS + cas par cas selon
 * convention collective.
 */
export const SO_NON_QUALIFIE_SOCIAL_CONTRIB_2026 = 0.097;

/**
 * Contribution salariale spécifique de 10% (CSS art. L 137-14).
 *
 * - AGA post-2018 : due UNIQUEMENT sur la fraction du gain d'acquisition
 *   > 300 000 € (la fraction ≤ 300 000 € relève des prélèvements sociaux
 *   du capital, sans contribution salariale).
 * - Stock-options attribuées depuis le 28/09/2012 : due sur l'intégralité
 *   du gain de levée (PV d'acquisition).
 *
 * Source : CSS art. L 137-14 ; BOFiP BOI-RSA-ES-20-20.
 */
export const SALARIAL_CONTRIBUTION_10_2026 = 0.1;

/**
 * @deprecated Alias historique. Utiliser `SALARIAL_CONTRIBUTION_10_2026`.
 * Conservé pour ne pas casser d'éventuels imports externes.
 */
export const AGA_CONTRIBUTION_SALARIALE_2026 = SALARIAL_CONTRIBUTION_10_2026;

/**
 * Prélèvements sociaux sur revenus du capital applicables au gain
 * d'acquisition AGA post-2018 pour la fraction ≤ 300 000 €.
 *
 * Réf. CGI art. 80 quaterdecies / CSS art. L 136-6 : cette fraction est
 * assimilée à une plus-value mobilière et supporte les PS du capital
 * (CSG capital + CRDS + prélèvement de solidarité), au taux 2026 de
 * 18,6% (cf. PS_CAPITAL_GAINS_2026), SANS contribution salariale 10%.
 *
 * Aliasé sur PS_CAPITAL_GAINS_2026 : même assiette « capital ».
 */
export const AGA_ACQUISITION_PS_CAPITAL_2026 = PS_CAPITAL_GAINS_2026;

/**
 * Seuil de 300 000 € (CGI art. 80 quaterdecies / CSS art. L 137-14)
 * séparant, pour le gain d'acquisition AGA post-2018 :
 *   - la fraction ≤ 300 000 € → PS du capital (18,6%), pas de contrib 10%
 *   - la fraction > 300 000 €  → régime salaire (CSG activité 9,7% +
 *     contribution salariale 10%)
 *
 * Numériquement identique au plafond d'abattement IR
 * (AGA_ABATTEMENT_THRESHOLD), mais distinct sémantiquement (assiette
 * sociale ≠ assiette IR). Gardé séparé pour la traçabilité.
 */
export const AGA_SOCIAL_REGIME_THRESHOLD = 300_000;

/**
 * Taux d'imposition pour BSPCE en cas d'ancienneté < 3 ans
 * (CGI art. 163 bis G — taxation majorée à défaut de seuil 3 ans).
 *
 * Source : https://www.impots.gouv.fr/particulier/questions/jai-vendu-des-bons-de-souscription-de-parts-de-createurs-dentreprise-ou-bspce
 */
export const BSPCE_LESS_3Y_IR_RATE = 0.3;

/**
 * Seuil d'ancienneté BSPCE (3 ans entre date attribution award et date
 * de cession effective des titres) ouvrant droit au PFU.
 */
export const BSPCE_SENIORITY_THRESHOLD_YEARS = 3;

/**
 * Plafond AGA pour abattement 50% sur gain d'acquisition (CGI art. 80
 * quaterdecies III, post-2018).
 */
export const AGA_ABATTEMENT_THRESHOLD = 300_000;

/** Taux d'abattement appliqué sous le plafond AGA. */
export const AGA_ABATTEMENT_RATE = 0.5;

/**
 * Année des taux ci-dessus. Permet de tracer la version utilisée dans
 * un breakdown — important pour les snapshots et l'audit.
 */
export const RATES_YEAR = 2026 as const;

/**
 * Sources officielles indexées par régime, à inclure dans le
 * TaxBreakdown.sources pour traçabilité.
 */
export const TAX_SOURCES = {
  baremeIR: {
    regime: 'Barème IR 2026 (revenus 2025)',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1419',
  },
  prelevementsSociaux: {
    regime: 'Prélèvements sociaux 2026 (CSG hausse LFSS 2026)',
    url: 'https://www.dlapiper.com/fr-fr/insights/publications/2026/01/loi-de-finance-de-la-securite-sociale-2026',
  },
  bspce: {
    regime: 'BSPCE — CGI art. 163 bis G',
    url: 'https://www.impots.gouv.fr/particulier/questions/jai-vendu-des-bons-de-souscription-de-parts-de-createurs-dentreprise-ou-bspce',
  },
  stockOption: {
    regime: 'Stock Options qualifiées — CGI art. 80 bis',
    url: 'https://www.bpifrance-creation.fr/encyclopedie/sequiper-pour-fiscalement-leshe-fiscalite-stock-options',
  },
  aga: {
    regime: 'AGA — CGI art. 80 quaterdecies (post-2018)',
    url: 'https://www.impots.gouv.fr/particulier/questions/jai-recu-des-actions-gratuites',
  },
} as const;
