import { Card, CardContent } from '@/components/ui/card';
import { computeVestedPercentage } from '@/lib/portal/vesting';

/**
 * Module 8 B3 — Section "Synthèse" de la page détail award (§4.3 section 1).
 *
 * 4 cards stat horizontales :
 *   1. Acquises (units_vested)
 *   2. Pourcentage acquis (avec barre de progression)
 *   3. Prix d'exercice (ou "—" si AGA)
 *   4. Date d'attribution (français long)
 */
export function AwardOverview({
  unitsGranted,
  unitsVested,
  exercisePrice,
  grantDate,
}: {
  unitsGranted: number;
  unitsVested: number;
  exercisePrice: string | number | null;
  grantDate: string;
}) {
  const percent = computeVestedPercentage(unitsVested, unitsGranted);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Unités acquises"
        value={formatNumber(unitsVested)}
        sub={`sur ${formatNumber(unitsGranted)}`}
      />
      <StatCard
        label="Pourcentage acquis"
        value={`${percent}%`}
        sub={
          <div
            className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="bg-primary h-full transition-all" style={{ width: `${percent}%` }} />
          </div>
        }
      />
      <StatCard
        label="Prix d'exercice"
        value={
          exercisePrice !== null && exercisePrice !== undefined ? formatPrice(exercisePrice) : '—'
        }
        sub={exercisePrice !== null && exercisePrice !== undefined ? 'par unité' : 'gratuit (AGA)'}
      />
      <StatCard label="Date d'attribution" value={formatLongDate(grantDate)} sub="Plan signé" />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string | React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {typeof sub === 'string' ? <p className="text-muted-foreground text-xs">{sub}</p> : sub}
      </CardContent>
    </Card>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatPrice(p: string | number): string {
  const value = typeof p === 'string' ? parseFloat(p) : p;
  if (Number.isNaN(value)) return String(p);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatLongDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];
  const day = parseInt(iso.slice(8, 10), 10);
  const month = months[parseInt(iso.slice(5, 7), 10) - 1];
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}
