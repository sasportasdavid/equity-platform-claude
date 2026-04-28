import type { Metadata } from 'next';
import { WizardFullSandbox } from './sandbox';

export const metadata: Metadata = {
  title: '[dev] Wizard complet · Capiwise',
};

export default function DevWizardFullPage() {
  return <WizardFullSandbox />;
}
