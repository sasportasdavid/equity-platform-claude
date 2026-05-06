/**
 * Visuels SVG génériques pour les pages publiques marketing.
 * 100% inline SVG, pas de PNG / pas de dépendance image — pour
 * shipper rapidement sans assets et garder un LCP éclair.
 */

import { cn } from '@/lib/utils';

export function HomepageDashboardMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-paper-300 bg-paper-50 relative overflow-hidden rounded-xl border shadow-lg',
        className,
      )}
      aria-hidden
    >
      <div className="border-paper-300 bg-paper-100 flex items-center gap-1.5 border-b px-3 py-2">
        <span className="bg-title-300 size-2.5 rounded-full" />
        <span className="bg-saffron-300 size-2.5 rounded-full" />
        <span className="bg-bond-300 size-2.5 rounded-full" />
        <span className="text-ink-500 ml-3 font-mono text-[10px]">capiwise.fr/dashboard</span>
      </div>
      <div className="grid grid-cols-[180px_1fr] gap-0">
        <aside className="border-paper-300 bg-paper-100/60 flex flex-col gap-3 border-r p-4">
          <span className="bg-brass-500 text-paper-50 inline-flex size-6 items-center justify-center rounded font-mono text-xs font-bold">
            C
          </span>
          {['Plans', 'Bénéficiaires', 'Cap Table', 'Valuations', 'Approbations'].map((item, i) => (
            <span
              key={item}
              className={cn(
                'text-ink-700 rounded px-2 py-1.5 text-[11px]',
                i === 1 ? 'bg-brass-100 text-brass-900 font-medium' : '',
              )}
            >
              {item}
            </span>
          ))}
        </aside>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <span className="text-ink-900 font-serif text-lg font-semibold">Bonjour Camille</span>
            <span className="border-paper-300 bg-paper-50 inline-flex h-7 w-24 rounded-full border" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Plans actifs', value: '4', tone: 'brass-700' },
              { label: 'Bénéficiaires', value: '128', tone: 'bond-700' },
              { label: 'Levées YTD', value: '12', tone: 'saffron-700' },
            ].map((card) => (
              <div key={card.label} className="border-paper-300 bg-paper-50 rounded-lg border p-3">
                <div className="text-ink-500 text-[9px] uppercase tracking-wider">{card.label}</div>
                <div className={cn('mt-1 font-mono text-xl font-semibold', `text-${card.tone}`)}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
          <div className="border-paper-300 bg-paper-50 rounded-lg border p-3">
            <div className="text-ink-500 mb-2 text-[10px] uppercase tracking-wider">
              Vesting cumulé
            </div>
            <svg viewBox="0 0 280 80" className="h-20 w-full">
              <defs>
                <linearGradient id="vest-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brass-500)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--brass-500)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,72 L20,68 L40,60 L60,55 L80,52 L100,42 L120,40 L140,30 L160,28 L180,22 L200,18 L220,16 L240,12 L260,10 L280,6"
                fill="none"
                stroke="var(--brass-500)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M0,72 L20,68 L40,60 L60,55 L80,52 L100,42 L120,40 L140,30 L160,28 L180,22 L200,18 L220,16 L240,12 L260,10 L280,6 L280,80 L0,80 Z"
                fill="url(#vest-fill)"
              />
            </svg>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border-paper-300 bg-paper-50 rounded-lg border p-3">
              <div className="text-ink-500 text-[9px] uppercase tracking-wider">Approbations</div>
              <div className="text-ink-900 mt-1 font-mono text-base">
                3 <span className="text-saffron-700">en attente</span>
              </div>
            </div>
            <div className="border-paper-300 bg-paper-50 rounded-lg border p-3">
              <div className="text-ink-500 text-[9px] uppercase tracking-wider">IFRS 2</div>
              <div className="text-ink-900 mt-1 font-mono text-base">
                <span className="text-bond-700">À jour</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Visuel "Plans" : cartes empilées + tag wizard. */
export function PlansVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Wizard de création de plan"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${30 + i * 12}, ${40 + i * 18})`}>
          <rect width="280" height="180" rx="10" fill="var(--paper-50)" stroke="var(--paper-300)" />
          <rect
            x="20"
            y="22"
            width="80"
            height="10"
            rx="2"
            fill={i === 0 ? 'var(--brass-500)' : 'var(--paper-300)'}
          />
          <rect x="20" y="48" width="200" height="10" rx="2" fill="var(--ink-300)" />
          <rect x="20" y="68" width="160" height="10" rx="2" fill="var(--ink-300)" />
          <rect x="20" y="100" width="240" height="48" rx="6" fill="var(--paper-200)" />
          <rect x="20" y="160" width="80" height="10" rx="2" fill="var(--brass-300)" />
        </g>
      ))}
      <g transform="translate(280, 220)">
        <rect width="100" height="36" rx="6" fill="var(--brass-500)" />
        <text
          x="50"
          y="22"
          fontFamily="var(--font-sans)"
          fontSize="12"
          fill="var(--paper-50)"
          textAnchor="middle"
          fontWeight="600"
        >
          Étape 4 / 7
        </text>
      </g>
    </svg>
  );
}

/** Visuel "Approbation" : timeline avec checkmarks. */
export function ApprovalVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Workflow d'approbation N-niveaux"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      {[
        { y: 60, label: 'CFO', status: 'done' },
        { y: 130, label: 'CEO', status: 'done' },
        { y: 200, label: 'Board', status: 'pending' },
      ].map((step, i) => (
        <g key={step.label}>
          <line
            x1="80"
            y1={step.y + 24}
            x2="80"
            y2={step.y + (i < 2 ? 70 : 0)}
            stroke="var(--paper-300)"
            strokeWidth="2"
          />
          <circle
            cx="80"
            cy={step.y + 12}
            r="14"
            fill={step.status === 'done' ? 'var(--bond-500)' : 'var(--saffron-500)'}
          />
          <text
            x="80"
            y={step.y + 17}
            fontFamily="var(--font-sans)"
            fontSize="14"
            fill="var(--paper-50)"
            textAnchor="middle"
            fontWeight="600"
          >
            {step.status === 'done' ? '✓' : i + 1}
          </text>
          <rect
            x="120"
            y={step.y - 4}
            width="240"
            height="40"
            rx="6"
            fill="var(--paper-50)"
            stroke="var(--paper-300)"
          />
          <text
            x="138"
            y={step.y + 15}
            fontFamily="var(--font-serif)"
            fontSize="14"
            fontWeight="500"
            fill="var(--ink-900)"
          >
            {step.label}
          </text>
          <text
            x="138"
            y={step.y + 30}
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--ink-500)"
          >
            {step.status === 'done' ? 'Approuvé · 12:34' : 'En attente'}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Visuel "IFRS 2 / Monte Carlo" : courbe de paths. */
export function MonteCarloVisual({ className }: { className?: string }) {
  const paths = [0.85, 0.7, 0.55, 0.42, 0.3, 0.18];
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Visualisation Monte Carlo"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      <line x1="40" y1="260" x2="380" y2="260" stroke="var(--ink-300)" strokeWidth="1" />
      <line x1="40" y1="40" x2="40" y2="260" stroke="var(--ink-300)" strokeWidth="1" />
      {paths.map((opacity, i) => {
        const seed = i * 7 + 3;
        const points = Array.from({ length: 10 }).map((_, j) => {
          const x = 40 + j * 38;
          const variation = Math.sin(seed + j * 0.7) * 30 - j * 8;
          const y = 240 - j * 15 + variation;
          return `${x},${Math.max(40, Math.min(255, y))}`;
        });
        return (
          <polyline
            key={i}
            points={points.join(' ')}
            fill="none"
            stroke="var(--brass-500)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity={opacity}
          />
        );
      })}
      <text x="40" y="30" fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-500)">
        100 000 paths
      </text>
      <text
        x="380"
        y="280"
        fontFamily="var(--font-mono)"
        fontSize="10"
        fill="var(--ink-500)"
        textAnchor="end"
      >
        T = 4 ans
      </text>
    </svg>
  );
}

/** Visuel "Audit trail" : liste d'événements signés. */
export function AuditVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Audit trail immuable"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      {[
        { y: 50, action: 'plan.created', hash: '8f3a…2c1b' },
        { y: 100, action: 'award.proposed', hash: 'a91d…b428' },
        { y: 150, action: 'approval.granted', hash: '65e7…f12a' },
        { y: 200, action: 'document.signed', hash: 'c4b8…91de' },
        { y: 250, action: 'award.granted', hash: '2f9c…7ab5' },
      ].map((event, i) => (
        <g key={event.action}>
          <rect
            x="20"
            y={event.y - 15}
            width="360"
            height="36"
            rx="4"
            fill="var(--paper-50)"
            stroke="var(--paper-300)"
          />
          <text
            x="36"
            y={event.y - 1}
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill="var(--ink-500)"
          >
            12:0{i + 1}:23
          </text>
          <text
            x="120"
            y={event.y - 1}
            fontFamily="var(--font-serif)"
            fontStyle="italic"
            fontSize="13"
            fill="var(--brass-700)"
          >
            {event.action}
          </text>
          <text
            x="36"
            y={event.y + 14}
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--ink-300)"
          >
            sha-256 · {event.hash}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Visuel "Portail bénéficiaire" : timeline vesting. */
export function PortalVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Portail bénéficiaire — vesting timeline"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      <text
        x="40"
        y="50"
        fontFamily="var(--font-serif)"
        fontSize="16"
        fontWeight="500"
        fill="var(--ink-900)"
      >
        Vos BSPCE — 15 000 unités
      </text>
      <text x="40" y="68" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-500)">
        Plan BSPCE 2024 · Cliff 1 an · Vesting 4 ans
      </text>
      {/* Vested bar */}
      <rect x="40" y="100" width="340" height="36" rx="4" fill="var(--paper-200)" />
      <rect x="40" y="100" width="135" height="36" rx="4" fill="var(--bond-500)" />
      {/* "AUJOURD'HUI" tick */}
      <line x1="175" y1="78" x2="175" y2="158" stroke="var(--brass-500)" strokeWidth="1.5" />
      <rect x="148" y="74" width="58" height="14" rx="2" fill="var(--paper-50)" />
      <text
        x="177"
        y="84"
        fontFamily="var(--font-mono)"
        fontSize="9"
        fontWeight="600"
        fill="var(--brass-700)"
        textAnchor="middle"
      >
        AUJOURD’HUI
      </text>
      {/* Cumulative numbers */}
      <text x="40" y="160" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-500)">
        0
      </text>
      <text
        x="175"
        y="160"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--bond-700)"
        fontWeight="600"
        textAnchor="middle"
      >
        5 625 acquis
      </text>
      <text
        x="380"
        y="160"
        fontFamily="var(--font-mono)"
        fontSize="10"
        fill="var(--ink-500)"
        textAnchor="end"
      >
        15 000
      </text>
      {/* Potential */}
      <rect
        x="40"
        y="200"
        width="340"
        height="60"
        rx="6"
        fill="var(--paper-50)"
        stroke="var(--paper-300)"
      />
      <text x="56" y="220" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-500)">
        VALEUR POTENTIELLE
      </text>
      <text
        x="56"
        y="248"
        fontFamily="var(--font-mono)"
        fontSize="22"
        fontWeight="500"
        fill="var(--brass-700)"
      >
        160 250 €
      </text>
      <text x="252" y="248" fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-500)">
        FMV 12.50 € · IFRS 2 ✓
      </text>
    </svg>
  );
}

/** Visuel "Cap Table" : tableau avec catégories. */
export function CapTableVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Cap table — vue catégorielle"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      <rect
        x="20"
        y="20"
        width="360"
        height="260"
        rx="8"
        fill="var(--paper-50)"
        stroke="var(--paper-300)"
      />
      <line x1="20" y1="60" x2="380" y2="60" stroke="var(--paper-300)" />
      <text x="40" y="44" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-500)">
        CATÉGORIE
      </text>
      <text x="220" y="44" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-500)">
        UNITÉS
      </text>
      <text x="320" y="44" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-500)">
        % FD
      </text>
      {[
        { cat: 'Ordinary', units: '1 280 000', pct: '64.0%', color: 'var(--ink-700)' },
        { cat: 'Preferred A', units: '320 000', pct: '16.0%', color: 'var(--brass-500)' },
        { cat: 'Preferred B', units: '180 000', pct: '9.0%', color: 'var(--brass-700)' },
        { cat: 'BSPCE pool', units: '160 000', pct: '8.0%', color: 'var(--bond-500)' },
        { cat: 'AGA', units: '60 000', pct: '3.0%', color: 'var(--saffron-500)' },
      ].map((row, i) => (
        <g key={row.cat} transform={`translate(0, ${80 + i * 34})`}>
          <rect x="40" y="-3" width="6" height="22" rx="2" fill={row.color} />
          <text x="56" y="14" fontFamily="var(--font-serif)" fontSize="13" fill="var(--ink-900)">
            {row.cat}
          </text>
          <text
            x="280"
            y="14"
            fontFamily="var(--font-mono)"
            fontSize="13"
            fill="var(--ink-700)"
            textAnchor="end"
          >
            {row.units}
          </text>
          <text
            x="370"
            y="14"
            fontFamily="var(--font-mono)"
            fontSize="13"
            fill="var(--brass-700)"
            textAnchor="end"
            fontWeight="500"
          >
            {row.pct}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Visuel "Signature électronique" : carte Yousign. */
export function SignatureVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Signature électronique Yousign eIDAS"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      <rect
        x="40"
        y="40"
        width="320"
        height="220"
        rx="10"
        fill="var(--paper-50)"
        stroke="var(--paper-300)"
      />
      <text
        x="60"
        y="76"
        fontFamily="var(--font-serif)"
        fontSize="16"
        fontWeight="500"
        fill="var(--ink-900)"
      >
        Lettre d’attribution BSPCE
      </text>
      <text x="60" y="92" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-500)">
        Yousign · eIDAS qualifié avancé
      </text>
      <line x1="60" y1="110" x2="340" y2="110" stroke="var(--paper-300)" />
      {[
        { y: 138, name: 'Camille DURAND', role: 'Bénéficiaire', status: 'signed' },
        { y: 178, name: 'Société Capiwise SAS', role: 'Représentant légal', status: 'signed' },
      ].map((sig) => (
        <g key={sig.name}>
          <circle cx="76" cy={sig.y} r="10" fill="var(--bond-500)" />
          <text
            x="76"
            y={sig.y + 4}
            fontFamily="var(--font-sans)"
            fontSize="10"
            fill="var(--paper-50)"
            textAnchor="middle"
            fontWeight="700"
          >
            ✓
          </text>
          <text
            x="100"
            y={sig.y - 2}
            fontFamily="var(--font-sans)"
            fontSize="13"
            fill="var(--ink-900)"
          >
            {sig.name}
          </text>
          <text
            x="100"
            y={sig.y + 14}
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--ink-500)"
          >
            {sig.role} · signé via certificat qualifié
          </text>
        </g>
      ))}
      <rect x="60" y="218" width="160" height="32" rx="4" fill="var(--bond-50)" />
      <text
        x="76"
        y="238"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="var(--bond-700)"
        fontWeight="600"
      >
        ✓ Document scellé
      </text>
    </svg>
  );
}

/** Visuel "Conformité FR" : checklist art. 163 bis G CGI. */
export function ComplianceVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Conformité française native"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      <rect
        x="30"
        y="30"
        width="340"
        height="240"
        rx="10"
        fill="var(--paper-50)"
        stroke="var(--paper-300)"
      />
      <text
        x="50"
        y="62"
        fontFamily="var(--font-serif)"
        fontSize="15"
        fontWeight="500"
        fill="var(--ink-900)"
      >
        Conformité art. 163 bis G CGI
      </text>
      {[
        'Société < 15 ans depuis création',
        'Capitalisation < 150 M€',
        'Société soumise à l’IS',
        'Bénéficiaire salarié ou dirigeant',
        '50 % du capital détenu par PP',
      ].map((item, i) => (
        <g key={item} transform={`translate(50, ${100 + i * 30})`}>
          <rect width="14" height="14" rx="3" fill="var(--bond-500)" />
          <text
            x="7"
            y="11"
            fontFamily="var(--font-sans)"
            fontSize="10"
            fill="var(--paper-50)"
            textAnchor="middle"
            fontWeight="700"
          >
            ✓
          </text>
          <text x="28" y="12" fontFamily="var(--font-sans)" fontSize="13" fill="var(--ink-900)">
            {item}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Visuel "Levée d'options" : workflow exercise. */
export function ExerciseVisual({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Workflow de levée d'options"
    >
      <rect x="0" y="0" width="400" height="300" fill="var(--paper-100)" />
      {[
        { x: 20, label: 'Demande', sub: 'Bénéficiaire' },
        { x: 130, label: 'Validation', sub: 'Employeur' },
        { x: 240, label: 'Bon de\nsouscription', sub: 'Généré' },
      ].map((step, i) => (
        <g key={step.label}>
          <rect
            x={step.x}
            y="120"
            width="100"
            height="60"
            rx="6"
            fill="var(--paper-50)"
            stroke="var(--brass-500)"
            strokeWidth="1.5"
          />
          <text
            x={step.x + 50}
            y="148"
            fontFamily="var(--font-serif)"
            fontSize="12"
            fontWeight="500"
            fill="var(--ink-900)"
            textAnchor="middle"
          >
            {step.label.split('\n')[0]}
          </text>
          {step.label.includes('\n') ? (
            <text
              x={step.x + 50}
              y="162"
              fontFamily="var(--font-serif)"
              fontSize="12"
              fontWeight="500"
              fill="var(--ink-900)"
              textAnchor="middle"
            >
              {step.label.split('\n')[1]}
            </text>
          ) : null}
          <text
            x={step.x + 50}
            y={step.label.includes('\n') ? 174 : 168}
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--ink-500)"
            textAnchor="middle"
          >
            {step.sub}
          </text>
          {i < 2 ? (
            <path
              d={`M${step.x + 100} 150 L${step.x + 130} 150`}
              stroke="var(--brass-500)"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          ) : null}
        </g>
      ))}
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="var(--brass-500)" />
        </marker>
      </defs>
      <rect x="60" y="220" width="280" height="50" rx="6" fill="var(--bond-50)" />
      <text
        x="200"
        y="242"
        fontFamily="var(--font-serif)"
        fontSize="14"
        fontWeight="500"
        fill="var(--bond-700)"
        textAnchor="middle"
      >
        ✓ Cap table mis à jour automatiquement
      </text>
      <text
        x="200"
        y="258"
        fontFamily="var(--font-mono)"
        fontSize="10"
        fill="var(--ink-500)"
        textAnchor="middle"
      >
        15 000 BSPCE → 15 000 actions ordinaires
      </text>
    </svg>
  );
}
