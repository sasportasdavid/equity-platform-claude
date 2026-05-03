import Link from 'next/link';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import type { ComplianceAlertsSummary } from '@/server/queries/dashboard';
import { cn } from '@/lib/utils';

/**
 * Bloc bas droit du Dashboard CFO (~33% width) — Étape 12.
 *
 * Card "Alertes conformité" éditoriale qui liste les top alertes
 * remontées par `getOrgComplianceAlertsSummary()`.
 *
 * Anatomie (mockup 1) :
 * - Header overline brass-500 + h3 "Alertes conformité"
 * - Liste de blocs avec bordure-left 3px de la couleur sémantique :
 *   - severity ERROR  → bg `title-50` + bordure `title-500`
 *   - severity WARNING → bg `saffron-50` + bordure `saffron-500`
 * - Chaque bloc affiche : icône + nom de la ressource (PLAN ou AWARD),
 *   message court, code en mono, lien vers la ressource
 * - Empty state : icône ShieldCheck + copy "Tous les contrôles validés"
 */

export type ComplianceAlertsBlockProps = {
  data: ComplianceAlertsSummary;
  className?: string;
};

export function ComplianceAlertsBlock({ data, className }: ComplianceAlertsBlockProps) {
  const total = data.errorCount + data.warningCount;

  return (
    <div
      className={cn(
        'bg-card border-border/50 flex flex-col gap-4 rounded-lg border p-6',
        className,
      )}
      data-testid="compliance-alerts-block"
    >
      <header>
        <p className="text-overline text-brass-500">ALERTES · CONFORMITÉ</p>
        <h2 className="text-h3 text-ink-900 mt-1">
          {total === 0
            ? 'Tous les contrôles sont validés'
            : total === 1
              ? '1 alerte active'
              : `${total} alertes actives`}
        </h2>
      </header>

      {total === 0 ? <EmptyAlerts /> : <AlertsList alerts={data.topAlerts} />}

      {total > 0 ? (
        <Link
          href="/dashboard/plans?compliance=true"
          className="text-brass-700 hover:text-brass-900 mt-auto inline-flex items-center gap-1 self-start text-xs font-medium"
        >
          Examiner toutes les alertes
          <ArrowRight className="size-3" strokeWidth={1.5} />
        </Link>
      ) : null}
    </div>
  );
}

function AlertsList({ alerts }: { alerts: ComplianceAlertsSummary['topAlerts'] }) {
  return (
    <ul className="flex flex-col gap-2.5" role="list">
      {alerts.map((a) => (
        <AlertCard
          key={`${a.resourceType}-${a.resourceId}-${a.code}`}
          severity={a.severity}
          resourceType={a.resourceType}
          resourceId={a.resourceId}
          resourceName={a.resourceName}
          code={a.code}
          message={a.message}
        />
      ))}
    </ul>
  );
}

function AlertCard({
  severity,
  resourceType,
  resourceId,
  resourceName,
  code,
  message,
}: {
  severity: 'ERROR' | 'WARNING';
  resourceType: 'PLAN' | 'AWARD';
  resourceId: string;
  resourceName: string;
  code: string;
  message: string;
}) {
  const isError = severity === 'ERROR';
  const tone = isError
    ? {
        bg: 'bg-title-50',
        borderLeft: 'border-l-title-500',
        textTitle: 'text-title-700',
        iconColor: 'text-title-500',
      }
    : {
        bg: 'bg-saffron-50',
        borderLeft: 'border-l-saffron-500',
        textTitle: 'text-saffron-700',
        iconColor: 'text-saffron-500',
      };

  const href =
    resourceType === 'PLAN' ? `/dashboard/plans/${resourceId}` : `/dashboard/awards/${resourceId}`;

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex flex-col gap-1.5 rounded-md border-l-[3px] px-3 py-2.5 transition-colors',
          tone.bg,
          tone.borderLeft,
          'hover:opacity-90',
        )}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn('size-3.5', tone.iconColor)} strokeWidth={1.75} />
          <span className={cn('text-overline', tone.textTitle)}>
            {severity} · {resourceType}
          </span>
        </div>
        <p className="text-ink-900 text-sm font-medium leading-tight">{resourceName}</p>
        {message ? <p className="text-ink-700 text-xs leading-snug">{message}</p> : null}
        <p className="text-ink-500 mt-0.5 font-mono text-[10px]">{code}</p>
      </Link>
    </li>
  );
}

function EmptyAlerts() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
      <div className="bg-bond-50 flex size-12 items-center justify-center rounded-full">
        <ShieldCheck className="text-bond-500 size-6" strokeWidth={1.5} />
      </div>
      <p className="serif-italic text-ink-700 max-w-xs text-center text-sm leading-relaxed">
        Aucune alerte de conformité active sur vos plans en cours.
      </p>
    </div>
  );
}
