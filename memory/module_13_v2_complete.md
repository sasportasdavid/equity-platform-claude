---
name: Module 13 V2 — Export PDF/JSON/CSV + Tamper-evident chain (PR #42)
description: Closure PR #42 — 7 commits, 3 migrations cloud, 4 SAs export, ChainIntegrityBadge + dropdown UI, 53 tests neufs (1283 workspace)
type: project
---

# PR #42 — Module 13 V2 closure

**Date** : 2026-05-05
**Branche** : `feat/module-13-audit-export-tamper-evident-v2`
**Commits** : 7
**Cloud project** : `ytlfnxcrclugrsbvqdkb` (3 migrations appliquées)
**Tests** : **1283 workspace verts** (vs 1230 pré-PR, **+53 tests neufs**)

---

## Commits livrés

| #   | Hash      | Description                                               |
| --- | --------- | --------------------------------------------------------- |
| 1   | `5c17c56` | B0 audit memo — 5 prereqs OK, 10 arbitrages spec vs brief |
| 2   | `46a67b1` | B1 tamper-evident chain SQL + TS helpers + 17 tests       |
| 3   | `22f9a56` | B2 JSON signed export + SHA-256 self-integrity + 15 tests |
| 4   | `c53fa6f` | B3 PDF + B4 CSV exports + 21 tests CSV                    |
| 5   | `9a0a28b` | B5 UI export dropdown + ChainIntegrityBadge dans hero     |

---

## Conformité spec MODULE_13_AUDIT_TRAIL.md

Sur les 10 arbitrages spec vs brief flaggés au B0, **tous tranchés en faveur de la spec** par David :

| #     | Arbitrage            | Décision finale                                                              | Conformité |
| ----- | -------------------- | ---------------------------------------------------------------------------- | ---------- |
| A1+A6 | Stratégie chaining   | **Option A spec** : mark-and-sweep, 286 events legacy stay NULL              | ✅         |
| A2    | Genesis              | `SHA-256("CAPIWISE_AUDIT_GENESIS_2026_05")` dérivé déterministe              | ✅         |
| A3    | Format payload       | Postgres jsonb ordered keys (longueur+alpha)                                 | ✅         |
| A4    | Architecture trigger | BEFORE (chain_position via advisory lock) + AFTER (compute hash via RPC)     | ✅         |
| A5    | Colonne hash naming  | `event_hash` (pas `hash_sha256`)                                             | ✅         |
| A7    | Safety triggers      | Créés sur awards/plans/beneficiaries — DISABLED V1 (retrofit V1.X)           | ✅         |
| A8    | Permission           | `audit.export` (déjà seedée Module 1, OWNER + AUDITOR)                       | ✅         |
| A9    | Format export        | **JSON signé PRIMAIRE** + PDF + CSV (CSV bonus complément, pas remplacement) | ✅         |
| A10   | tsvector search      | Sorti scope V2 → **PR #44 dédiée** (scope V1 déjà ≥ 7 commits)               | Reporté    |

---

## DB cloud appliqué (3 migrations)

### `00095_module_13_audit_chain_columns`

- `ALTER audit_events ADD event_hash + previous_hash + chain_position`
- `UNIQUE INDEX idx_audit_events_chain_per_org (org_id, chain_position) WHERE chain_position IS NOT NULL`
- `INDEX idx_audit_events_event_hash`
- CHECK constraints hex 64 chars sur event_hash + previous_hash

### `00096_module_13_audit_chain_rpc_and_triggers`

- `canonical_audit_payload(11 args)` : payload JSON déterministe (jsonb storage Postgres trie keys par longueur+alpha, séparateur `: `/`, `). Format `occurred_at` ISO 8601 UTC.MS Z fixé via `to_char` (déterministe vs `::text` qui dépend du DateStyle session).
- `compute_audit_chain_hash(p_event_id)` : SHA-256(canonical_payload || (previous_hash | genesis)). Genesis = SHA-256('CAPIWISE_AUDIT_GENESIS_2026_05') constant inline.
- `verify_audit_chain_integrity(p_org_id?)` : itère par org, recompute, compare. OUT params renamed `out_*` pour éviter shadowing.
- TRIGGER BEFORE INSERT : `audit_events_assign_chain_position` via `pg_advisory_xact_lock(hashtext('audit_chain:' + org_id))` per-org (race-free).
- TRIGGER AFTER INSERT : `audit_events_compute_hash_after_insert` → appelle `compute_audit_chain_hash`.
- TRIGGER BEFORE UPDATE : `audit_events_prevent_chain_update` — bloque modif `event_hash`/`previous_hash`/`chain_position` + bloque modif fields hashés (event_type, metadata, occurred_at, etc.) si `event_hash IS NOT NULL`. Autorise NULL → first value (transition AFTER INSERT).

### `00097_module_13_audit_safety_triggers`

- `audit_events_safety_log_modification(label, resource_type)` : skip si TX-local `audit.skip_trigger='true'`, sinon INSERT audit_event avec metadata.source='db_trigger_safety'
- 3 triggers AFTER UPDATE sur awards/plans/beneficiaries — **DISABLED par défaut V1** (retrofit SAs requis V1.X pour set le flag avant mutation, sinon double-logging)

---

## TS livré

### Helpers (lib/audit/)

- `chain.ts` : `getAuditEventHash` (priorité DB > legacy compute), `isChained`, `chainedEventsOrdered`, `verifyChainLinkage`, constant `AUDIT_CHAIN_GENESIS_SOURCE`
- `export-json-builder.ts` : `buildAuditExportJson` pure (15 tests)
- `export-csv-builder.ts` : `buildAuditCsv` + `escapeCsvCell` RFC 4180 + BOM UTF-8 (21 tests)
- `audit-report-pdf.tsx` : `AuditReportPdf` Document @react-pdf/renderer 3 sections

### Server queries (server/queries/)

- `audit-export.ts` : `getAllAuditEventsForExport(filters)` + `getAuditChainIntegrity(orgId)`. Cap 10 000 events V1, cast `unknown` sur SELECT + RPC car types DB pas régénérés.

### Server actions (server/actions/)

- `audit-export-json.ts` : SA principale (PRIMAIRE V1) — permission gate audit.export + audit.exported emission
- `audit-export-pdf.ts` : SA PDF avec renderToBuffer, returns base64 (Server Actions ne sérialisent pas Buffers)
- `audit-export-csv.ts` : SA CSV simple

### UI components (components/audit/)

- `ChainIntegrityBadge.tsx` (server) : 3 variantes intact/broken/neutral
- `AuditExportButton.tsx` (client) : dropdown 3 items + Blob download + base64 decode pour PDF
- Intégration dans `audit-trail/page.tsx` hero (row flex justify-between)
- CSS `cw-chain-badge-*` + `cw-audit-export-*` dans `@layer components` (1 seul block global)

---

## Smoke tests E2E cloud passés

1. **Insert 3 events fixtures Paragraphe** → chain_position 1/2/3 assignés, event_hash chainés (genesis previous=null, suivants chained), verify_audit_chain_integrity 3/3 verified intact ✓
2. **Immutability 4/4** : updates event_hash/metadata/chain_position/event_type bloquent avec `check_violation` ✓
3. **Insert 2 events Capiwise** → ChainIntegrityBadge live affiche `● CHAÎNE INTÈGRE · SHA-256 · 2 événements vérifiés` en bond-700 vert ✓
4. **Dropdown export** : 3 items rendus avec hints corrects ✓
5. **Cleanup** : 100% fixtures supprimées ✓

---

## Format JSON export V1 (spec §7.3 + extensions)

```json
{
  "format_version": "1.0",
  "generated_at": "2026-05-05T19:00:00.000Z",
  "generated_by": { "user_id": "...", "user_email": "...", "org_id": "...", "org_name": null },
  "range": { "from": null, "to": null, "event_type_prefix": null },
  "integrity": {
    "algorithm": "SHA-256",
    "genesis_source": "CAPIWISE_AUDIT_GENESIS_2026_05",
    "total_events": 0,
    "verified_events": 0,
    "events_signed": 0,
    "is_intact": true,
    "broken_at": null,
    "broken_event_id": null,
    "chain_head_hash": null,
    "chain_position_max": null,
    "verify_endpoint_url": "https://capiwise.com/api/audit/verify-chain"
  },
  "events": [
    {
      "id": "...",
      "chain_position": 1,
      "occurred_at": "...",
      "user_id": "...",
      "user_email": "...",
      "event_type": "...",
      "resource_type": "...",
      "resource_id": "...",
      "before_state": null,
      "after_state": null,
      "metadata": {},
      "event_hash": "...",
      "previous_hash": null
    }
  ],
  "truncated": false,
  "export_signature": { "algorithm": "SHA-256", "value": "<sha256 hex 64>" }
}
```

`export_signature.value` = SHA-256 du payload entier sans le bloc `export_signature`. Re-vérifiable hors ligne :

```bash
# Strip export_signature, then sha256sum
jq 'del(.export_signature)' export.json | sha256sum
```

---

## Dettes V1.X et V2 documentées

### V1.X (PR #44 ou patch)

- **#125 tsvector search FR** + multi-select acteurs/types (sorti scope PR #42)
- **#126 ED25519 cryptographic signature** export (asymmetric, vs SHA-256 self-integrity V1) — préparation #120 timestamping notarial
- **#127 Safety triggers ENABLED** + retrofit SAs avec `SET LOCAL audit.skip_trigger='true'` avant mutation (`logAuditEvent` à instrumenter)
- **#128 Canonical JSON form portée TS** : `verifyChainLinkage` recompute hash localement (offline verify export JSON sans accès DB pour auditeur externe)
- **#129 Regen DB types** post-migrations 00095/00096 — supprimer les 2 casts `unknown` dans audit-export.ts
- **#130 Verify endpoint URL** : créer route `app/api/audit/verify-chain/route.ts` qui wrappe la RPC pour les auditeurs externes (currently URL pointe vers prod imaginaire)
- **#131 Tests UI client** : `AuditExportButton` + `ChainIntegrityBadge` non testés (jsdom non configuré, dette transverse)
- **#132 Stream NDJSON** pour exports >10k events (cap V1)

### V2

- Backfill chain pour les 286 events legacy (Option B spec §3.3 — V1.X #119)
- Real-time updates : nouveau event → toast + scroll auto
- Webhooks pour intégration SIEM (Splunk, Datadog)

---

## Pattern validé pour Module 14+

Ce PR confirme le **stop-checkpoint protocol** spec §11 :

- B0 strict avec arbitrage spec vs brief (10 divergences flaggées, 6 tranchées par user)
- Migration cloud uniquement après validation des arbitrages
- Smoke tests E2E cloud entre chaque commit
- Cleanup systématique des fixtures avant commit
- Memory closure obligatoire

**Pattern réutilisable pour Module 14** (auth onboarding) où la spec MODULE_02 est autoritaire et le brief PR #43 doit être confronté aux pièges du brief (10 listés).
