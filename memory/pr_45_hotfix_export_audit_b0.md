---
name: PR #45 — Hotfix export PR #42 audit B0
description: B0 — 3 questions du brief + identification réelle des root causes (revalidatePath théorie FAUSSE) + plan B1-B5
type: project
---

# B0 — PR #45 Hotfix export PR #42

**Date** : 2026-05-05
**Branche** : `feat/module-13-hotfix-export-download-ux` (depuis master `a35b89c`)
**Brief** : `BRIEF_PR_45_HOTFIX_EXPORT.md` (chat user)
**QA report** : `docs/qa-exploratory-2026-05-05.md` (sur master)

> **Status** : B0 strict réalisé — **2 théories root cause du brief sont FAUSSES** (revalidatePath absent du code, AuditExportButton fait bien le Blob download). Vraies root causes ailleurs. Solution route handler du brief reste **la bonne architecture** mais pour des raisons différentes. STOP recommandé pour valider le diagnostic réel avant de coder.

---

## 1. Q1 — AuditExportButton, comment appelle-t-il les SAs ?

**Lecture `apps/web/src/components/audit/AuditExportButton.tsx` (commit master post-PR #42)** :

Le composant client fait **EXACTEMENT** le pattern décrit dans le brief :

- L99-103 : décode `result.base64` PDF → `Uint8Array` → `Blob`
- L105-112 : `URL.createObjectURL(blob)` → `<a download={filename}>` → `a.click()` → `URL.revokeObjectURL(url)`

**Conclusion Q1** : Le composant est **techniquement correct**. La théorie "ne convertit PAS le buffer" du brief Bug #3 est **FAUSSE**.

→ Si JSON ne télécharge pas, ce n'est pas le composant. C'est ailleurs (Next.js Server Actions roundtrip).

## 2. Q2 — Server Actions, y a-t-il `revalidatePath` ?

**Grep exhaustif** sur les 3 SAs `audit-export-{json,pdf,csv}.ts` + `audit-report-pdf.tsx` :

```
grep "revalidatePath\|revalidate" → 0 occurrences
```

**Conclusion Q2** : **AUCUN `revalidatePath` dans le code export**. La théorie Bug #4 P0 du brief est **FAUSSE**.

→ Les 345+ requêtes `?_rsc=...` ne viennent PAS d'un `revalidatePath` explicite.

## 3. Q3 — Structure réelle d'un award.status_changed avant/après

**Code `JsonDiffView.tsx` + `lib/audit/json-diff.ts`** :

`computeJsonDiff(before, after)` est défensif :

```ts
const beforeObj = before ?? {};
const afterObj = after ?? {};
const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
```

`formatDiffValue(value)` catch les `JSON.stringify` cycle :

```ts
try {
  return JSON.stringify(value, null, 2);
} catch {
  return String(value);
}
```

→ **Crash improbable côté code** sauf cas edge non identifié sans repro. Théorie Bug #5 ("structure JSON inattendue") restée à investiguer en live preview.

---

## 4. Vraies root causes (analyse approfondie)

### Bug #4 P0 PDF infinite RSC loop — vraie cause

Ce que le brief dit : ❌ revalidatePath
Ce qui est réel : Probablement le pattern **Server Action returns large base64**.

Mécanisme suspecté :

1. SA retourne `{ ok: true, base64: <1-2 MB string PDF> }`
2. Next.js App Router en post-Server-Action workflow déclenche un router refresh implicite (cache invalidation native pour Server Actions)
3. Le router refresh fetch tous les RSC payloads des routes proches (sidebar, etc.)
4. Avec un payload volumineux dans le scope, certains chemins recompute → réfetch en chaîne
5. UI freeze pendant que le browser traite les 345 requêtes parallèles

**Conclusion** : la solution route handler `/api/audit/export` du brief **est la bonne architecture** — pas pour la raison `revalidatePath`, mais parce que :

- Route handlers ne déclenchent **pas** le auto-refresh post-Server-Action de Next.js
- Streaming binaire natif via `Response` (pas de base64 roundtrip)
- Browser handle natif `Content-Disposition: attachment` → download direct sans JS roundtrip

### Bug #3 P1 JSON silent download — vraie cause

Ce que le brief dit : ❌ ne convertit pas le buffer
Ce qui est réel : Le composant convertit bien. Probablement **même cause que Bug #4** (Next.js SA + grand payload + router refresh).

Si la SA JSON retourne `result.json` (1-100KB string) → comportement OK pour les petits payloads, mais le router refresh implicite peut quand même se déclencher si le browser est en cache poll mode.

**Conclusion** : route handler résout aussi Bug #3 par construction.

### Bug #5 P1 drawer crash award.status_changed — vraie cause TBD

Le code paraît défensif. Sans repro live je ne peux pas confirmer. Hypothèses :

- Stack overflow sur un object profondément nested ?
- React rendering issue avec un fragment qui contient des `<>{nested}</>` malformé ?
- Crash dans `verbalizeEvent` (le helper PR #39, pas dans json-diff) ?

→ **Action B3** : ajouter try/catch + fallback "Diff non disponible" dans `JsonDiffView` ET dans le `AuditEventDetailContent` parent. Defense-in-depth : si une section crash, les autres rendent quand même.

### Bug #6 P2 MetadataView audit.exported empty fields — vraie cause

`formatDiffValue({})` retourne `JSON.stringify({}, null, 2)` = string `"{}"`. Le `<dd>` rend bien la string `"{}"` mais le CSS `.cw-audit-kv dd` n'a **pas** de `white-space: pre-wrap`. Résultat :

- Pour `filters: {}` → affiche `"{}"` (visible, juste pas très joli)
- Pour `filters: { from: "...", types: ["plan"] }` → affiche un blob inline sans newlines préservées (newlines collapsées)
- Pour `event_count: 47` → affiche `47` (devrait être OK)

User dit "valeurs invisibles". Hypothèse : pour `filters: {}` le rendu `"{}"` semble vide visuellement (2 chars en mono ink-900), pas "invisible" stricto sensu. Pour des objets non-vides, le manque de `white-space: pre-wrap` fait des oneliners horribles.

→ **Action B4** :

1. Ajouter `white-space: pre-wrap` au CSS `.cw-audit-kv dd > pre` ou wrapper les valeurs object/array dans `<pre>`
2. Étendre `formatDiffValue` pour : empty object → "—" ou "(aucun filtre)", array → join virgule, number → toString fr-FR (déjà le cas)
3. Voire un sous-composant `<MetadataValue>` qui rend différemment selon le type (pretty JSON pour objects, fr-FR pour numbers, etc.)

---

## 5. Plan B1-B5 (suit le brief, root causes corrigées)

| Phase | Description                                                                                                             | Fichiers |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| B1    | Route `/api/audit/export/route.ts` (GET, 3 formats, permission gate, Response streamed)                                 | nouveau  |
| B2    | Refactor `AuditExportButton` → `<a href="/api/audit/export?...">` direct download                                       | modifié  |
| B3    | Defensive `AuditEventDetailContent` + `JsonDiffView` (try/catch + Boundary fallback "Diff non disponible")              | modifié  |
| B4    | Étendre `MetadataView` + `formatDiffValue` (Number/Array/Object/empty) + CSS `<pre>` wrapping                           | modifié  |
| B5    | Tests : 1 unit `audit-export-route.test.ts` + 2 E2E `audit-export-download.spec.ts` + `audit-event-drawer-diff.spec.ts` | nouveaux |

**Préservation** : les Server Actions `exportAuditReportJson/Pdf/Csv` restent en place pour les **tests Vitest** (mocks RBAC + Supabase). Elles ne sont juste plus appelées depuis l'UI. Pas de breaking change.

**Cap effort** : ~1h (route handler + refactor button + defensive ~30min, MetadataView ext + tests E2E ~30min).

---

## 6. Décisions à valider (David)

1. **OK pour route handler `/api/audit/export`** au lieu des Server Actions depuis UI ? Mon avis : OUI (architecture plus saine, browser-native download).
2. **Garder les Server Actions pour les tests Vitest** ou les supprimer entièrement ? Mon avis : **garder** (tests pure du builder + permission gate restent valides, suppression = perte de couverture).
3. **Bug #5 sans repro** : OK pour défensiver le rendu sans connaître la vraie cause ? Mon avis : OUI (try/catch boundary = filet de sûreté, pas un fix de root cause mais une protection en attendant).
4. **Bug #6 MetadataView** : `<pre>` wrap pour objets/arrays + transformer empty `{}` en "—" ? Mon avis : OUI (UX clean, pas de breaking).

---

## ✅ Conclusion B0

**Théories root cause du brief partiellement fausses** (revalidatePath absent, button code correct). Vraies causes liées à Next.js Server Actions + large payload + router refresh implicite, pas à des bugs codé.

**La solution architecture route handler du brief reste la bonne**. Cap effort respecté.

**STOP recommandé pour validation des 4 décisions §6 avant B1**.

Si validation rapide, démarrage B1-B5 immédiat (~1h).
