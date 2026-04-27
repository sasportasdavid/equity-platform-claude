import type { Metadata } from 'next';
import { CreateOrgForm } from './create-org-form';

export const metadata: Metadata = {
  title: 'Créer votre organisation',
};

export default function CreateOrgPage() {
  return <CreateOrgForm />;
}
