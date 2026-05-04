import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sandbox } from './sandbox';

export const metadata = { title: 'Dev — Cap Table Builder' };

/**
 * Sandbox /dev/cap-table-builder — Module 10 B2.
 *
 * Permet de tester rapidement les Server Actions cap-table V1 :
 *   - createShareClass / updateShareClass / deactivateShareClass
 *   - createFundingRound / cancelFundingRound
 *
 * 3 presets prêts pour tester :
 *   1. Startup post-Seed   — 1 COMMON + 1 ESOP réservé + Seed round 500K€
 *   2. Series A             — adds Series A 5M€ avec 2 lead VCs
 *   3. Avant exit           — Series B 12M€ + plusieurs investisseurs
 *
 * Le composant client `Sandbox` rend les 3 boutons preset + un viewer
 * JSON des ShareClasses/Rounds/Positions actuelles. PAS de DB writes
 * sur les presets (juste affichage de ce qui existe + form CRUD).
 *
 * Protection : layout /dev/* fait `notFound()` en prod (NODE_ENV).
 */
export default async function Page() {
  await requirePermission('captable.read.all');
  const supabase = await createSupabaseServerClient();

  const [classesRes, roundsRes, positionsRes, auditRes] = await Promise.all([
    supabase
      .from('share_classes')
      .select(
        `id, code, name, class_type, par_value, is_active,
         liquidation_preference_multiple, liquidation_preference_type,
         conversion_ratio, voting_rights_per_share, pool_total_units, created_at`,
      )
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('funding_rounds')
      .select(
        `id, name, round_type, share_class_id, status,
         pre_money_valuation, amount_raised, price_per_share, total_shares_issued,
         post_money_valuation, closed_at, cancelled_at, cancelled_reason, created_at`,
      )
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('cap_table_positions')
      .select(
        `id, stakeholder_type, stakeholder_name, share_class_id, units, source,
         acquired_at, position_closed_at, cost_basis_per_unit, cost_basis_total,
         created_at`,
      )
      .is('position_closed_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('audit_events')
      .select('id, event_type, resource_id, metadata, occurred_at, user_email')
      .like('event_type', 'captable.%')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  return (
    <Sandbox
      shareClasses={classesRes.data ?? []}
      fundingRounds={roundsRes.data ?? []}
      positions={positionsRes.data ?? []}
      auditEvents={auditRes.data ?? []}
    />
  );
}
