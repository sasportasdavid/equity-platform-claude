import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Garde-fou prod pour TOUTES les routes `/dev/*`.
 *
 * Comportement :
 *  - En dev (`NODE_ENV !== 'production'`) → laisse passer.
 *  - En prod (`NODE_ENV === 'production'`) → 404 sauf si `ENABLE_DEV_SANDBOX=true`
 *    (échappatoire pour un déploiement preview où l'on veut accéder aux
 *    sandboxes de validation visuelle sans repasser en NODE_ENV=development).
 *
 * Le check est centralisé ici plutôt que dupliqué sur chaque page : tout
 * nouvel outil interne créé sous `/dev/` hérite automatiquement de la
 * protection.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  const isProduction = process.env.NODE_ENV === 'production';
  const sandboxEnabled = process.env.ENABLE_DEV_SANDBOX === 'true';
  if (isProduction && !sandboxEnabled) {
    notFound();
  }
  return <>{children}</>;
}
