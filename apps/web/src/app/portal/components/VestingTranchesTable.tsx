import { Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VestingTimelineEntry } from '@/lib/portal/vesting';

/**
 * Module 8 B3 — Table des tranches de vesting (passées + futures).
 *
 * Server Component (table statique). Mobile-first : la colonne "Acquises"
 * est masquée sous md (sinon trop dense sur 375px).
 */
export function VestingTranchesTable({ timeline }: { timeline: VestingTimelineEntry[] }) {
  if (timeline.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas de tranches d&apos;acquisition à afficher.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border" data-testid="portal-vesting-tranches">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-muted-foreground text-left text-xs">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Unités à acquérir</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Acquises</th>
            <th className="px-3 py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((entry, idx) => (
            <tr
              key={`${entry.date}-${idx}`}
              className="border-t"
              data-testid="portal-vesting-tranche-row"
            >
              <td className="px-3 py-2 font-mono text-xs">{formatDate(entry.date)}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(entry.unitsToVest)}</td>
              <td className="hidden px-3 py-2 tabular-nums md:table-cell">
                {formatNumber(entry.unitsVested)}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={entry.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: VestingTimelineEntry['status'] }) {
  if (status === 'VESTED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        )}
      >
        <Check className="size-3" />
        Acquis
      </span>
    );
  }
  if (status === 'FORFEITED' || status === 'CANCELLED') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
        )}
      >
        <X className="size-3" />
        {status === 'FORFEITED' ? 'Perdu' : 'Annulé'}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      <Clock className="size-3" />À venir
    </span>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
