/**
 * scripts/validate-payload-v2.mjs
 *
 * Script de validation E2E des fixes payload V2.
 * Lance 3 valuations réelles sur le moteur Python Fly.io et vérifie :
 *   1. Pas de 422 / 500
 *   2. payload_sent persisté en DB
 *   3. fair_value > 0 et CI95 cohérent
 *   4. Pour TSR_REL_INDEX/PEERS : les fields critiques sont bien dans payload_sent
 *
 * Usage :
 *   node scripts/validate-payload-v2.mjs --env=staging
 *
 * Pré-requis :
 *   - pnpm install (dépendances)
 *   - .env.local avec NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - Migrations 00050-00052 appliquées en cloud
 *   - Edge function compute-valuation deployée v2
 *   - Au moins 1 plan créé pour chaque scénario (voir SETUP plus bas)
 *
 * SETUP (à faire 1 fois en staging) :
 *   - Créer un org de test
 *   - Plan #1 : AGA, 4 tranches égales sur 4 ans, S0=100, σ=30%, 0 condition
 *   - Plan #2 : AGA, 1 tranche T=4y, S0=100, σ=30%, 1 condition TSR_REL_INDEX
 *     (ref=GSPC.INDX, S0_idx=4500, σ_idx=18%, ρ=0.72)
 *   - Plan #3 : BSPCE, 1 tranche T=4y, S0=100, K=80, σ=30%, 1 condition TSR_REL_PEERS
 *     (4 peers AAPL/GOOGL/MSFT/AMZN avec s0/volatility/correlationWithMain renseignés)
 *
 * Note : ce script est idempotent — il appelle runValuation à chaque exécution
 * et compare avec le payload attendu, sans modifier les plans.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const env = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1] ?? 'staging';
const envFile = `.env.${env}`;

const envText = readFileSync(envFile, 'utf-8');
const envVars = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('=').map((s) => s.trim().replace(/^["']|["']$/g, ''))),
);

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// Scénarios attendus
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    name: 'AGA 4 tranches sans condition',
    planTitle: 'E2E_PAYLOAD_V2_AGA_4_TRANCHES',
    expectations: {
      pricer_used: 'BLACK_SCHOLES',
      use_monte_carlo: false,
      fair_value_min: 80,
      fair_value_max: 100,
    },
    payloadChecks: (p) => {
      if (p.config.use_monte_carlo !== false) {
        return `use_monte_carlo doit être false (multi-tranches sans condition de marché)`;
      }
      if (p.instrument.type !== 'stock') {
        return `instrument.type doit être 'stock' pour AGA`;
      }
      if (p.conditions.length !== 0) {
        return `conditions doit être vide`;
      }
      return null;
    },
  },
  {
    name: 'AGA + TSR_REL_INDEX',
    planTitle: 'E2E_PAYLOAD_V2_AGA_TSR_INDEX',
    expectations: {
      pricer_used: 'MONTE_CARLO_MULTI_TRANCHE',
      use_monte_carlo: true,
      fair_value_min: 30,
      fair_value_max: 100,
    },
    payloadChecks: (p) => {
      if (p.config.use_monte_carlo !== true) {
        return `use_monte_carlo doit être true (TSR_REL_INDEX)`;
      }
      const cond = p.conditions[0];
      if (!cond) return `aucune condition envoyée`;
      if (cond.index_S0 == null || cond.index_S0 <= 0) {
        return `index_S0 manquant — moteur va fallback à 100, FV sera faux. ` +
          `Vérifier que reference_index_s0 est saisi dans le wizard.`;
      }
      if (cond.index_sigma == null || cond.index_sigma <= 0) {
        return `index_sigma manquant — moteur va fallback à 0.20, FV sera faux`;
      }
      if (cond.correlation == null) {
        return `correlation manquante — moteur va fallback à 0.5, FV sera biaisé`;
      }
      return null;
    },
  },
  {
    name: 'BSPCE + TSR_REL_PEERS 4 peers',
    planTitle: 'E2E_PAYLOAD_V2_BSPCE_TSR_PEERS',
    expectations: {
      pricer_used: 'MONTE_CARLO_MULTI_TRANCHE',
      use_monte_carlo: true,
      fair_value_min: 5,
      fair_value_max: 50,
    },
    payloadChecks: (p) => {
      if (p.instrument.type !== 'option') {
        return `instrument.type doit être 'option' pour BSPCE`;
      }
      if (p.instrument.strike <= 0) {
        return `strike doit être > 0 pour BSPCE`;
      }
      const cond = p.conditions[0];
      if (!cond) return `aucune condition envoyée`;
      if (!cond.weighted_peer_groups || cond.weighted_peer_groups.length === 0) {
        return `weighted_peer_groups vide — peers ignorés par le moteur ` +
          `(le mode flat peer_group n'est jamais lu, cf. main.py l. 460/586)`;
      }
      const peers = cond.weighted_peer_groups[0].peers;
      if (!peers || peers.length === 0) {
        return `aucun peer dans le groupe`;
      }
      const firstPeer = peers[0];
      // Vérification critique : les fields Pydantic-compatibles
      if (firstPeer.S0 == null) {
        return `peer[0].S0 manquant (uppercase!) — Pydantic exigerait S0, retournera 422`;
      }
      if ('s0' in firstPeer) {
        return `peer[0] contient encore 's0' lowercase — devrait être supprimé après mapping`;
      }
      if (firstPeer.sigma == null) {
        return `peer[0].sigma manquant — Pydantic exigerait sigma, retournera 422`;
      }
      if ('volatility' in firstPeer) {
        return `peer[0] contient encore 'volatility' — devrait être renommé sigma`;
      }
      if ('correlationWithMain' in firstPeer) {
        return `peer[0] contient encore 'correlationWithMain' — devrait être renommé correlation`;
      }
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function runScenario(scenario) {
  console.log(`\n━━━ ${scenario.name} ━━━`);

  // 1. Charger le plan
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, title, plan_type')
    .eq('title', scenario.planTitle)
    .maybeSingle();

  if (planError || !plan) {
    console.log(`  ❌ Plan "${scenario.planTitle}" introuvable. Voir SETUP en tête du script.`);
    return false;
  }
  console.log(`  ✓ Plan trouvé: ${plan.id} (${plan.plan_type})`);

  // 2. Trigger une nouvelle valuation
  const { data: hypoSet } = await supabase
    .from('hypothesis_sets')
    .select('id')
    .eq('plan_id', plan.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!hypoSet) {
    console.log(`  ❌ Pas d'hypothesis_set pour ce plan`);
    return false;
  }

  const { data: run, error: runError } = await supabase
    .from('valuation_runs')
    .insert({
      org_id: plan.org_id ?? (await supabase.from('plans').select('org_id').eq('id', plan.id).single()).data.org_id,
      plan_id: plan.id,
      hypothesis_set_id: hypoSet.id,
      status: 'QUEUED',
    })
    .select('id, org_id')
    .single();

  if (runError || !run) {
    console.log(`  ❌ Impossible de créer un run: ${runError?.message}`);
    return false;
  }
  console.log(`  ✓ Run créé: ${run.id}`);

  // 3. Trigger l'edge function
  const { error: invokeError } = await supabase.functions.invoke('compute-valuation', {
    body: { run_id: run.id },
  });

  if (invokeError) {
    console.log(`  ❌ Edge function failed: ${invokeError.message}`);
    return false;
  }

  // 4. Wait pour completion (poll toutes les 2s, max 60s)
  let finalRun = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: r } = await supabase
      .from('valuation_runs')
      .select('id, status, pricer_used, payload_sent, response_received, error_message')
      .eq('id', run.id)
      .single();
    if (r && (r.status === 'DONE' || r.status === 'ERROR')) {
      finalRun = r;
      break;
    }
  }

  if (!finalRun) {
    console.log(`  ❌ Timeout (>60s) — run toujours pas terminé`);
    return false;
  }

  if (finalRun.status === 'ERROR') {
    console.log(`  ❌ Run en ERREUR: ${finalRun.error_message}`);
    return false;
  }

  console.log(`  ✓ Run DONE en ${finalRun.completed_at ? '...' : '?'}`);

  // 5. Vérifier expectations
  if (finalRun.pricer_used !== scenario.expectations.pricer_used) {
    console.log(
      `  ❌ pricer_used: attendu ${scenario.expectations.pricer_used}, reçu ${finalRun.pricer_used}`,
    );
    return false;
  }
  console.log(`  ✓ pricer_used = ${finalRun.pricer_used}`);

  // 6. Vérifier payload_sent
  if (!finalRun.payload_sent) {
    console.log(`  ❌ payload_sent NULL — la persistance V2 ne fonctionne pas`);
    return false;
  }
  console.log(`  ✓ payload_sent persisté (${JSON.stringify(finalRun.payload_sent).length} chars)`);

  const payloadCheckError = scenario.payloadChecks(finalRun.payload_sent);
  if (payloadCheckError) {
    console.log(`  ❌ Payload check FAIL: ${payloadCheckError}`);
    console.log(`     payload_sent.conditions[0]:`, JSON.stringify(finalRun.payload_sent.conditions?.[0], null, 2).slice(0, 1500));
    return false;
  }
  console.log(`  ✓ Payload checks passed`);

  // 7. Vérifier fair_value range
  const { data: result } = await supabase
    .from('valuation_results')
    .select('fair_value_per_instrument, ci95_low, ci95_high')
    .eq('valuation_run_id', run.id)
    .single();

  if (!result) {
    console.log(`  ❌ Pas de valuation_results pour ce run`);
    return false;
  }

  const fv = result.fair_value_per_instrument;
  if (fv < scenario.expectations.fair_value_min || fv > scenario.expectations.fair_value_max) {
    console.log(
      `  ❌ FV hors range: attendu [${scenario.expectations.fair_value_min}, ${scenario.expectations.fair_value_max}], reçu ${fv}`,
    );
    return false;
  }
  console.log(`  ✓ FV = ${fv.toFixed(4)} (CI95 = [${result.ci95_low?.toFixed(4) ?? 'n/a'}, ${result.ci95_high?.toFixed(4) ?? 'n/a'}])`);

  return true;
}

async function main() {
  console.log(`\n=== Validation payload V2 — env=${env} ===\n`);

  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    const ok = await runScenario(scenario);
    if (ok) passed++;
    else failed++;
  }

  console.log(`\n=== Résultat: ${passed}/${SCENARIOS.length} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
