import Link from 'next/link';

/**
 * PR #39 B4 — Filter chips pour la page /audit-trail.
 *
 * Server component pur (URL searchParams). Click sur une chip = navigation
 * vers `/dashboard/audit-trail?type={prefix}&page=1`. La sélection visuelle
 * vient du `data-active="true"` quand `currentType === chip.value`.
 *
 * V1 = filtre `eventTypePrefix` uniquement. V2 (PR #41) ajoutera search
 * + date range picker complet.
 */

const FILTER_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'auth', label: 'Authentification' },
  { value: 'plan', label: 'Plans' },
  { value: 'award', label: 'Attributions' },
  { value: 'approval', label: 'Approbations' },
  { value: 'document', label: 'Documents' },
  { value: 'valuation', label: 'Valorisations' },
  { value: 'exercise', label: 'Exercices' },
  { value: 'beneficiary', label: 'Bénéficiaires' },
  { value: 'portal', label: 'Portail' },
];

export type AuditTrailFiltersProps = {
  currentType?: string | undefined;
};

export function AuditTrailFilters({ currentType }: AuditTrailFiltersProps) {
  const active = currentType ?? 'all';
  return (
    <nav
      role="search"
      aria-label="Filtres événements d'audit"
      className="cw-audit-filters"
      data-testid="audit-trail-filters"
    >
      {FILTER_CHIPS.map((chip) => {
        const params = new URLSearchParams();
        if (chip.value !== 'all') params.set('type', chip.value);
        const href = `/dashboard/audit-trail${params.toString() ? `?${params.toString()}` : ''}`;
        return (
          <Link
            key={chip.value}
            href={href}
            className="cw-audit-filter-chip"
            data-active={active === chip.value}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
