/**
 * Visuels marketing — vrais composants de l'interface Capiwise.
 *
 * Plutôt que des illustrations stylisées, ces visuels utilisent les
 * mêmes composants React et classes CSS (`cw-vt-*`, `cw-audit-*`, etc)
 * que l'app — avec des données de démo statiques. Ce qu'on montre, c'est
 * exactement ce que verra l'utilisateur dans le dashboard ou le portail.
 *
 * Imports :
 *  - `VestingTimeline` (Module 8 portail bénéficiaire, server-safe)
 *  - `KPICard` (Module DS V1, signature Editorial Finance)
 *  - `StatusBadge` (Module DS V1)
 *  - Classes globales `cw-audit-*`, `cw-vt-*` (déjà présentes dans
 *    apps/web/src/app/globals.css)
 */

import { Fragment } from 'react';
import { Check, ChevronRight, FileText, Layers } from 'lucide-react';
import { VestingTimeline } from '@/components/awards/vesting-timeline';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

/**
 * Mockup du dashboard CFO — recrée la mise en page réelle :
 * sidebar nav + header user + grille KPICard signature avec sparklines
 * + timeline vesting cw-vt + bloc compliance.
 */
export function HomepageDashboardMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-paper-300 bg-paper-50 relative overflow-hidden rounded-xl border shadow-lg',
        className,
      )}
    >
      {/* Window chrome */}
      <div className="border-paper-300 bg-paper-100 flex items-center gap-1.5 border-b px-3 py-2">
        <span className="bg-title-300 size-2.5 rounded-full" aria-hidden />
        <span className="bg-saffron-300 size-2.5 rounded-full" aria-hidden />
        <span className="bg-bond-300 size-2.5 rounded-full" aria-hidden />
        <span className="text-ink-500 ml-3 font-mono text-[10px]">capiwise.fr/dashboard</span>
      </div>
      <div className="grid grid-cols-[180px_1fr]">
        {/* Sidebar — recrée la sidebar dashboard réelle */}
        <aside
          className="border-paper-300 bg-paper-50 flex flex-col gap-1 border-r p-3"
          aria-hidden
        >
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <span className="bg-brass-500 text-paper-50 inline-flex size-6 items-center justify-center rounded font-mono text-xs font-bold">
              C
            </span>
            <span className="text-ink-900 text-xs font-semibold">Capiwise</span>
          </div>
          {[
            { label: 'Tableau de bord', active: false },
            { label: 'Plans', active: false },
            { label: 'Bénéficiaires', active: true },
            { label: 'Cap Table', active: false },
            { label: 'Valuations', active: false },
            { label: 'Approbations', active: false, badge: '3' },
            { label: 'Documents', active: false },
            { label: 'Audit trail', active: false },
          ].map((item) => (
            <span
              key={item.label}
              className={cn(
                'flex items-center justify-between rounded px-2 py-1.5 text-[11px]',
                item.active ? 'bg-brass-100 text-brass-900 font-medium' : 'text-ink-700',
              )}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="bg-saffron-500 text-paper-50 inline-flex size-4 items-center justify-center rounded-full font-mono text-[9px] font-semibold">
                  {item.badge}
                </span>
              ) : null}
            </span>
          ))}
        </aside>

        {/* Main content — KPI grid + vesting timeline en mini */}
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-ink-900 block leading-tight"
                style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600 }}
              >
                Bonjour Camille
              </span>
              <span className="text-ink-500 mt-0.5 block font-mono text-[10px]">
                Capiwise SAS · admin · 7 mai 2026
              </span>
            </div>
            <span className="border-paper-300 bg-paper-50 inline-flex h-7 w-20 items-center rounded-full border px-2">
              <span className="bg-brass-500 size-4 rounded-full" />
            </span>
          </div>

          {/* Grille KPI — vrais composants à échelle réduite */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: 'PLANS ACTIFS',
                value: '4',
                trend: [3, 3, 3, 4, 4, 4],
              },
              {
                label: 'BÉNÉFICIAIRES',
                value: '128',
                trend: [98, 105, 112, 118, 124, 128],
              },
              {
                label: 'LEVÉES YTD',
                value: '12',
                trend: [2, 4, 7, 9, 11, 12],
              },
            ].map((card, i) => (
              <MiniKpiCard key={i} {...card} />
            ))}
          </div>

          {/* Mini vesting bar — recrée la classe cw-vt en compact */}
          <div className="border-paper-300 bg-paper-50 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-overline text-brass-700 text-[9px]">
                VESTING CUMULÉ · BSPCE 2024
              </span>
              <StatusBadge tone="bond" pattern="pulse">
                LIVE
              </StatusBadge>
            </div>
            <div
              className="bg-paper-200 relative h-3 overflow-hidden rounded"
              style={{ borderRadius: 2 }}
            >
              <div className="bg-bond-500 h-full" style={{ width: '38%' }} />
              <div
                className="absolute inset-y-0"
                style={{
                  left: '38%',
                  width: '0.1%',
                  background: 'var(--brass-500)',
                  boxShadow: '0 0 0 2px rgba(184,134,91,0.18)',
                }}
              />
            </div>
            <div className="text-ink-500 mt-1.5 flex justify-between font-mono text-[9px]">
              <span>0</span>
              <span className="text-bond-700 font-semibold">5 625 acquis</span>
              <span>15 000</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="border-paper-300 bg-paper-50 rounded-lg border p-2.5">
              <div className="text-overline text-brass-700 text-[9px]">APPROBATIONS</div>
              <div className="text-ink-900 mt-0.5 font-mono text-base font-medium">
                3 <span className="text-saffron-700 ml-1 text-[10px]">en attente</span>
              </div>
            </div>
            <div className="border-paper-300 bg-paper-50 rounded-lg border p-2.5">
              <div className="text-overline text-brass-700 text-[9px]">IFRS 2</div>
              <div className="text-ink-900 mt-0.5 font-mono text-base font-medium">
                <span className="text-bond-700">À jour</span>
                <span className="text-ink-500 ml-1.5 text-[10px]">31/03</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mini KPI card — version compacte pour le mockup avec vraie sparkline. */
function MiniKpiCard({ label, value, trend }: { label: string; value: string; trend: number[] }) {
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = max - min || 1;
  const points = trend
    .map((y, i) => {
      const x = (i / (trend.length - 1)) * 60;
      const py = 18 - ((y - min) / range) * 14;
      return `${x},${py}`;
    })
    .join(' ');
  return (
    <div className="border-paper-300 bg-paper-50 flex flex-col gap-1 rounded-lg border p-2.5">
      <span className="text-brass-500 text-[8.5px] font-semibold uppercase tracking-wider">
        {label}
      </span>
      <span className="text-ink-900 font-mono text-lg font-medium leading-none">{value}</span>
      <svg viewBox="0 0 60 20" className="h-5 w-full">
        <defs>
          <linearGradient id={`mini-spark-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brass-500)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--brass-500)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke="var(--brass-500)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <polyline
          points={`0,20 ${points} 60,20`}
          fill={`url(#mini-spark-${label})`}
          stroke="none"
        />
      </svg>
    </div>
  );
}

/**
 * Visuel "Plans" — utilise les vrais styles Card du DS V1 avec status
 * badges réels.
 */
export function PlansVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-paper-100 flex h-full w-full flex-col gap-3 overflow-hidden rounded-xl p-6',
        className,
      )}
    >
      <div className="text-ink-500 mb-1 font-mono text-[10px] uppercase tracking-wider">
        Plans actifs · /dashboard/plans
      </div>
      {[
        {
          name: 'BSPCE 2024 — Tech',
          type: 'BSPCE',
          status: 'bond' as const,
          statusLabel: 'ACTIF',
          beneficiaries: 12,
          fmv: '12,50 €',
        },
        {
          name: 'AGA Performance C-Level',
          type: 'AGA',
          status: 'saffron' as const,
          statusLabel: 'EN APPROBATION',
          beneficiaries: 4,
          fmv: '11,80 €',
        },
        {
          name: 'BSA Advisors 2024',
          type: 'BSA',
          status: 'bond' as const,
          statusLabel: 'ACTIF',
          beneficiaries: 3,
          fmv: '12,50 €',
        },
      ].map((plan) => (
        <article
          key={plan.name}
          className="border-paper-300 bg-paper-50 flex items-center justify-between gap-4 rounded-lg border p-3"
        >
          <div className="flex items-center gap-3">
            <span className="bg-brass-100 text-brass-700 inline-flex size-9 items-center justify-center rounded-md">
              <Layers className="size-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-ink-900 text-sm font-medium leading-tight">{plan.name}</span>
              <span className="text-ink-500 mt-0.5 font-mono text-[10px]">
                {plan.type} · {plan.beneficiaries} bénéficiaires · FMV {plan.fmv}
              </span>
            </div>
          </div>
          <StatusBadge tone={plan.status}>{plan.statusLabel}</StatusBadge>
        </article>
      ))}
      <div className="border-brass-500 bg-brass-50/50 mt-2 flex items-center gap-3 rounded-lg border-2 border-dashed p-3">
        <span className="bg-brass-500 text-paper-50 inline-flex size-9 items-center justify-center rounded-md">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div className="flex flex-col">
          <span className="text-ink-900 text-sm font-medium">Wizard 7 étapes en cours</span>
          <span className="text-ink-500 mt-0.5 font-mono text-[10px]">
            Étape 4 / 7 · Conditions de performance
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Visuel "Approbation" — recrée le pattern Module 5 ApprovalRequestTimeline
 * avec status badges réels et numérotation circulaire.
 */
export function ApprovalVisual({ className }: { className?: string }) {
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-2 rounded-xl p-6', className)}>
      <div className="text-ink-500 mb-2 font-mono text-[10px] uppercase tracking-wider">
        Workflow d’approbation · 8 BSPCE → 12 000 unités
      </div>
      {[
        {
          step: 1,
          role: 'CFO',
          name: 'Marie Dupont',
          status: 'done' as const,
          time: 'Approuvé · 12:34',
        },
        {
          step: 2,
          role: 'CEO',
          name: 'Jean Martin',
          status: 'done' as const,
          time: 'Approuvé · 14:08',
        },
        {
          step: 3,
          role: 'Board',
          name: 'En attente',
          status: 'pending' as const,
          time: 'SLA 24 h',
        },
      ].map((step, i, arr) => (
        <div key={step.step} className="relative flex items-stretch gap-3">
          {/* Connector */}
          {i < arr.length - 1 ? (
            <span
              className="bg-paper-300 absolute"
              style={{ left: 13, top: 28, width: 2, height: 'calc(100% - 16px)' }}
              aria-hidden
            />
          ) : null}
          <span
            className={cn(
              'relative z-10 inline-flex size-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold',
              step.status === 'done' ? 'bg-bond-500 text-paper-50' : 'bg-saffron-500 text-paper-50',
            )}
          >
            {step.status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : step.step}
          </span>
          <article className="border-paper-300 bg-paper-50 flex flex-1 items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <div className="text-ink-900 text-sm font-medium leading-tight">{step.role}</div>
              <div className="text-ink-500 mt-0.5 font-mono text-[10px]">
                {step.name} · {step.time}
              </div>
            </div>
            <StatusBadge
              tone={step.status === 'done' ? 'bond' : 'saffron'}
              pattern={step.status === 'pending' ? 'dotted' : 'solid'}
            >
              {step.status === 'done' ? 'APPROUVÉ' : 'EN ATTENTE'}
            </StatusBadge>
          </article>
        </div>
      ))}
    </div>
  );
}

/**
 * Visuel "Monte Carlo" — recrée la viz native du replay viewer Module 11.
 * SVG mais inspiré du rendu réel (paths Recharts + grid + axes).
 */
export function MonteCarloVisual({ className }: { className?: string }) {
  const paths = [0.85, 0.7, 0.55, 0.42, 0.3, 0.18];
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-2 rounded-xl p-6', className)}>
      <div className="flex items-center justify-between">
        <div className="text-ink-500 font-mono text-[10px] uppercase tracking-wider">
          Monte Carlo replay · 100 000 paths
        </div>
        <StatusBadge tone="bond" pattern="solid">
          DONE
        </StatusBadge>
      </div>
      <div className="border-paper-300 bg-paper-50 relative flex-1 rounded-lg border p-4">
        <svg viewBox="0 0 400 220" className="h-full w-full">
          {/* Grid */}
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
          {/* Axes */}
          <line x1="40" y1="200" x2="380" y2="200" stroke="var(--ink-300)" strokeWidth="1" />
          <line x1="40" y1="20" x2="40" y2="200" stroke="var(--ink-300)" strokeWidth="1" />
          {/* Y axis labels */}
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
          {/* Paths */}
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
          {/* Mean line */}
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
 * Visuel "Audit trail" — utilise les vraies classes `cw-audit-*` du
 * dashboard audit-trail (Module 13). Identique au rendu live.
 */
export function AuditVisual({ className }: { className?: string }) {
  return (
    <div className={cn('bg-paper-100 h-full w-full overflow-hidden rounded-xl p-5', className)}>
      <ol className="cw-audit-list">
        <li>
          <header className="cw-audit-day">
            <h2 className="cw-audit-day-title">Jeudi 7 mai 2026</h2>
            <span className="cw-audit-day-count">5 événements</span>
          </header>
          {[
            {
              time: '09:14:23',
              actor: 'marie@capiwise.fr',
              verb: 'a créé',
              object: 'plan BSPCE 2024',
              hash: '8f3a…2c1b',
            },
            {
              time: '10:42:08',
              actor: 'jean@capiwise.fr',
              verb: 'a proposé',
              object: 'attribution Camille L.',
              hash: 'a91d…b428',
            },
            {
              time: '12:34:51',
              actor: 'marie@capiwise.fr',
              verb: 'a approuvé',
              object: 'request #1247',
              hash: '65e7…f12a',
            },
            {
              time: '14:08:12',
              actor: 'jean@capiwise.fr',
              verb: 'a signé',
              object: 'lettre BSPCE-PDF',
              hash: 'c4b8…91de',
            },
            {
              time: '14:09:33',
              actor: 'system',
              verb: 'a transitionné',
              object: 'attribution → GRANTED',
              hash: '2f9c…7ab5',
            },
          ].map((ev) => (
            <article key={ev.hash} className="cw-audit-event">
              <span className="cw-audit-time">{ev.time}</span>
              <div className="cw-audit-body">
                <span className="cw-audit-actor">{ev.actor}</span>
                <p className="cw-audit-verb">
                  {ev.verb} <span className="cw-audit-object">{ev.object}</span>
                </p>
              </div>
              <span className="cw-audit-hash">sha · {ev.hash}</span>
            </article>
          ))}
        </li>
      </ol>
    </div>
  );
}

/**
 * Visuel "Portail bénéficiaire" — utilise le VRAI composant
 * `VestingTimeline` (Module 8) avec données de démo. Identique au
 * rendu live du portail.
 */
export function PortalVisual({ className }: { className?: string }) {
  // 4 tranches sur 4 ans avec cliff à 1 an, today = mois 18 (~38%)
  const tranches = [
    {
      vestingDate: '2025-06-01',
      unitsToVest: 3750,
      cumulativePct: 25,
      cumulativeUnits: 3750,
      status: 'VESTED' as const,
    },
    {
      vestingDate: '2026-06-01',
      unitsToVest: 3750,
      cumulativePct: 50,
      cumulativeUnits: 7500,
      status: 'PENDING' as const,
    },
    {
      vestingDate: '2027-06-01',
      unitsToVest: 3750,
      cumulativePct: 75,
      cumulativeUnits: 11250,
      status: 'PENDING' as const,
    },
    {
      vestingDate: '2028-06-01',
      unitsToVest: 3750,
      cumulativePct: 100,
      cumulativeUnits: 15000,
      status: 'PENDING' as const,
    },
  ];
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-3 rounded-xl p-5', className)}>
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-ink-900 leading-tight"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 500 }}
          >
            Vos BSPCE — 15 000 unités
          </div>
          <div className="text-ink-500 mt-0.5 font-mono text-[10px]">
            Plan BSPCE 2024 · Cliff 1 an · Vesting 4 ans
          </div>
        </div>
        <StatusBadge tone="bond" pattern="solid">
          ACQUIS 38 %
        </StatusBadge>
      </div>
      <VestingTimeline
        tranches={tranches}
        vestingStart="2024-06-01"
        vestingEnd="2028-06-01"
        today="2026-01-15"
        cliffDate="2025-06-01"
        cliffPct={25}
        unitsGranted={15000}
        simplified
      />
      <div className="border-paper-300 bg-paper-50 mt-1 flex items-center justify-between rounded-lg border p-3">
        <div>
          <span className="text-ink-500 text-[10px] font-semibold uppercase tracking-wider">
            Valeur potentielle
          </span>
          <div className="text-brass-700 mt-0.5 font-mono text-xl font-medium">160 250 €</div>
        </div>
        <div className="text-right">
          <span className="text-ink-500 font-mono text-[10px]">FMV 12,50 €</span>
          <div className="text-bond-700 mt-0.5 font-mono text-[11px] font-medium">IFRS 2 ✓</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Visuel "Cap Table" — recrée le pattern de la cap-table-matrix réelle
 * (Module 10) avec colonnes catégorielles + barres de pourcentage.
 */
export function CapTableVisual({ className }: { className?: string }) {
  const rows = [
    { cat: 'Ordinary', units: 1280000, pct: 64.0, color: 'var(--ink-700)' },
    { cat: 'Preferred A', units: 320000, pct: 16.0, color: 'var(--brass-500)' },
    { cat: 'Preferred B', units: 180000, pct: 9.0, color: 'var(--brass-700)' },
    { cat: 'BSPCE pool', units: 160000, pct: 8.0, color: 'var(--bond-500)' },
    { cat: 'AGA', units: 60000, pct: 3.0, color: 'var(--saffron-500)' },
  ];
  return (
    <div className={cn('bg-paper-100 h-full w-full overflow-hidden rounded-xl p-5', className)}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-ink-500 font-mono text-[10px] uppercase tracking-wider">
          Cap Table · Vue catégorielle
        </div>
        <StatusBadge tone="brass" pattern="solid">
          FD POST-MONEY
        </StatusBadge>
      </div>
      <div className="border-paper-300 bg-paper-50 overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead className="bg-paper-50 border-paper-300 border-b">
            <tr>
              <th
                className="text-overline text-ink-500 px-3 py-2 text-left text-[9px]"
                style={{ width: '30%' }}
              >
                Catégorie
              </th>
              <th className="text-overline text-ink-500 px-3 py-2 text-right text-[9px]">Unités</th>
              <th
                className="text-overline text-ink-500 px-3 py-2 text-left text-[9px]"
                style={{ width: '40%' }}
              >
                % FD
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cat} className="border-paper-200 border-t">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      style={{
                        width: 4,
                        height: 16,
                        background: row.color,
                        borderRadius: 1,
                      }}
                    />
                    <span
                      className="text-ink-900 text-[12px]"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {row.cat}
                    </span>
                  </div>
                </td>
                <td className="text-ink-700 px-3 py-2.5 text-right font-mono text-[12px]">
                  {row.units.toLocaleString('fr-FR')}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-paper-200 h-1.5 flex-1 overflow-hidden rounded">
                      <div
                        className="h-full"
                        style={{ width: `${row.pct}%`, background: row.color }}
                      />
                    </div>
                    <span className="text-brass-700 w-12 text-right font-mono text-[11px] font-medium">
                      {row.pct.toFixed(1)} %
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Visuel "Signature électronique" — recrée la card de suivi signature
 * Yousign (Module 6) avec status badges réels.
 */
export function SignatureVisual({ className }: { className?: string }) {
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-3 rounded-xl p-5', className)}>
      <div className="border-paper-300 bg-paper-50 rounded-lg border p-4">
        <div className="border-paper-200 mb-3 flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <div
              className="text-ink-900"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 500 }}
            >
              Lettre d’attribution BSPCE
            </div>
            <div className="text-ink-500 mt-1 flex items-center gap-2 font-mono text-[10px]">
              <FileText className="size-3" />
              <span>Yousign · eIDAS qualifié avancé</span>
            </div>
          </div>
          <StatusBadge tone="bond" pattern="solid">
            COMPLÉTÉ
          </StatusBadge>
        </div>
        {[
          {
            name: 'Camille DURAND',
            role: 'Bénéficiaire',
            status: 'done' as const,
            time: '14:08:12',
          },
          {
            name: 'Capiwise SAS',
            role: 'Représentant légal',
            status: 'done' as const,
            time: '14:09:33',
          },
        ].map((sig) => (
          <div
            key={sig.name}
            className="border-paper-200 flex items-center gap-3 py-2 [&:not(:last-child)]:border-b"
          >
            <span className="bg-bond-500 text-paper-50 inline-flex size-7 items-center justify-center rounded-full">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-ink-900 text-[13px] font-medium">{sig.name}</span>
              <span className="text-ink-500 mt-0.5 font-mono text-[10px]">
                {sig.role} · signé via certificat qualifié
              </span>
            </div>
            <span className="text-ink-500 font-mono text-[10px]">{sig.time}</span>
          </div>
        ))}
      </div>
      <div className="bg-bond-50 border-bond-300 flex items-center gap-2 rounded-lg border px-4 py-3">
        <Check className="text-bond-700 size-4" strokeWidth={2.5} />
        <span className="text-bond-700 font-mono text-[11px] font-semibold uppercase tracking-wider">
          Document scellé · sha · 7e9c…2a18
        </span>
      </div>
    </div>
  );
}

/**
 * Visuel "Conformité FR" — recrée la liste de checks compliance
 * (Module 12 Compliance Engine V2) avec status badges réels.
 */
export function ComplianceVisual({ className }: { className?: string }) {
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-3 rounded-xl p-5', className)}>
      <div className="border-paper-300 bg-paper-50 rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="text-ink-900"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 500 }}
          >
            Conformité art. 163 bis G CGI
          </div>
          <StatusBadge tone="bond" pattern="solid">
            5 / 5 OK
          </StatusBadge>
        </div>
        {[
          'Société < 15 ans depuis création',
          'Capitalisation < 150 M€',
          'Société soumise à l’IS',
          'Bénéficiaire salarié ou dirigeant',
          '50 % du capital détenu par PP',
        ].map((item) => (
          <div
            key={item}
            className="border-paper-200 flex items-center gap-2.5 py-2 [&:not(:last-child)]:border-b"
          >
            <span className="bg-bond-500 text-paper-50 inline-flex size-4 items-center justify-center rounded">
              <Check className="size-2.5" strokeWidth={3} />
            </span>
            <span className="text-ink-900 text-[12px]">{item}</span>
          </div>
        ))}
      </div>
      <div className="border-saffron-300 bg-saffron-50 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-ink-900 text-[12px] font-medium">AGA cap 30 % du capital</span>
          <span className="text-ink-500 mt-0.5 font-mono text-[10px]">
            Actuellement : 27 % · approche du plafond
          </span>
        </div>
        <StatusBadge tone="saffron" pattern="dotted">
          WARNING
        </StatusBadge>
      </div>
    </div>
  );
}

/**
 * Visuel "Levée d'options" — recrée le workflow Module 9 exercise
 * avec status badges réels et flèches.
 */
export function ExerciseVisual({ className }: { className?: string }) {
  const steps = [
    { label: 'Demande', sub: 'Camille L.', done: true },
    { label: 'Validation CFO', sub: 'Marie D.', done: true },
    { label: 'Bon de souscription', sub: 'Yousign', done: false, current: true },
  ];
  return (
    <div className={cn('bg-paper-100 flex h-full w-full flex-col gap-4 rounded-xl p-5', className)}>
      <div className="text-ink-500 font-mono text-[10px] uppercase tracking-wider">
        Levée EXR-2026-0042 · 5 000 BSPCE → 5 000 ord.
      </div>
      <div className="flex items-stretch gap-2">
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            <article
              className={cn(
                'flex flex-1 flex-col gap-1.5 rounded-lg border p-3',
                step.done
                  ? 'border-bond-300 bg-bond-50'
                  : step.current
                    ? 'border-brass-500 bg-paper-50 ring-brass-100 ring-2'
                    : 'border-paper-300 bg-paper-50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                    step.done ? 'bg-bond-500 text-paper-50' : 'bg-brass-500 text-paper-50',
                  )}
                >
                  {step.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                {step.current ? (
                  <StatusBadge tone="brass" pattern="dotted">
                    EN COURS
                  </StatusBadge>
                ) : null}
              </div>
              <div
                className="text-ink-900 mt-1 leading-tight"
                style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 500 }}
              >
                {step.label}
              </div>
              <div className="text-ink-500 font-mono text-[10px]">{step.sub}</div>
            </article>
            {i < steps.length - 1 ? (
              <span className="flex flex-none items-center" aria-hidden>
                <ChevronRight className="text-brass-500 size-5" strokeWidth={2.5} />
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
      <div className="bg-bond-50 border-bond-300 flex items-center gap-2 rounded-lg border px-4 py-3">
        <Check className="text-bond-700 size-4" strokeWidth={2.5} />
        <div className="flex flex-col">
          <span className="text-bond-700 text-[12px] font-semibold">
            Cap table mis à jour automatiquement
          </span>
          <span className="text-ink-500 mt-0.5 font-mono text-[10px]">
            5 000 BSPCE → 5 000 actions ordinaires · snapshot SC-2026-0042
          </span>
        </div>
      </div>
    </div>
  );
}
