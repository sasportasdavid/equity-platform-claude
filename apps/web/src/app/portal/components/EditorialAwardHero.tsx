import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import type { VestingTimelineEntry } from '@/lib/portal/vesting';

/**
 * Editorial hero du portail bénéficiaire — détail award (mockup 2 §4.3).
 *
 * Étape 14 du Design System V1.
 *
 * Anatomie typographique 3 lignes (mockup 2) :
 *   1. Overline brass-500 "VOTRE ATTRIBUTION · {plan_type}"
 *   2. Titre serif Fraunces sur 2 lignes :
 *      "Vous détenez {units_granted} {plan_type}"
 *      "sur {plan_name}."  (avec accent serif italic brass-500)
 *   3. TitleRule cuivre 64px
 *   4. Subtitle status badge + grant_date long format
 *
 * 3 cards adaptatives (mockup 2) — Card 2 conditionnelle à 3 niveaux :
 *   - Card 1 (toujours) : UNITÉS · ACQUISES — units_vested / units_granted
 *   - Card 2 (conditionnel) :
 *     * Si exercise_price != null → "PRIX · D'EXERCICE" + value €
 *     * Sinon si status in {DRAFT, GRANTED} → "DATE · D'ATTRIBUTION"
 *     * Sinon → "STATUT" + StatusBadge
 *   - Card 3 (toujours) : PROCHAINE TRANCHE — next_vesting_date + units
 *
 * **Aucun calcul de gain en €** (interdit spec Module 8 §1111).
 */

const PLAN_TYPE_TONE: Record<string, StatusBadgeTone> = {
  BSPCE: 'brass',
  AGA: 'bond',
  STOCK_OPTION: 'saffron',
  PHANTOM: 'slate',
  BSA: 'brass',
  RSU: 'slate',
};

const PLAN_TYPE_LABEL: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
  PHANTOM: 'Phantom',
  BSA: 'BSA',
  RSU: 'RSU',
};

const STATUS_LABEL: Record<string, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  PROPOSED: { label: 'Proposé', tone: 'saffron' },
  PENDING_APPROVAL: { label: 'En approbation', tone: 'saffron' },
  APPROVED: { label: 'Approuvé', tone: 'bond' },
  REJECTED: { label: 'Rejeté', tone: 'title' },
  SENT_FOR_SIGNATURE: { label: 'En signature', tone: 'brass' },
  SIGNED: { label: 'Signé', tone: 'brass' },
  GRANTED: { label: 'Octroyé', tone: 'bond' },
  VESTING: { label: 'Vesting en cours', tone: 'bond' },
  VESTED: { label: 'Acquis', tone: 'bond' },
  EXERCISED: { label: 'Exercé', tone: 'bond' },
  CANCELLED: { label: 'Annulé', tone: 'slate' },
  FORFEITED: { label: 'Renoncé', tone: 'title' },
  EXPIRED: { label: 'Expiré', tone: 'slate' },
};

export type EditorialAwardHeroProps = {
  awardNumber: string;
  awardStatus: string;
  unitsGranted: number;
  unitsVested: number;
  exercisePrice: string | number | null;
  grantDate: string;
  planName: string;
  planType: string;
  /** Timeline pour calculer la prochaine tranche */
  timeline: ReadonlyArray<VestingTimelineEntry>;
};

export function EditorialAwardHero({
  awardNumber,
  awardStatus,
  unitsGranted,
  unitsVested,
  exercisePrice,
  grantDate,
  planName,
  planType,
  timeline,
}: EditorialAwardHeroProps) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextTranche = timeline.find((t) => t.date > todayIso && t.status === 'PENDING');
  const planTypeTone = PLAN_TYPE_TONE[planType] ?? 'slate';
  const planTypeLabel = PLAN_TYPE_LABEL[planType] ?? planType;
  const statusCfg = STATUS_LABEL[awardStatus] ?? { label: awardStatus, tone: 'slate' as const };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Link
        href="/portal/awards"
        className="text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} />
        Mes attributions
      </Link>

      {/* Hero typographique 3 lignes */}
      <header className="space-y-2">
        <p className="text-overline text-brass-500">
          VOTRE ATTRIBUTION · {planTypeLabel.toUpperCase()}
        </p>
        <h1 className="text-h1 text-ink-900 leading-tight">
          Vous détenez{' '}
          <span className="serif-italic text-brass-500">
            {formatNumber(unitsGranted)} {planTypeLabel}
          </span>
          <br />
          sur {planName}.
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge tone={planTypeTone} pattern="solid">
            {planTypeLabel}
          </StatusBadge>
          <StatusBadge tone={statusCfg.tone} pattern="solid">
            {statusCfg.label}
          </StatusBadge>
          <span className="text-ink-500 ml-1 font-mono text-xs">
            {awardNumber} · attribué le {formatLongDate(grantDate)}
          </span>
        </div>
      </header>

      {/* 3 cards adaptatives — mockup 2 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Card 1 — Unités acquises (toujours) */}
        <HeroCard
          label="UNITÉS · ACQUISES"
          value={formatNumber(unitsVested)}
          unit="u."
          contextLine={
            unitsVested === 0
              ? `Pas encore acquis · sur ${formatNumber(unitsGranted)} u. attribuées`
              : `sur ${formatNumber(unitsGranted)} u. attribuées (${computePercent(unitsVested, unitsGranted)} %)`
          }
        />

        {/* Card 2 — Conditionnel à 3 niveaux */}
        {exercisePrice !== null && exercisePrice !== undefined ? (
          <HeroCard
            label="PRIX · D'EXERCICE"
            value={formatPrice(exercisePrice)}
            contextLine={
              planType === 'BSPCE' ? 'Prix fixé au Conseil · BSPCE' : `Prix fixé · ${planTypeLabel}`
            }
          />
        ) : awardStatus === 'DRAFT' || awardStatus === 'GRANTED' ? (
          <HeroCard
            label="DATE · D'ATTRIBUTION"
            value={formatLongDate(grantDate)}
            contextLine={`Octroyé · ${planTypeLabel}`}
          />
        ) : (
          <HeroCardStatus label="STATUT" status={statusCfg} />
        )}

        {/* Card 3 — Prochaine tranche */}
        {nextTranche ? (
          <HeroCard
            label="PROCHAINE · TRANCHE"
            value={formatLongDate(nextTranche.date)}
            contextLine={`+${formatNumber(nextTranche.unitsToVest)} u. à acquérir`}
          />
        ) : (
          <HeroCard
            label="PROCHAINE · TRANCHE"
            value="—"
            isMuted
            contextLine={
              timeline.length === 0
                ? 'Calendrier non encore défini'
                : 'Toutes les tranches sont passées'
            }
          />
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Internal cards
// ============================================================================

function HeroCard({
  label,
  value,
  unit,
  contextLine,
  isMuted,
}: {
  label: string;
  value: string;
  unit?: string;
  contextLine?: string;
  isMuted?: boolean;
}) {
  return (
    <div
      className="bg-paper-50 border-paper-300 flex flex-col gap-2 rounded-lg border p-5"
      data-testid="portal-hero-card"
    >
      <p className="text-overline text-brass-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={isMuted ? 'text-numeric-md text-ink-400' : 'text-numeric-lg text-ink-900'}>
          {value}
        </span>
        {unit ? <span className="text-numeric-md text-ink-500">{unit}</span> : null}
      </div>
      {contextLine ? <p className="text-ink-500 text-xs leading-snug">{contextLine}</p> : null}
    </div>
  );
}

function HeroCardStatus({
  label,
  status,
}: {
  label: string;
  status: { label: string; tone: StatusBadgeTone };
}) {
  return (
    <div className="bg-paper-50 border-paper-300 flex flex-col gap-3 rounded-lg border p-5">
      <p className="text-overline text-brass-500">{label}</p>
      <StatusBadge tone={status.tone} pattern="solid">
        {status.label}
      </StatusBadge>
      <p className="text-ink-500 text-xs leading-snug">État actuel de votre attribution</p>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

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
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  const day = parseInt(iso.slice(8, 10), 10);
  const month = months[parseInt(iso.slice(5, 7), 10) - 1];
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}

function computePercent(vested: number, granted: number): number {
  if (granted <= 0) return 0;
  return Math.round((vested / granted) * 100);
}
