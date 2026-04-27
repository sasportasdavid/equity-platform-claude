import type { Metadata } from 'next';
import { WizardStep3Sandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard Step 3',
};

/**
 * Sandbox de prévisualisation pour Step3Vesting.
 *
 * Garde-fou prod centralisé dans `app/dev/layout.tsx` (404 en
 * production sauf si ENABLE_DEV_SANDBOX=true). Cette page est donc
 * inconditionnellement la sandbox.
 *
 * Sert uniquement à valider visuellement le rendu du wizard step avant
 * de monter le wizard container complet (Module 3a §2.3).
 */
export default function DevWizardStep3Page() {
  return <WizardStep3Sandbox />;
}
