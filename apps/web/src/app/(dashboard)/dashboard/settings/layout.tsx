import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { SettingsNav } from './settings-nav';

export const metadata: Metadata = {
  title: 'Paramètres',
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1">
        <h1 className="mb-3 text-lg font-semibold tracking-tight">Paramètres</h1>
        <SettingsNav />
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
