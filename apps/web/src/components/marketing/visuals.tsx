/**
 * Visuels marketing — captures réelles de l'interface Capiwise.
 *
 * Les mockups sont des screenshots PNG du dashboard live, stockés dans
 * `apps/web/public/marketing/mockups/`. Servis via `next/image` pour
 * l'optimisation automatique (AVIF/WebP) et le lazy loading.
 *
 * 5 captures couvrant les 5 vues signature :
 *  - dashboard-cfo.png        — "Bonjour Julien, deux points méritent
 *                                votre attention" (KPICards, alertes)
 *  - cap-table.png            — "La photographie du capital, à l'instant"
 *                                (matrice consolidée, founders/investors/
 *                                employees)
 *  - plan-vesting.png         — "4 200 unités, quatre ans devant elles"
 *                                (synthèse + chronologie vesting cw-vt)
 *  - wizard-approval.png      — "Le plan est prêt à signer" (étape 4 :
 *                                contrôles 163 bis G + workflow 4 mains)
 *  - audit-trail.png          — "Tout ce qui s'est passé, scellé et
 *                                daté" (journal SHA-256 chaîné)
 *
 * Le `MonteCarloVisual` reste un SVG inline car le replay viewer
 * Module 11 n'a pas encore de capture exploitable.
 */

import Image from 'next/image';
import { cn } from '@/lib/utils';

import dashboardCfo from '../../../public/marketing/mockups/dashboard-cfo.png';
import capTable from '../../../public/marketing/mockups/cap-table.png';
import planVesting from '../../../public/marketing/mockups/plan-vesting.png';
import wizardApproval from '../../../public/marketing/mockups/wizard-approval.png';
import auditTrail from '../../../public/marketing/mockups/audit-trail.png';

type StaticMockup = typeof dashboardCfo;

function MockupFrame({
  src,
  alt,
  priority,
  className,
}: {
  src: StaticMockup;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'border-paper-300 bg-paper-50 relative overflow-hidden rounded-xl border shadow-lg',
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        priority={priority}
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 720px"
        placeholder="blur"
        className="block h-auto w-full"
      />
    </figure>
  );
}

/**
 * Mockup principal homepage : capture du dashboard CFO. KPICards Fair
 * Value 12,4 M€ · Alertes conformité 2 · Vesting 187u · Bénéficiaires
 * 142 · Cap libre 3,2 % + tableaux Plans actifs et Alertes.
 */
export function HomepageDashboardMockup({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={dashboardCfo}
      alt="Tableau de bord Capiwise — Bonjour Julien, deux points méritent votre attention. Cinq KPICards (Fair Value IFRS 2 12,4 M€, Alertes conformité 2, Vesting 187 unités, Bénéficiaires actifs 142, Cap libre ESOP 3,2 %), tableaux Plans actifs et Alertes conformité."
      priority
      className={className}
    />
  );
}

/**
 * Visuel "Plans" : capture du wizard étape 4 (création plan BSPCE) avec
 * contrôles 163 bis G et workflow d'approbation 4 mains.
 */
export function PlansVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={wizardApproval}
      alt="Wizard Capiwise étape 4 — Le plan est prêt à signer. Contrôles de conformité art. 163 bis G CGI (8/9 OK, strike inférieur à FMV), workflow d'approbation 4 mains (CFO signé, CEO signé, E&Y en attente, Board)."
      className={className}
    />
  );
}

/**
 * Visuel "Approbation" : même mockup wizard étape 4, focus sur le
 * workflow d'approbation 4 mains visible à droite.
 */
export function ApprovalVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={wizardApproval}
      alt="Workflow d'approbation à 4 mains — CFO Julien Doe signé en 2h, CEO Élise Marin signé en 4h, E&Y Auditeur en attente 18h, Board Conseil SLA J+3. Initié 28.04.2026 · 14h32 · SLA total 5 jours ouvrés."
      className={className}
    />
  );
}

/**
 * Visuel "Monte Carlo" : SVG interactif (pas de capture native du
 * replay viewer Module 11 — visualisation conservée stylisée).
 */
export function MonteCarloVisual({ className }: { className?: string }) {
  const paths = [0.85, 0.7, 0.55, 0.42, 0.3, 0.18];
  return (
    <div
      className={cn(
        'border-paper-300 bg-paper-50 flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border p-6 shadow-lg',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-ink-500 font-mono text-[10px] uppercase tracking-wider">
          Monte Carlo replay · 100 000 paths
        </div>
        <span className="border-bond-300 bg-bond-100 text-bond-700 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider">
          DONE
        </span>
      </div>
      <div className="border-paper-300 bg-paper-50 relative flex-1 rounded-lg border p-4">
        <svg viewBox="0 0 400 220" className="h-full w-full">
          {[40, 80, 120, 160].map((y) => (
            <line
              key={y}
              x1="40"
              y1={y}
              x2="380"
              y2={y}
              stroke="var(--paper-300)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
          ))}
          <line x1="40" y1="200" x2="380" y2="200" stroke="var(--ink-300)" strokeWidth="1" />
          <line x1="40" y1="20" x2="40" y2="200" stroke="var(--ink-300)" strokeWidth="1" />
          {[
            { y: 40, label: '20 €' },
            { y: 120, label: '15 €' },
            { y: 200, label: '10 €' },
          ].map((tick) => (
            <text
              key={tick.label}
              x="35"
              y={tick.y + 3}
              fontFamily="var(--font-mono)"
              fontSize="9"
              fill="var(--ink-500)"
              textAnchor="end"
            >
              {tick.label}
            </text>
          ))}
          {paths.map((opacity, i) => {
            const seed = i * 7 + 3;
            const points = Array.from({ length: 12 }).map((_, j) => {
              const x = 40 + (j * 340) / 11;
              const variation = Math.sin(seed + j * 0.7) * 25 - j * 6;
              const y = 180 - j * 12 + variation;
              return `${x},${Math.max(30, Math.min(195, y))}`;
            });
            return (
              <polyline
                key={i}
                points={points.join(' ')}
                fill="none"
                stroke="var(--brass-500)"
                strokeWidth="1.4"
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          })}
          <polyline
            points="40,180 70,162 100,148 130,132 160,118 190,102 220,90 250,78 280,68 310,58 340,52 370,48"
            fill="none"
            stroke="var(--ink-900)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <text
            x="375"
            y="44"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            fill="var(--ink-900)"
            textAnchor="end"
          >
            moyenne
          </text>
        </svg>
      </div>
      <div className="text-ink-500 flex justify-between font-mono text-[9px]">
        <span>T = 0</span>
        <span>T = 4 ans · IC 95 %</span>
      </div>
    </div>
  );
}

/**
 * Visuel "Audit trail" : capture du journal d'audit live avec
 * événements horodatés + SHA-256 + actor + chaîne intègre.
 */
export function AuditVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={auditTrail}
      alt="Journal d'audit Capiwise — Tout ce qui s'est passé, scellé et daté. 14 247 événements depuis 01.01.2024, chaîne SHA-256 intègre. Filtres Tous/Plans/Signatures/Modifications/Exports CAC/Calculs IFRS 2. Liste chronologique avec horodatage, type, actor et hash chaîné."
      className={className}
    />
  );
}

/**
 * Visuel "Portail bénéficiaire" : capture du Plan Detail avec la
 * Chronologie de vesting (cw-vt) — la timeline acquis/en cours/à
 * acquérir/conditionnel + bénéficiaires.
 */
export function PortalVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={planVesting}
      alt="Détail d'un plan BSPCE Capiwise — 4 200 unités, quatre ans devant elles. Stat cards Unités totales 4 200, Avant cliff 11m 14j, Au cliff 1 050 unités, Gain latent 1,21 M€. Chronologie de vesting interactive avec segments acquis/en cours/à acquérir/conditionnel ARR ≥ 12 M€."
      className={className}
    />
  );
}

/**
 * Visuel "Cap Table" : capture de la matrice consolidée 8 lignes avec
 * groupes Founders / Investors / Employees ESOP, valorisations et delta
 * vs snapshot précédent.
 */
export function CapTableVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={capTable}
      alt="Cap table Capiwise — La photographie du capital, à l'instant. Snapshot 30.04.2026 avec 8 lignes : Founders (Marie Lambert 60 %, Thomas Berger 40 %), Investors (Iris Capital Series A 18 %, Partech Series B 12 %, Bpifrance 4,5 %), Employees ESOP (BSPCE 0,012 %, AGA 0,005 %). Onglets Consolidé/Dilué/Pro forma + delta vs T-1."
      className={className}
    />
  );
}

/**
 * Visuel "Signature électronique" : reprend le wizard approval (workflow
 * 4 mains avec signataires + auditeurs).
 */
export function SignatureVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={wizardApproval}
      alt="Workflow signature électronique Capiwise — CFO Julien Doe signé en 2h, CEO Élise Marin signé en 4h, E&Y Auditeur en attente 18h, Board en cours. Initié 28.04.2026 · 14h32 · SLA total 5 jours ouvrés. Signature qualifiée eIDAS via Yousign."
      className={className}
    />
  );
}

/**
 * Visuel "Conformité FR" : capture de l'étape 4 wizard avec la
 * checklist 163 bis G CGI complète (8/9 OK, 1 point d'arbitrage strike
 * inférieur à FMV).
 */
export function ComplianceVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={wizardApproval}
      alt="Contrôles de conformité Capiwise art. 163 bis G CGI — 8/9 OK. Société éligible BSPCE PME < 15 ans, capital détenu ≥ 25 % par PP (68,4 %), bénéficiaires salariés ou mandataires, période d'exercice ≤ 10 ans, notification CERFA n°2074, plan voté en AG, pacte d'associés compatible, mandat CAC pour valorisation. Strike < FMV : arbitrage requis."
      className={className}
    />
  );
}

/**
 * Visuel "Levée d'options" : reprend le mockup Plan Vesting (proche du
 * workflow exercice — montre tranches acquises mobilisables).
 */
export function ExerciseVisual({ className }: { className?: string }) {
  return (
    <MockupFrame
      src={planVesting}
      alt="Workflow de levée d'options Capiwise — vue d'un plan avec tranches acquises mobilisables, calcul du gain latent, et conditions de plan (BSPCE conformité 163 bis G, strike, FMV à l'émission)."
      className={className}
    />
  );
}
