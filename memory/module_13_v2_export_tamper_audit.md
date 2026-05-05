---
name: Module 13 V2 — Export PDF + Tamper-evident chain audit B0 (PR #42)
description: Audit pré-code — réponse aux 5 questions techniques + 10 arbitrages spec MODULE_13_AUDIT_TRAIL.md vs brief PR #42 à valider AVANT migration
type: project
---

# B0 — Audit Module 13 V2 Export + Tamper-evident chain (PR #42)

**Date** : 2026-05-05
**Branche** : `feat/module-13-audit-export-tamper-evident-v2` (créée depuis master `521f369`)
**Référence spec** : `docs/MODULE_13_AUDIT_TRAIL.md` (autoritaire — CLAUDE.md §"Specs de référence")
**Brief** : `docs/PR_42_BRIEF_MODULE_13_V2_EXPORT_TAMPER_EVIDENT.md`

> **Status général** : 5 prérequis techniques OK ✅. **MAIS 10 divergences spec vs brief** sur le cœur de la PR (chaining, hash format, triggers, formats d'export). **STOP recommandé pour arbitrage David** avant toute migration cloud — la spec est autoritaire et le brief la contredit sur 5 points critiques décidés en V1.

---

## 1. Vérifications techniques B0 (5 questions du brief)

| #   | Question                                        | Réponse                                                                                                                                                                                                 | Action                                                                                                                                           |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | `@react-pdf/renderer` installé ?                | ✅ **`^4.5.1`** dans `apps/web/package.json` (déjà utilisé Module 6 pour BSPCE/AGA/SO templates)                                                                                                        | Réutiliser pattern Module 6                                                                                                                      |
| Q2  | Extension `pgcrypto` enabled ?                  | ✅ **`pgcrypto v1.3`** active sur projet `ytlfnxcrclugrsbvqdkb`. `digest()` SQL function dispo                                                                                                          | Pas de migration `CREATE EXTENSION` nécessaire                                                                                                   |
| Q3  | Triggers existants sur `audit_events` ?         | ✅ **0 trigger** — clean slate. RLS policy `audit_events_select` existe (Module 1 §00002) mais pas de trigger BEFORE/AFTER                                                                              | OK pour ajouter sans collision                                                                                                                   |
| Q4  | Composant MultiSelect / Combobox dans le repo ? | 🟡 **`<BeneficiaryCombobox>`** existe (`apps/web/src/components/awards/BeneficiaryCombobox.tsx`) — single-select Base UI custom. **Pas de MultiSelect** générique. shadcn/ui n'a que `<select>` natif   | Soit créer `<MultiSelect>` partagé (Base UI Combobox + chips), soit utiliser pattern checkbox group + popover. Estimer 2-3h pour le composant V1 |
| Q5  | Pattern Server Actions à respecter ?            | ✅ Pattern strict CLAUDE.md : `'use server'` + `requirePermission(...)` + Zod `safeParse` + return `{ ok: true \| false, ... }` + `logAuditEvent`. 21 SAs en référence (`apps/web/src/server/actions/`) | Suivre `plans.ts::archivePlan` comme template                                                                                                    |

**Cloud state actuel** (Supabase MCP `ytlfnxcrclugrsbvqdkb`) :

- **286 audit_events** (vs 244 brief / 232 spec — la table a continué de grossir)
- **2 orgs distinctes** (Paragraphe + Capiwise)
- **47 events avec before/after** (~16 % — confirme la dette spec §2.3 / Issue #117)
- Earliest : `2026-04-27 20:51`, Latest : `2026-05-05 15:58`

---

## 2. Arbitrages spec autoritaire vs brief — 🛑 BLOQUEURS

CLAUDE.md §"Specs de référence" : _« Si une instruction de chat contredit la spec, demander confirmation avant de procéder. »_

| #       | Sujet                                          | Spec MODULE_13                                                                                                                          | Brief PR #42                                                        | Décision V1 figée ?                                                  | Recommandation                                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A1**  | **Stratégie chaining initial**                 | **Option A** : mark-and-sweep, events pré-Module 13 = `chain_position NULL`, genesis SHA-256 fresh à la date de la migration            | **Option B** : backfill **TOUS** les 286 events + NOT NULL final    | ✅ **Option A figée V1** (spec §3.3 « Décision V1 = Option A »)      | **Suivre spec — Option A**. Brief Option B = dette V1.X #119 explicite. Backfill 286 events = perte de ground truth historique + risque casser chain rétroactivement                                                                                                                 |
| **A2**  | **Genesis hash**                               | `SHA-256("CAPIWISE_AUDIT_GENESIS_2026_05")` (string dérivée déterministe)                                                               | `'GENESIS'` (literal pipe-concat dans payload)                      | ✅ Spec §3.4 ligne 275                                               | Spec : genesis = hash stable d'une chaîne de version. Brief simplifie mais hash final ≠. **Suivre spec**                                                                                                                                                                             |
| **A3**  | **Format payload**                             | **RFC 8785 Canonical JSON** ordered keys : `jsonb_build_object(...)::text` avec sort alphabétique                                       | `concat_ws('\|', NEW.id::text, NEW.org_id::text, …)` pipe-delimited | ✅ Spec §3.2 « Critique : ordre alphabétique pour reproductibilité » | **Suivre spec**. Format pipe brief = non reproductible côté auditeur externe (qui ne peut pas re-vérifier). Canonical JSON = standard interop                                                                                                                                        |
| **A4**  | **Architecture trigger**                       | BEFORE INSERT (assign `chain_position`) + AFTER INSERT (compute hash via RPC `compute_audit_chain_hash`)                                | BEFORE INSERT unique (tout in-line)                                 | ✅ Spec §3.5 explicit                                                | **Suivre spec** — séparation BEFORE/AFTER nécessaire car compute_hash a besoin de NEW row insérée pour atomicité avec previous lookup. Brief BEFORE-only crée race condition                                                                                                         |
| **A5**  | **Colonne hash naming**                        | `event_hash` (text, 64 hex)                                                                                                             | `hash_sha256` (text)                                                | ✅ Spec §3.3                                                         | **Suivre spec** : `event_hash`                                                                                                                                                                                                                                                       |
| **A6**  | **NOT NULL constraint**                        | Nullable — `chain_position IS NULL si event pré-Module 13 non chained`                                                                  | NOT NULL après backfill                                             | ✅ Spec §3.3                                                         | Couplé A1. Si Option A → **nullable**. Si Option B → NOT NULL. Choix unique                                                                                                                                                                                                          |
| **A7**  | **Triggers safety awards/plans/beneficiaries** | OUI — spec §4.3 prescrit triggers AFTER UPDATE pour catch modifications hors SAs (CSV import, MCP, …) avec setting `audit.skip_trigger` | Non mentionné dans le brief                                         | ✅ Spec §4.3                                                         | **À ajouter dans la PR** : 3 triggers (awards/plans/beneficiaries) pour intégrité totale                                                                                                                                                                                             |
| **A8**  | **Permission `AUDIT_TRAIL_EXPORT`**            | Spec §5.3 : permission catalog + seed role_permissions OWNER + ADMIN_FINANCE                                                            | Non mentionné                                                       | ✅ Spec §5.3                                                         | **À ajouter** : migration permission seed                                                                                                                                                                                                                                            |
| **A9**  | **Export JSON signé vs CSV**                   | **PDF + JSON signé** (Q5=a figée). Format spec §7.3 inclut `integrity{...}` + `export_signature{algorithm, value}` re-vérifiable        | **PDF + CSV** — abandonne le JSON, ajoute CSV                       | ✅ Spec Q5=a + §7.3                                                  | **🚨 CONFLIT MAJEUR**. CSV n'est pas signable (pas de structure pour `integrity` + `export_signature`). Promesse client : « JSON signé pour auditeur externe ». **Recommandation** : garder spec (PDF + JSON signé) + ajouter CSV en bonus si user le veut, MAIS pas en remplacement |
| **A10** | **Search full-text tsvector**                  | **Hors scope V1** — spec §10 dette V1.X #122 « Recherche full-text dans les diffs (PostgreSQL tsvector) — priorité LOW »                | Inclus en V2 (colonne tsvector + index GIN + UI input)              | ✅ Spec §10                                                          | **À arbitrer** : si user veut bring-forward la dette #122 dans V2, OK c'est cohérent (peu coûteux). Mais c'était LOW priority                                                                                                                                                        |

---

## 3. Mockup vs page existante

La page `/dashboard/audit-trail` est livrée PR #39 + drawer V1.5 PR #41. La spec parle de `/dashboard/audit` (segment court) avec un layout différent (5 KPI tiles, ChainIntegrityBadge, AuditTimeline avec timeline-dots).

**Ne pas refaire** la page V1+V1.5 (livrée). Le brief PR #42 ne demande que des **extensions** :

- bouton Export (en haut à droite, à côté des chips filters)
- input search (au-dessus de la liste)
- multi-select chips actor + types (en plus des chips event_type prefix existants)
- ChainIntegrityBadge (à insérer dans le hero — V1 a la phrase italic, V2 ajoute le badge SHA-256 cuivre)

Je propose de **garder la page actuelle** + **enrichir progressivement** (additif), pas de refonte.

---

## 4. Plan d'implémentation proposé (sous réserve arbitrages)

**SI** spec strictement suivie (Option A + canonical JSON + JSON signé + permission + 3 triggers safety) :

| Commit | Phase                                      | Description                                                                                                                                                                                                                                      | Tests neufs |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1      | B0                                         | audit memo (ce fichier)                                                                                                                                                                                                                          | 0           |
| 2      | B1 SQL                                     | Migration colonnes + RPC `compute_audit_chain_hash` + `verify_audit_chain_integrity` + trigger BEFORE INSERT (chain_position) + AFTER INSERT (hash) + immutability trigger UPDATE + permission `AUDIT_TRAIL_EXPORT` (Option A — pas de backfill) | 5 SQL       |
| 3      | B1 helpers TS                              | `lib/audit/chain.ts` (types + `getAuditEventHash` priorité DB → fallback compute + `verifyChainIntegrityClient` réplique de la fn DB pour offline JSON re-check)                                                                                 | 8           |
| 4      | B2 export PDF                              | `server/actions/audit-export-pdf.ts` + `components/audit/AuditReportPDF.tsx` (cover + chronologie + footer crypto-verification + watermark V1 simple)                                                                                            | 4           |
| 5      | B2 export JSON signé                       | `server/actions/audit-export-json.ts` (format spec §7.3 avec `export_signature` SHA-256 du fichier complet)                                                                                                                                      | 4           |
| 6      | B2 export CSV (bonus)                      | `server/actions/audit-export-csv.ts` (escaping rigoureux, BOM UTF-8 pour Excel)                                                                                                                                                                  | 4           |
| 7      | B3 search tsvector                         | Migration `search_vector` GENERATED + GIN index + `getAuditEvents.search` param                                                                                                                                                                  | 5           |
| 8      | B3 multi-select filters                    | `<MultiSelect>` partagé (Base UI Combobox + chips) + `getAuditEvents.actorIds` / `eventTypePrefixes` + extension `AuditTrailFilters`                                                                                                             | 6           |
| 9      | B4 UI export buttons + ChainIntegrityBadge | `AuditExportButton` (dropdown PDF/JSON/CSV) + `ChainIntegrityBadge` insertion dans `audit-trail/page.tsx`                                                                                                                                        | 0           |
| 10     | B5 closure                                 | docs/MODULE_13 patch + memory complete                                                                                                                                                                                                           | 0           |

**Total tests prévus** : ~36 → 1230 + 36 = **~1266 verts** (target brief 1240+, OK).

**SI** brief strictement suivi (Option B backfill + pipe payload + CSV au lieu de JSON) → conflit avec spec, à valider explicitement par David.

---

## 5. Décisions critiques à arbitrer (dans cet ordre)

**Bloqueurs B1 SQL — à arbitrer AVANT toute migration cloud** :

1. **A1 + A6 chaining** — Option A (spec, suivre la décision V1 figée) **vs** Option B (brief, backfill 286 events + NOT NULL) ?
   - **Reco : Option A** — la spec est autoritaire et a explicitement choisi A. Option B = dette #119.

2. **A2 + A3 + A5 hash** — Genesis dérivé + Canonical JSON + colonne `event_hash` (spec) **vs** literal `'GENESIS'` + pipe payload + colonne `hash_sha256` (brief) ?
   - **Reco : Spec** — hash interopérable, re-vérifiable côté auditeur externe via lib JSON canonique standard.

3. **A4 architecture trigger** — BEFORE+AFTER spec **vs** BEFORE-only brief ?
   - **Reco : Spec** — race condition côté brief.

4. **A7 + A8 triggers safety + permission** — ajouter dans la PR (spec) **vs** non mentionné (brief) ?
   - **Reco : Ajouter** — la PR perdrait son intégrité totale sans triggers safety + permission RBAC pour l'export.

5. **A9 format export — JSON signé vs CSV** — JSON signé (spec, promesse auditeur) **vs** CSV (brief, comptabilité) ?
   - **Reco : Garder JSON signé spec + ajouter CSV en bonus** (les 2 sont peu coûteux, JSON satisfait l'auditeur, CSV satisfait le comptable).

6. **A10 tsvector** — bring-forward dette V1.X #122 dans cette PR ?
   - **Reco : OK** si arbitré comme features V2. Coût ~1h migration + 1h UI. Si user veut shipper rapide, à reporter.

---

## ⚠️ Risques techniques (en plus des arbitrages)

1. **Race condition chain_position** : 2 INSERT simultanés sur même org → collision. Solution spec : RPC AFTER INSERT en transaction `SERIALIZABLE` ou `LOCK TABLE audit_events IN SHARE ROW EXCLUSIVE MODE` dans le trigger. Tester avec stress test 50 inserts parallèles.
2. **PDF font loading @react-pdf/renderer** : Module 6 charge les fonts depuis CDN (Fraunces / Inter / JetBrains Mono). Si CDN slow → renderToBuffer timeout EF Supabase (~150s). Reco : self-host fonts dans `public/fonts/` + Font.register avec URL locale.
3. **`renderToBuffer` + RLS cookies** : la SA `exportAuditReportPdf` doit utiliser `createSupabaseServerClient()` (cookies-based) pour que la query `getAuditEvents` respecte la RLS org_id. **Pas** d'admin client (leak inter-org).
4. **CSV escaping** : guillemets dans `metadata.plan_name`, retours à la ligne dans verbalize → BOM UTF-8 (`﻿`) en début de fichier + double-quote rigoureux + MIME `text/csv;charset=utf-8`.
5. **Search tsvector + RLS** : la colonne GENERATED tsvector est calculée avant RLS filter (par construction OK), mais le `gin` index doit être respecté (pas de `LOWER()` qui briserait l'index).
6. **Immutability trigger ordre** : si on créé le trigger UPDATE-prevention AVANT le backfill, le backfill plante. Solution spec : trigger immutability **après** backfill. Brief le dit aussi (§"Pièges connus" #8).
7. **Multi-select state management** : URL searchParams `?actors=uuid1,uuid2&types=plan,award` peut atteindre la limite 2KB pour de grosses orgs. Reco : limit 10 acteurs/types max V1.

---

## ✅ Conclusion B0

**Prérequis techniques** : tous OK ✅ (react-pdf, pgcrypto, no triggers, Combobox custom dispo).

**Bloqueur** : 5 divergences critiques entre la spec autoritaire et le brief. Le pattern CLAUDE.md (« demander confirmation avant de procéder ») impose un STOP avant migration cloud.

**Demande à David** : arbitrer les 6 points listés §5 (Option A/B chaining, format hash, architecture trigger, scope triggers safety + permission, format export JSON vs CSV, scope tsvector). Sans ces arbitrages, le risque est de coder dans une direction qui sera ensuite reverted (migration DB pas trivialement annulable).

**Démarrage commit B1 SQL** : conditionné à validation explicite des 6 arbitrages.
