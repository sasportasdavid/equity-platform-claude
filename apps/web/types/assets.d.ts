// Déclarations de types pour les imports d'assets statiques (PNG/JPG/SVG…)
// importés comme modules (ex. `import img from '../../public/x.png'` dans
// components/marketing/visuals.tsx, servi via next/image avec placeholder blur).
//
// Normalement fournies par `next-env.d.ts` (`/// <reference types="next/image-types/global" />`),
// mais next-env.d.ts est gitignoré (généré par `next dev`/`build`) → absent en CI,
// où `tsc --noEmit` tournait sans build préalable. Ce fichier committé garantit
// les types d'assets dans tous les environnements (audit 2026-06-10, fix CI).
/// <reference types="next/image-types/global" />
