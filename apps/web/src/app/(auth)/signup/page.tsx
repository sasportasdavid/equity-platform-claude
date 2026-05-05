import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TOS_VERSION } from '@/lib/legal/constants';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Créer un compte',
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm tosVersion={TOS_VERSION} />
    </Suspense>
  );
}
