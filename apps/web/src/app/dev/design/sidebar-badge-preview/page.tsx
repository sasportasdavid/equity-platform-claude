import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardSidebar } from '@/components/shared/dashboard-sidebar';

export const metadata = { title: 'Dev — Sidebar Badge Preview' };

/**
 * Sandbox /dev/design/sidebar-badge-preview — Étape 14 commit 7/7+.
 *
 * Rend la DashboardSidebar avec différents counts pour valider que le
 * compteur badge SSR Module 5 B4 reste fonctionnel après la refonte
 * Étape 5.
 *
 * Couvre 3 cas :
 *   1. count = 0 (badge masqué)
 *   2. count = 3 (badge visible "approbations en attente")
 *   3. count = 99+ (saturation)
 */

export default function SidebarBadgePreviewPage() {
  return (
    <div className="bg-paper-100 min-h-screen">
      <header className="border-paper-300 border-b px-6 py-4">
        <Link
          href="/dev/design"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          /dev/design
        </Link>
        <p className="text-overline text-brass-500 mt-3">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          Sidebar <span className="serif-italic text-brass-500">compteur badge SSR</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-3xl text-sm leading-relaxed">
          Vérification que le compteur badge SSR sur le lien
          <code className="bg-paper-200 mx-1 rounded px-1 font-mono">/dashboard/approvals</code>
          (Module 5 B4) reste fonctionnel après la refonte Étape 5. API{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">pendingApprovalsCount</code>{' '}
          inchangée.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-12 p-8 lg:grid-cols-3">
        <section className="space-y-3">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 1</p>
            <h2 className="text-h3 text-ink-900">count = 0</h2>
            <p className="text-ink-500 mt-1 text-xs">
              Badge masqué (pas d&apos;approbations en attente)
            </p>
          </div>
          <div
            className="bg-paper-200 border-paper-300 flex overflow-hidden rounded-lg border"
            style={{ height: 520 }}
          >
            <DashboardSidebar pendingApprovalsCount={0} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 2</p>
            <h2 className="text-h3 text-ink-900">count = 3</h2>
            <p className="text-ink-500 mt-1 text-xs">
              Badge bullet brass à droite du label «&nbsp;Approbations&nbsp;»
            </p>
          </div>
          <div
            className="bg-paper-200 border-paper-300 flex overflow-hidden rounded-lg border"
            style={{ height: 520 }}
          >
            <DashboardSidebar pendingApprovalsCount={3} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 3</p>
            <h2 className="text-h3 text-ink-900">count = 142</h2>
            <p className="text-ink-500 mt-1 text-xs">Saturation (badge «&nbsp;99+&nbsp;» max)</p>
          </div>
          <div
            className="bg-paper-200 border-paper-300 flex overflow-hidden rounded-lg border"
            style={{ height: 520 }}
          >
            <DashboardSidebar pendingApprovalsCount={142} />
          </div>
        </section>
      </div>
    </div>
  );
}
