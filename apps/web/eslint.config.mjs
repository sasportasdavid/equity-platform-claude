import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Design System V2 B1b — interdit le pattern `hsl(var(--xxx))` qui est
  // CSS invalide dans Capiwise (les tokens DS V1 sont stockés en HEX direct,
  // pas en triplet HSL). Cf bug PR #30 + memory/design_system_v2_inventory.md Q2.
  // Utiliser `rgba(R, G, B, A)` directement (ex: brass-500 → `rgba(184, 134, 91, A)`).
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      // react/no-unescaped-entities : règle legacy qui flague les apostrophes/
      // guillemets dans le JSX. Sur une app 100 % francophone (« l'attribution »,
      // « d'exercice »…) c'est du bruit pur — React rend ces caractères sans
      // ambiguïté. Désactivée volontairement (audit 2026-06-10 P0-6) pour ne pas
      // imposer des `&apos;` partout.
      'react/no-unescaped-entities': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/hsl\\(var\\(--/]",
          message:
            "hsl(var(--xxx)) est invalide dans ce repo : les tokens DS V1 stockent du HEX direct (#b8865b), pas un triplet HSL. Utilise rgba(R, G, B, A) directement. Réf : memory/design_system_v2_inventory.md Q2.",
        },
        {
          selector: "TemplateElement[value.cooked=/hsl\\(var\\(--/]",
          message:
            "hsl(var(--xxx)) est invalide dans ce repo : les tokens DS V1 stockent du HEX direct (#b8865b), pas un triplet HSL. Utilise rgba(R, G, B, A) directement. Réf : memory/design_system_v2_inventory.md Q2.",
        },
      ],
    },
  },
]);

export default eslintConfig;
