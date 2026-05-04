---
name: Module 10 B6 — Cron nightly snapshot DEFERRED V1.5
description: Migration 00090 (cron nightly) supprimée du repo après B6. MCP Supabase bloqué + drift CLI = cloud apply impossible session. Skip propre V1.5.
type: project
---

# Module 10 — B6 cron nightly snapshot DEFERRED V1.5

**Date** : 2026-05-04 (post-commit B6 23d62c6, cleanup avant B7)
**Décision** : Option β du protocole user — supprimer la migration plutôt que laisser une dette flottante (Option γ refusée).

**Why** : la migration `00090_module_10_cron_nightly_snapshot.sql` ne peut pas être appliquée cloud cette session (`apply_migration` MCP retourne permission denied + `supabase db push` bloqué par drift timestamps). La garder en repo créerait un trou : code en repo qui n'existe pas en cloud → snapshots auto quotidiens silencieusement non actifs.

**How to apply** : pour activer V1.5, le mainteneur DB devra recréer la migration avec timestamp aligné cloud + l'appliquer via `apply_migration` ou Dashboard SQL Editor. Le code SQL ci-dessous est conservé pour réutilisation directe.

---

## 1. Contenu SQL préservé pour V1.5

À recréer côté Supabase (via Dashboard SQL Editor, ou recréer migration locale avec timestamp aligné cloud) :

```sql
-- =============================================================================
-- Module 10 V1.5 — RPC + cron nightly snapshot (DEFERRED depuis B6)
-- =============================================================================

-- Helper : itère sur les orgs et matérialise un snapshot pour chacune.
CREATE OR REPLACE FUNCTION materialize_nightly_snapshots_all_orgs()
RETURNS TABLE (org_id UUID, snapshot_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org RECORD;
  v_snapshot_id UUID;
  v_today DATE := CURRENT_DATE;
BEGIN
  FOR v_org IN
    SELECT DISTINCT sc.org_id AS oid
      FROM share_classes sc
     WHERE sc.is_active = TRUE
  LOOP
    BEGIN
      v_snapshot_id := materialize_snapshot(
        p_org_id := v_org.oid,
        p_asof_date := v_today,
        p_snapshot_type := 'NIGHTLY',
        p_triggered_by_round_id := NULL,
        p_label := 'Snapshot automatique ' || to_char(v_today, 'YYYY-MM-DD')
      );
      org_id := v_org.oid;
      snapshot_id := v_snapshot_id;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      org_id := v_org.oid;
      snapshot_id := NULL;
      error_message := SQLERRM;
      RETURN NEXT;
      RAISE NOTICE 'Nightly snapshot failed for org %: %', v_org.oid, SQLERRM;
    END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION materialize_nightly_snapshots_all_orgs FROM PUBLIC;

-- Idempotent unschedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot') THEN
    PERFORM cron.unschedule('cap-table-nightly-snapshot');
  END IF;
END $$;

-- Schedule : 02:00 UTC chaque jour (~03:00-04:00 Paris)
SELECT cron.schedule(
  'cap-table-nightly-snapshot',
  '0 2 * * *',
  $$
  SELECT count(*) AS rows_processed FROM materialize_nightly_snapshots_all_orgs();
  $$
);

-- Verify post-apply :
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot';
```

**Préreq** : `pg_cron` extension active (déjà OK depuis Module 2 / Module 7).

## 2. UI mises à jour suite au skip

Pour ne pas mentir à l'utilisateur en V1, le wording UI a été corrigé :

- [snapshots/page.tsx](<apps/web/src/app/(dashboard)/dashboard/captable/snapshots/page.tsx>) — Subtitle : "Auto post-round + manuels. **Snapshots quotidiens automatiques disponibles V1.5**"
- [snapshots/page.tsx](<apps/web/src/app/(dashboard)/dashboard/captable/snapshots/page.tsx>) — EmptyState description : "Les snapshots automatiques quotidiens arrivent en V1.5."
- [evolution-chart.tsx](apps/web/src/components/captable/evolution-chart.tsx) — Empty state : "Créez des snapshots manuels (les snapshots automatiques quotidiens arrivent en V1.5)."

## 3. Impact V1

- **Snapshots manuels** : fonctionnent à 100% (Server Action `createManualSnapshot` → RPC `materialize_snapshot` qui existe en cloud depuis B1).
- **Snapshots auto post-round** : fonctionnent (déjà câblés dans `create_funding_round` RPC depuis B1, indépendant du cron).
- **Snapshots quotidiens auto** : INACTIFS V1. L'org doit prendre un snapshot manuel régulièrement si elle veut une historisation fine pour le tab Évolution.

## 4. Activation V1.5 (steps mainteneur)

1. Ouvrir Supabase Dashboard SQL Editor (project `ytlfnxcrclugrsbvqdkb`)
2. Coller le SQL §1 ci-dessus
3. Exécuter
4. Vérifier : `SELECT jobname, schedule FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot';`
5. Optionnel : test immédiat avec `SELECT * FROM materialize_nightly_snapshots_all_orgs();`
6. Mettre à jour les 3 wordings UI ci-dessus pour retirer "V1.5" → "automatique nocturne 02:00 UTC"
7. Documenter en `memory/module_10_v1_5_cron_activated.md`

## 5. Liens

- Migration supprimée : pas de fichier en repo (intentionnel)
- Pattern cron référence : [00049_module_7_cron_consumer.sql](supabase/migrations/00049_module_7_cron_consumer.sql)
- Helper RPC déjà en place : [00087_module_10_materialize_snapshot_rpc.sql](supabase/migrations/00087_module_10_materialize_snapshot_rpc.sql)
