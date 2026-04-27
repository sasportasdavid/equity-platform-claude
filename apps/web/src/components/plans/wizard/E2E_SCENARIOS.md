# Wizard plan — scénarios E2E manuels

Sandbox : `/dev/wizard-full` (mocks `onSubmit` / `saveDraft` ; ne touche pas la DB).
Route prod : `/dashboard/plans/new` (vraies Server Actions, requiert
`plans.create` permission + une organisation active).

Ces scénarios sont à rejouer manuellement tant que Playwright n'est pas
configuré (cf. memory `module_3a_wizard_final_closure.md` TODO 8).

---

## 1 — Bootstrap minimal (BSPCE simple)

1. Vider `localStorage.plan-wizard-draft`
2. Charger `/dev/wizard-full`
3. Step 1 — laisser BSPCE sélectionné par défaut → **Suivant**
4. Step 2 — remplir :
   - Nom : `Plan E2E Test`
   - Date conseil : `2026-01-15`
   - Date d'attribution : auto-copiée
   - Pool : `50000`
   - Prix d'exercice : `1.5`
     → **Suivant**
5. Step 3 — sélectionner mode `single` + date `2030-01-15` → **Suivant**
6. Step 4 — laisser `hasPerformanceConditions` désactivé → **Suivant**
7. Step 5 — preset rapide « Standard FR Tech » → **Suivant**
8. Step 6 — remplir :
   - Sous-jacent : `12.5`
   - Volatilité : `32`
   - Taux sans risque : `3.5`
   - Dividend Yield : `2`
   - Horizon : `4`
     → **Suivant**
9. Step 7 — vérifier le récap → **Créer le plan**

**Attendu** : bandeau vert `✓ Plan créé avec succès — id plan-mock-xxx`,
sidebar avec 7 ✓ verts, localStorage purgé.

---

## 2 — Auto-save localStorage round-trip

1. Sur `/dev/wizard-full`, naviguer Step 1 → Step 2
2. Saisir `Nom : "DRAFT TEST E2E"`
3. Attendre 700 ms (debounce localStorage = 500 ms)
4. Vérifier `localStorage.plan-wizard-draft` contient `data.name = "DRAFT TEST E2E"`
   et `savedAt` ISO8601
5. **Rafraîchir la page** (F5 ou `window.location.reload()`)
6. Au mount, bandeau bleu visible :
   `Brouillon restauré depuis le navigateur. Vous pouvez continuer ou tout recommencer.`
7. Cliquer Step 2 dans la sidebar (visited après navigation initiale)
8. Vérifier que le champ nom contient `DRAFT TEST E2E`

**Attendu** : restauration silencieuse + bandeau info visible jusqu'au
clic « tout recommencer ».

---

## 3 — Effacement brouillon

Pré-condition : un brouillon existe dans localStorage (cf. scénario 2).

1. Cliquer **Effacer brouillon** (footer)
2. Vérifier `localStorage.plan-wizard-draft` est `null`
3. Vérifier que le bandeau « Brouillon restauré » disparaît

**Attendu** : purge immédiate + footer revient en état "Brouillon
enregistré automatiquement." (italique).

---

## 4 — Submit final efface le brouillon

Pré-condition : compléter le scénario 1 jusqu'à Step 7.

1. Cliquer **Créer le plan**
2. Bandeau succès affiché
3. Vérifier `localStorage.plan-wizard-draft` est `null`

**Attendu** : `clearDraft()` automatiquement appelé après succès.

---

## 5 — Validation cross-step bloque le submit

1. Sur `/dev/wizard-full`, cliquer Step 7 directement (sidebar)
   - Refusé car Step 7 n'a pas été visité (cadenas)
2. Naviguer normalement Step 1 → Step 2 sans remplir les champs requis
3. Cliquer **Suivant** sur Step 2 → reste bloqué (validation Zod)
4. Vérifier que les erreurs FR sont visibles inline

**Attendu** : `wizard.next()` retourne false si validation échoue,
l'utilisateur reste sur le step courant.

---

## 6 — Switch chaotique conditions Step 4 (cf. memory step4 closure)

Vérification que `cleanConditionForType` purge correctement les champs
orphelins au switch de type :

1. Sur `/dev/wizard-step4` (sandbox dédiée), preset `EBITDA ≥ 50 M€`
2. Switch type NON_MARKET → SERVICE → MARKET (SHARE_PRICE) → MARKET
   (TSR_REL_PEERS) → NON_MARKET
3. Vérifier qu'à chaque étape, le form state ne contient AUCUN champ
   orphelin du type précédent (dump `methods.formState.values` via
   le panneau debug en bas).

**Attendu** : ✓ déjà validé dans step 4 closure (cf. fix `237f2ae`).
