import type { Metadata } from 'next';
import { WizardStep3Sandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard Step 3',
};

/**
 * Sandbox de prévisualisation pour Step3Vesting.
 *
 * NE PAS exposer en prod : la page renvoie un message neutre via le check
 * `NODE_ENV !== 'production'` ci-dessous. NB : en App Router Next 16 les
 * dossiers commençant par `_` sont des "private folders" et ne deviennent
 * PAS des routes — on utilise donc `dev/` (sans underscore) plus le
 * NODE_ENV check pour fail-safe.
 *
 * Sert uniquement à valider visuellement le rendu du wizard step avant de
 * monter le wizard container complet (Module 3a §2.3, à venir).
 */
export default function DevWizardStep3Page() {
  if (process.env.NODE_ENV === 'production') {
    return <div className="text-muted-foreground p-12 text-center text-sm">Indisponible.</div>;
  }
  return <WizardStep3Sandbox />;
}
