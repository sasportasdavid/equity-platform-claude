/**
 * Module 6 B2 — Formatters partagés des templates PDF.
 *
 * Locale fr-FR pour V1. V2 = multi-locale via plan.locale.
 */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

// fr-FR Intl emits NARROW NO-BREAK SPACE (U+202F) as thousands separator
// since Node 13+ (CLDR change). react-pdf's default Helvetica font has no glyph
// for U+202F → renders as a slash or tofu. Normalize to NO-BREAK SPACE (U+00A0)
// which is widely supported by PDF fonts.
function normalizeSpaces(s: string): string {
  return s.replace(/ /g, ' ');
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '—';
  return normalizeSpaces(num.toLocaleString('fr-FR'));
}

export function formatCurrency(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '—';
  return normalizeSpaces(
    num.toLocaleString('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }),
  );
}
