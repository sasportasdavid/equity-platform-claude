import type { Metadata } from 'next';
import { WizardStep6Sandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard Step 6 · Capiwise',
};

export default function DevWizardStep6Page() {
  return <WizardStep6Sandbox />;
}
