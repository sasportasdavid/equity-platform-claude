# EODHD ticker mapping reference

Source : `supabase/functions/_shared/marketDataService.ts` (`INDEX_MAPPINGS`,
`INDEX_ETF_FALLBACKS`, `YAHOO_TO_EODHD_EXCHANGE`).

Cette table est utilisée par les EFs `market-data-fetch` et
`market-data-peer-group` pour convertir les tickers Yahoo (saisis par
l'utilisateur dans le wizard step 4) vers le format EODHD attendu.

## Convention

EODHD utilise des codes par exchange (suffixe `.PA` pour Euronext Paris,
`.XETRA` pour Frankfurt, `.LSE` pour Londres) ET un exchange dédié
**`.INDX`** pour les indices boursiers (souvent réservé à un plan
souscription Indices premium).

Pour chaque indice, on a 2 options possibles :

- **`.INDX`** : valeur réelle de l'indice (~7800 pour le CAC 40)
- **ETF tracker** sur l'exchange standard (Lyxor `CAC.PA` à ~80 €)

Pour un calcul TSR relatif vs indice (% spread), les 2 options donnent
le même résultat car le spread est invariant à l'échelle. Pour l'absolu
(`S0` IFRS 2 audit), préférer `.INDX`.

## Mappings actuels (post-PR #23)

| Yahoo ticker   | EODHD primary (.INDX) | ETF fallback   | Notes                                             |
| -------------- | --------------------- | -------------- | ------------------------------------------------- |
| `^FCHI`        | `FCHI.INDX`           | `CAC.PA`       | CAC 40 — fix PR #23, était mal mappé sur `CAC.PA` |
| `^STOXX50E`    | `SX5E.INDX`           | `SX5EEX.XETRA` | Euro STOXX 50                                     |
| `^STOXX`       | `SXXP.INDX`           | `EXSA.XETRA`   | STOXX Europe 600                                  |
| `^GDAXI`       | `GDAXI.INDX`          | —              | DAX                                               |
| `^FTSE`        | `FTSE.INDX`           | —              | FTSE 100                                          |
| `^GSPC`        | `GSPC.INDX`           | —              | S&P 500                                           |
| `^DJI`         | `DJI.INDX`            | —              | Dow Jones                                         |
| `^IXIC`        | `IXIC.INDX`           | —              | NASDAQ                                            |
| `^VIX`         | `VIX.INDX`            | —              | VIX                                               |
| `^SX3P → SXTP` | `SX*P.INDX`           | `EX*1.XETRA`   | STOXX 600 sectoriels (ETFs iShares)               |

Pattern générique pour les `^XXX` non listés : `XXX.INDX` (cf.
`convertToEODHDTicker` ligne 199-203).

## Bug E2E PR #19 — résolu en PR #23

Avant fix : `'^FCHI': 'CAC.PA'` (commentaire trompeur "CAC 40 on Euronext")
→ EODHD retournait le prix de l'**ETF Lyxor CAC 40 PEA** (~80 €) ou de
l'**action Crédit Agricole SA**, PAS l'indice CAC 40.

Conséquences pour TSR_REL_INDEX SNAPSHOT :

- `reference_index_s0` saisi à 80 € au lieu de ~8000
- Spread relatif % toujours correct (échelle-invariant)
- MAIS `S0` absolu faux dans `valuation_runs.payload_sent` → audit IFRS 2.46 dégradé
- ET `fair_value_per_unit` sur tableaux UI affichant l'index incorrect

Après fix : `'^FCHI': 'FCHI.INDX'` (indice direct).

## Validation côté David post-merge PR #23

Le user doit valider via curl avec sa clé EODHD (`EODHD_API_KEY` du secret
EF) que les tickers sont bien servis :

\`\`\`bash
read -s EODHD_KEY # collez la clé sans l'exposer
echo

# Test 1 — vrai indice CAC 40 (devrait retourner ~7800-8200)

curl "https://eodhd.com/api/eod/FCHI.INDX?api_token=$EODHD_KEY&fmt=json&period=d&order=d&from=2026-04-01" | head -c 500

# Test 2 — ETF fallback (devrait retourner ~80-90)

curl "https://eodhd.com/api/eod/CAC.PA?api_token=$EODHD_KEY&fmt=json&period=d&order=d&from=2026-04-01" | head -c 500

# Test 3 — alternative possible (PX1 = code Euronext direct, à tester si FCHI.INDX fail)

curl "https://eodhd.com/api/eod/PX1.INDX?api_token=$EODHD_KEY&fmt=json&period=d&order=d&from=2026-04-01" | head -c 500
\`\`\`

Si `FCHI.INDX` retourne 404 ou prix anormal :

1. Tester `PX1.PA` (Euronext direct stock-style)
2. Tester `PX1.INDX`
3. Garder `CAC.PA` comme fallback ETF (≈ 80 €, déjà documenté)

## Tickers non couverts (V2)

À ajouter si l'user en a besoin :

- `^IBEX` → `IBEX.INDX` (Espagne)
- `^AEX` → `AEX.INDX` (Pays-Bas)
- `^SSMI` → `SSMI.INDX` (Suisse)
- `^BFX` → `BFX.INDX` (Belgique)
- `^N225` → `N225.INDX` (Japon)
- `^HSI` → `HSI.INDX` (Hong Kong)
- `^NDX` → `NDX.INDX` (NASDAQ-100)

Pour l'instant le pattern générique `^XXX → XXX.INDX` les couvre par
défaut, mais sans ETF fallback.
