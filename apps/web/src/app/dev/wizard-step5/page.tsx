import type { Metadata } from 'next';
import { WizardStep5Sandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard Step 5 · Capiwise',
};

export default function DevWizardStep5Page() {
  return <WizardStep5Sandbox />;
}
