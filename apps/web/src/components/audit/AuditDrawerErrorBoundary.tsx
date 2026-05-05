'use client';

import * as React from 'react';

/**
 * PR #45 B3 — Error Boundary pour le contenu du drawer audit.
 *
 * Filet de sûreté production : si une section du drawer crash (rendering
 * malformé, types DB inattendus, react fragment edge case, etc.), l'user
 * voit un fallback gracieux au lieu d'un écran blanc Next.js error overlay.
 *
 * Bug #5 P1 (rapport QA Claude in Chrome) : "Frame error Chrome" sur 1er
 * clic award.status_changed, non reproduit en 2e tentative → race condition
 * probable. Cette boundary catch tout dans le contenu du drawer.
 *
 * Sentry (V1.X) : log structuré côté `componentDidCatch` quand la lib
 * sera installée. V1 = console.error avec format compatible (operation,
 * stack, info).
 */

export type AuditDrawerErrorBoundaryProps = {
  children: React.ReactNode;
};

type State = { error: Error | null };

export class AuditDrawerErrorBoundary extends React.Component<
  AuditDrawerErrorBoundaryProps,
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log structuré pour ingestion future Sentry / Datadog.
    console.error('[AuditDrawer] render crashed', {
      operation: 'audit_drawer_render',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="cw-audit-drawer-body" data-testid="audit-drawer-error">
          <header className="cw-audit-drawer-header">
            <div>
              <p
                id="audit-drawer-title"
                className="cw-audit-drawer-title"
                style={{ color: 'var(--title-700)' }}
              >
                ⚠ Détails non disponibles
              </p>
            </div>
          </header>
          <p className="cw-audit-empty-detail">
            Le rendu de cet événement a rencontré une erreur inattendue. L&apos;événement reste
            valide en base de données — seul son affichage détaillé est temporairement indisponible.
          </p>
          <p className="cw-audit-empty-detail" style={{ marginTop: 12 }}>
            Si l&apos;erreur persiste, contactez le support en mentionnant l&apos;identifiant de
            l&apos;événement (visible dans l&apos;URL après <code>?event=</code>).
          </p>
          <details
            style={{
              marginTop: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-500)',
            }}
          >
            <summary>Détails techniques</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 8,
                background: 'var(--paper-100)',
                borderRadius: 4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
