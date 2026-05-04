/**
 * Module 12.5 B1 — Helpers partagés pour la lecture de la config effective
 * (params + severity) depuis `ctx.effectiveParamsByRule` /
 * `ctx.effectiveSeverityByRule`.
 *
 * Pattern initialement introduit en Module 12 B2 (`valuationRules.ts`),
 * extrait ici pour être réutilisé par les 21 rules code restantes
 * (cf. dette #110). Le ctx peut être n'importe quel `*CheckContext` qui
 * étend `EffectiveRulesCtx` (champs optionnels).
 *
 * Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §3.2 + §3.3.
 *
 * Fallback systématique : si la map est absente (DB indispo ou rule pas
 * encore wired), on retourne le `defaultValue` / `legacy`. Aucun throw,
 * aucun side-effect.
 */
export type EffectiveRulesCtx = {
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

/**
 * Lit un param numérique depuis `ctx.effectiveParamsByRule[ruleCode]`,
 * fallback sur `defaultValue` si absent ou non-numeric.
 *
 * Couvre les params `number` et `integer` du schema Module 12 (pas de
 * coercion `'30'` → 30 — la SA `updateComplianceRuleOverride` valide déjà
 * via `validateParamsAgainstSchema`).
 */
export function readNumberParam<TCtx extends EffectiveRulesCtx>(
  ctx: TCtx,
  ruleCode: string,
  paramName: string,
  defaultValue: number,
): number {
  const params = ctx.effectiveParamsByRule?.[ruleCode];
  const raw = params?.[paramName];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : defaultValue;
}

/**
 * Mappe la severity DB Module 12 ('error'/'warning') vers le format
 * legacy des checkers ('ERROR'/'WARNING'). Fallback sur la severity legacy
 * si pas de remap DB ou valeur invalide.
 *
 * Note : le runner (`runRules` dans `runChecks.ts`) bucket toujours par
 * `rule.enforcement` (hard/soft), pas par `issue.severity`. La severity
 * portée par l'issue ne change donc pas le statut errors/warnings du
 * `ComplianceCheckResult`. C'est l'UI (issue.severity = 'WARNING' affichée
 * en jaune même si bucket dans `errors[]`) qui fait foi pour le rendu.
 */
export function readSeverity<TCtx extends EffectiveRulesCtx>(
  ctx: TCtx,
  ruleCode: string,
  legacy: 'ERROR' | 'WARNING',
): 'ERROR' | 'WARNING' {
  const dbSeverity = ctx.effectiveSeverityByRule?.[ruleCode];
  if (dbSeverity === 'error') return 'ERROR';
  if (dbSeverity === 'warning') return 'WARNING';
  return legacy;
}
