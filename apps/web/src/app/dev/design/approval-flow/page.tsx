import { ApprovalRequestTimeline } from '@/components/approvals/ApprovalRequestTimeline';
import { Card, CardContent } from '@/components/ui/card';
import type { ApprovalRequestDetailFull } from '@/server/queries/approvals';

export const metadata = { title: 'Dev — ApprovalFlow' };

/**
 * Sandbox /dev/design/approval-flow — Module Design System V1, Étape 10.
 *
 * Validation visuelle des 2 variantes du composant ApprovalRequestTimeline
 * refondu :
 *
 * 1. **Vertical** (défaut, mockup 5 page détail) — palette Editorial
 *    Finance restylée. Backward compat avec les usages existants
 *    Module 5 B4 + helper Vitest `timeline-helpers.ts` PRÉSERVÉ.
 *
 * 2. **Horizontal** (variante mockup 5 frise haut-droit) — avatars
 *    48px reliés par lignes brass-300, halo-pulse 4s sur l'étape
 *    courante (saffron-500). Pour la card "Workflow d'approbation"
 *    sur la page Wizard étape 4.
 */

type Step = ApprovalRequestDetailFull['steps'][number];
type Decision = ApprovalRequestDetailFull['decisions'][number];

// Workflow d'exemple : 4 étapes (CFO / CEO / Auditeur / Board)
const sampleSteps: Step[] = [
  {
    id: 's1',
    step_order: 1,
    step_name: 'Julien Doe',
    approver_type: 'USER',
    approver_role: 'CFO',
    approver_user_id: 'u1',
    mode: 'single',
    required_approvals: 1,
  },
  {
    id: 's2',
    step_order: 2,
    step_name: 'Élise Marin',
    approver_type: 'USER',
    approver_role: 'CEO',
    approver_user_id: 'u2',
    mode: 'single',
    required_approvals: 1,
  },
  {
    id: 's3',
    step_order: 3,
    step_name: 'E&Y',
    approver_type: 'USER',
    approver_role: 'AUDITEUR',
    approver_user_id: 'u3',
    mode: 'single',
    required_approvals: 1,
  },
  {
    id: 's4',
    step_order: 4,
    step_name: 'Board',
    approver_type: 'GROUP',
    approver_role: 'CONSEIL',
    approver_user_id: null,
    mode: 'consensus',
    required_approvals: 1,
  },
];

const sampleDecisions: Decision[] = [
  {
    id: 'd1',
    step_order: 1,
    approver_user_id: 'u1',
    approver_role: 'CFO',
    status: 'APPROVED',
    decided_at: '2026-04-28T14:32:00Z',
    decided_by: 'julien-doe',
    comment: null,
  },
  {
    id: 'd2',
    step_order: 2,
    approver_user_id: 'u2',
    approver_role: 'CEO',
    status: 'APPROVED',
    decided_at: '2026-04-28T18:15:00Z',
    decided_by: 'elise-marin',
    comment: null,
  },
  // Étape 3 : currentStepOrder, in_progress
  // (le RPC start_approval_workflow insère toujours des PENDING decisions
  // sur la step courante — sans elles le helper computeStepStatus
  // retourne 'skipped' par défaut)
  {
    id: 'd3-pending',
    step_order: 3,
    approver_user_id: 'u3',
    approver_role: 'AUDITEUR',
    status: 'PENDING',
    decided_at: null,
    decided_by: null,
    comment: null,
  },
  // Étape 4 : upcoming (pas de décision)
];

export default function ApprovalFlowSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          ApprovalFlow <span className="serif-italic text-brass-500">deux variantes</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          API publique inchangée + nouvelle prop{' '}
          <code className="bg-paper-200 rounded px-1 font-mono text-xs">
            orientation: &apos;vertical&apos; | &apos;horizontal&apos;
          </code>
          . Helper{' '}
          <code className="bg-paper-200 rounded px-1 font-mono text-xs">timeline-helpers.ts</code>{' '}
          (Vitest) intact.
        </p>
      </header>

      {/* Variante VERTICAL */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Variante <span className="serif-italic text-brass-500">vertical</span> · page détail
          request
        </h2>
        <p className="text-ink-500 text-sm">
          Workflow 4 étapes : CFO ✓ approuvé · CEO ✓ approuvé · E&amp;Y ⏳ en cours (halo-pulse 4s
          saffron) · Board ○ à venir. Decisions listées en dessous de chaque step avec dates
          formatées.
        </p>
        <Card>
          <CardContent className="p-6">
            <ApprovalRequestTimeline
              steps={sampleSteps}
              decisions={sampleDecisions}
              currentStepOrder={3}
              requestStatus="IN_PROGRESS"
              orientation="vertical"
            />
          </CardContent>
        </Card>
      </section>

      {/* Variante HORIZONTAL */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Variante <span className="serif-italic text-brass-500">horizontal</span> · frise mockup 5
        </h2>
        <p className="text-ink-500 text-sm">
          Frise compacte : avatars 48px reliés par lignes brass-300. Étape 3 (E&amp;Y) avec
          halo-pulse 4s. Initiales serif au-dessus, rôle uppercase en dessous, micro-label durée
          mono ink-400.
        </p>
        <Card>
          <CardContent className="p-6">
            <ApprovalRequestTimeline
              steps={sampleSteps}
              decisions={sampleDecisions}
              currentStepOrder={3}
              requestStatus="IN_PROGRESS"
              orientation="horizontal"
            />
          </CardContent>
        </Card>
      </section>

      {/* Variante HORIZONTAL — completed */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Variante <span className="serif-italic text-brass-500">horizontal</span> · workflow
          complet
        </h2>
        <p className="text-ink-500 text-sm">
          Cas terminal : tous les avatars en bond-500 ✓ approuvés.
        </p>
        <Card>
          <CardContent className="p-6">
            <ApprovalRequestTimeline
              steps={sampleSteps}
              decisions={[
                ...sampleDecisions,
                {
                  id: 'd3',
                  step_order: 3,
                  approver_user_id: 'u3',
                  approver_role: 'AUDITEUR',
                  status: 'APPROVED',
                  decided_at: '2026-04-29T10:30:00Z',
                  decided_by: 'ey-team',
                  comment: null,
                },
                {
                  id: 'd4',
                  step_order: 4,
                  approver_user_id: null,
                  approver_role: 'CONSEIL',
                  status: 'APPROVED',
                  decided_at: '2026-04-30T16:00:00Z',
                  decided_by: 'board-vote',
                  comment: null,
                },
              ]}
              currentStepOrder={null}
              requestStatus="APPROVED"
              orientation="horizontal"
            />
          </CardContent>
        </Card>
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          ApprovalRequestTimeline · Editorial Finance V1 · spec 5.7 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/approval-flow</code>
        </p>
        <p className="text-ink-500 mt-2">
          ⚠ <strong>Helper timeline-helpers.ts intact</strong> : tous les tests Vitest associés
          (`pnpm test --filter approvals`) passent sans modification. Backward compat 100% sur
          l&apos;API publique.
        </p>
      </footer>
    </div>
  );
}
