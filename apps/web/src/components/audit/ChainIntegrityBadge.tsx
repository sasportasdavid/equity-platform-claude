import { getAuditChainIntegrity } from '@/server/queries/audit-export';

/**
 * PR #42 B5 — ChainIntegrityBadge — badge SHA-256 + statut chaîne intègre.
 *
 * Server component : fetch via la RPC `verify_audit_chain_integrity` côté
 * DB et rend un badge type :
 *   ● CHAÎNE INTÈGRE — SHA-256 · 14 247 events · 14 247 vérifiés
 *
 * Variantes :
 * - `is_intact: true` → bond-700 ✓ Chaîne intègre
 * - `is_intact: false` → title-700 ⚠ Rupture détectée à #N
 * - `null` (org sans events chained) → ink-500 (badge neutre "Aucun événement
 *   à vérifier")
 */

export type ChainIntegrityBadgeProps = {
  orgId: string;
};

export async function ChainIntegrityBadge({ orgId }: ChainIntegrityBadgeProps) {
  const integrity = await getAuditChainIntegrity(orgId);

  if (!integrity || integrity.total_events === 0) {
    return (
      <div className="cw-chain-badge cw-chain-badge--neutral" data-testid="chain-integrity-badge">
        <span className="cw-chain-badge-dot" aria-hidden="true">
          ○
        </span>
        <span className="cw-chain-badge-label">SHA-256 · Aucun événement chaîné</span>
      </div>
    );
  }

  if (!integrity.is_intact) {
    return (
      <div className="cw-chain-badge cw-chain-badge--broken" data-testid="chain-integrity-badge">
        <span className="cw-chain-badge-dot" aria-hidden="true">
          ⚠
        </span>
        <span className="cw-chain-badge-label">
          Rupture détectée — chaîne potentiellement altérée
        </span>
        <span className="cw-chain-badge-detail">
          {' · '}position #{integrity.broken_at} · {integrity.verified_events}/
          {integrity.total_events} vérifiés
        </span>
      </div>
    );
  }

  return (
    <div className="cw-chain-badge cw-chain-badge--intact" data-testid="chain-integrity-badge">
      <span className="cw-chain-badge-dot" aria-hidden="true">
        ●
      </span>
      <span className="cw-chain-badge-label">Chaîne intègre · SHA-256</span>
      <span className="cw-chain-badge-detail">
        {' · '}
        {integrity.verified_events.toLocaleString('fr-FR')}{' '}
        {integrity.verified_events > 1 ? 'événements vérifiés' : 'événement vérifié'}
      </span>
    </div>
  );
}
