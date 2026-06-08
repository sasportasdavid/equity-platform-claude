import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Mot de passe oublié · Capiwise',
};

export default function Page() {
  return <ForgotPasswordForm />;
}
