import type { Metadata } from 'next';
import { WizardStep4Sandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard Step 4',
};

export default function DevWizardStep4Page() {
  return <WizardStep4Sandbox />;
}
