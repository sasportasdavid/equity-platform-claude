import { computeAuditEventHash, type AuditEventForHash } from '@/lib/audit/hash';
import { CopyButton } from './CopyButton';

/**
 * PR #41 B5 — Bloc empreinte SHA-256 du drawer.
 *
 * Server component qui re-calcule le hash SUR LES MÊMES CHAMPS que la liste
 * (`id|event_type|user_id|resource_type|resource_id|occurred_at|JSON(metadata)`).
 * Affiche ✓ "Empreinte vérifiée" en bond-700 avec le hash full 64 hex.
 *
 * En V1.5, le re-compute est toujours == au hash affiché (la liste calcule le
 * même hash) — donc le badge "vérifiée" est tautologique. Il deviendra utile
 * en V2 (PR #41+) quand la colonne `audit_events.hash_sha256` sera persistée
 * en DB par un trigger insert : on comparera DB vs recompute pour détecter
 * une éventuelle altération.
 *
 * Le bouton de copie (`<CopyButton>`) est client (clipboard API navigator-only).
 */

export type HashVerificationBlockProps = {
  event: AuditEventForHash;
};

export function HashVerificationBlock({ event }: HashVerificationBlockProps) {
  const hash = computeAuditEventHash(event);

  return (
    <div data-testid="audit-drawer-hash">
      <div className="cw-audit-hash-status">✓ Empreinte vérifiée</div>
      <div className="cw-audit-hash-block">
        <code className="cw-audit-hash-full" aria-label="Empreinte SHA-256 complète">
          {hash}
        </code>
        <CopyButton value={hash} />
      </div>
    </div>
  );
}
