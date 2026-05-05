import Link from 'next/link';
import { resolveResource } from '@/lib/audit/resource-resolver';

/**
 * PR #41 B5 — Lien dynamique vers la page détail d'une resource (plan,
 * award, beneficiary, valuation_run, approval_request).
 *
 * Server component. Utilise `resolveResource` (case-aware) pour mapper le
 * couple `(resource_type, resource_id)` vers une URL `/dashboard/...`.
 *
 * États :
 * - `exists: false` → "(ressource non spécifiée)" ou "(type inconnu)"
 *   en italic Fraunces ink-500. Pas de lien.
 * - `exists: true, href: null` → label affiché sans lien
 *   (USER, MEMBERSHIP, DOCUMENT V1.5, etc.)
 * - `exists: true, href: '/...'` → Link Next.js avec flèche →
 */

export type ResourceLinkProps = {
  resourceType: string | null;
  resourceId: string | null;
  metadata?: Record<string, unknown> | null;
};

export function ResourceLink({ resourceType, resourceId, metadata }: ResourceLinkProps) {
  const resolved = resolveResource(resourceType, resourceId, metadata);

  if (!resolved.exists) {
    return (
      <span className="cw-audit-empty-detail" data-testid="audit-drawer-resource-missing">
        Aucune ressource liée à cet événement.
      </span>
    );
  }

  if (resolved.href === null) {
    return (
      <span className="cw-audit-resource-static" data-testid="audit-drawer-resource">
        {resolved.label}
      </span>
    );
  }

  return (
    <Link
      href={resolved.href}
      className="cw-audit-resource-link"
      data-testid="audit-drawer-resource"
      prefetch={false}
    >
      {resolved.label} →
    </Link>
  );
}
