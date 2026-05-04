import 'server-only';

import {
  effectiveRuleSchema,
  effectiveRuleFullSchema,
  type EffectiveRule,
  type EffectiveRuleFull,
  type RuleCode,
} from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 12 B2 — Helpers Node pour lire la config effective des compliance rules.
 *
 * Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §3.1.
 *
 * 2 fonctions exportées :
 *   - `loadEffectiveRule(ruleCode)` : 1 rule, via RPC `get_effective_rule`,
 *     filtre implicit par `current_org_id()`. Retour parsé via Zod
 *     `effectiveRuleSchema`. Null si rule introuvable, désactivée pour l'org,
 *     ou parse Zod fail (warning console).
 *   - `loadAllEffectiveRules()` : 22 rules en 1 query SELECT sur la vue
 *     `effective_compliance_rules` filtrée à l'org courante (RLS implicit
 *     via overrides + scope public sur definitions). Utilisé par la page
 *     UI `/dashboard/settings/compliance` (B3.5).
 *
 * Strict server-only (`'server-only'` import). Le client n'a pas accès direct
 * à la config compliance — elle est merge côté SAs avant d'arriver à l'UI.
 *
 * Pattern de fallback : si la DB ne retourne rien (rule_code inconnu, RPC
 * erreur, parse fail), retourner `null` plutôt que throw. Le caller décide
 * (skip la check, fallback hardcoded constants, etc.).
 */

/**
 * Charge la config effective d'une rule pour l'org courante.
 *
 * @param ruleCode — code de la rule, ex `'VALUATION_STALE_BLOCKING'`
 * @returns la rule effective avec params merged, ou `null` si introuvable
 *          / parse fail (logged warning).
 */
export async function loadEffectiveRule(ruleCode: RuleCode): Promise<EffectiveRule | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc('get_effective_rule', { p_rule_code: ruleCode })
    .maybeSingle();

  if (error) {
    console.warn(`[Module 12] get_effective_rule(${ruleCode}) RPC error:`, error.message);
    return null;
  }
  if (!data) return null;

  const parsed = effectiveRuleSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(
      `[Module 12] Invalid effective rule shape for ${ruleCode}:`,
      parsed.error.issues[0]?.message,
    );
    return null;
  }
  return parsed.data;
}

/**
 * Charge toutes les rules effectives pour l'org courante (22 rows V1).
 *
 * Utilisé par :
 *   - `/dashboard/settings/compliance` (B3) pour lister/configurer
 *   - cache warmer optionnel V1.5 (load 1× au boot, refresh sur invalidation)
 *
 * Filtre via la RLS de `compliance_rule_overrides` (vue effective hérite).
 * L'utilisateur courant doit avoir `compliance_rules.read` (= permission
 * implicit pour tous les authenticated, pas de gate stricte côté SELECT).
 */
export async function loadAllEffectiveRules(): Promise<EffectiveRuleFull[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('effective_compliance_rules')
    .select(
      'rule_code, scope, description_fr, description_en, is_active, effective_severity, severity_default, is_severity_overridable, effective_params, params_schema, default_params, cta_url_template, documentation_url, is_overridden, override_notes, params_override, override_updated_at, override_updated_by',
    )
    .order('scope', { ascending: true })
    .order('rule_code', { ascending: true });

  if (error) {
    console.warn('[Module 12] effective_compliance_rules SELECT error:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const out: EffectiveRuleFull[] = [];
  for (const row of data) {
    const parsed = effectiveRuleFullSchema.safeParse(row);
    if (!parsed.success) {
      const code = (row as { rule_code?: unknown }).rule_code;
      console.warn(
        `[Module 12] Invalid effective rule full shape for ${String(code)}:`,
        parsed.error.issues[0]?.message,
      );
      continue;
    }
    out.push(parsed.data);
  }
  return out;
}
