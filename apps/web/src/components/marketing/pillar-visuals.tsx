/**
 * Visuels éditoriaux des 4 piliers — site public V1 (PR #50).
 *
 * Reproductions fidèles du brief `capiwise-public-home.html` :
 * cartes pv (paper-50 + bordure paper-300 + radius 14 + shadow-md)
 * avec un visuel produit unique par pilier — pas de screenshot, pas
 * d'image bitmap, tout en SVG inline + CSS pour shipper rapide et
 * garder un LCP éclair.
 */

import { cn } from '@/lib/utils';

function PvFrame({
  tag,
  title,
  children,
  className,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-paper-300 bg-paper-50 relative overflow-hidden rounded-[14px] border p-8 shadow-md',
        className,
      )}
    >
      <span className="bg-brass-50 text-brass-700 text-mkt-mono mb-3.5 inline-block rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
        {tag}
      </span>
      <h4
        className="text-ink-900 text-[18px] font-medium leading-tight tracking-[-0.01em]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h4>
      <div className="bg-brass-500 my-4 h-px w-6" aria-hidden />
      {children}
    </div>
  );
}

/** Pilier 1 — Plans & Attributions : wizard 6 étapes avec étape 4 active */
export function PvWizard({ className }: { className?: string }) {
  const steps = [
    { n: '01', label: "Type d'instrument", state: 'done' as const },
    { n: '02', label: 'Périmètre & bénéficiaires', state: 'done' as const },
    { n: '03', label: 'Calendrier de vesting', state: 'done' as const },
    { n: '04', label: 'Conformité & éligibilité (art. 163 bis G)', state: 'now' as const },
    { n: '05', label: 'Approbations & signataires', state: 'next' as const },
    { n: '06', label: 'Revue & émission', state: 'next' as const },
  ];
  return (
    <PvFrame tag="● Wizard · Étape 4 / 6" title="Nouveau plan BSPCE" className={className}>
      <div className="flex flex-col">
        {steps.map((s, i) => {
          const done = s.state === 'done';
          const now = s.state === 'now';
          return (
            <div
              key={s.n}
              className={cn(
                'flex items-center gap-3.5 py-3.5 text-[13px]',
                i > 0 ? 'border-paper-300 border-t' : '',
                done ? 'text-ink-400 decoration-brass-300 line-through' : 'text-ink-700',
                now ? 'text-ink-900 font-medium' : '',
              )}
            >
              <span
                className={cn(
                  'text-mkt-mono w-6 text-[11px] tracking-wider',
                  now ? 'text-brass-500' : 'text-ink-400',
                )}
              >
                {s.n}
              </span>
              <span className={cn('flex-1', now ? 'text-ink-900' : '')}>{s.label}</span>
              {(done || now) && (
                <span
                  className={cn(
                    'inline-flex size-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white',
                    done ? 'bg-bond-500' : 'bg-brass-500 ring-brass-500/20 ring-4',
                  )}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-hidden
                >
                  {done ? '✓' : '●'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </PvFrame>
  );
}

/** Pilier 2 — Valorisation IFRS 2 : Monte Carlo 8 paths gris + mean brass + IC95 dashed */
export function PvMonteCarlo({ className }: { className?: string }) {
  return (
    <PvFrame
      tag="● Monte Carlo · 100 000 trajectoires"
      title="Plan AGA-Performance · Tranche 2"
      className={className}
    >
      <div className="text-mkt-mono text-ink-500 mb-2 flex items-baseline justify-between text-[10.5px]">
        <span>
          Méthode : <span className="text-brass-700 font-semibold">Heston</span> · σ 0,42 · σᵥ 0,18
        </span>
        <span>T = 4 ans</span>
      </div>
      <div className="border-paper-300 bg-paper-100 relative h-[200px] overflow-hidden rounded-lg border p-4">
        <svg
          viewBox="0 0 320 168"
          preserveAspectRatio="none"
          className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)]"
        >
          <defs>
            <linearGradient id="mc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brass-500)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--brass-500)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 8 paths gris */}
          {[
            '0,140 32,128 64,134 96,118 128,112 160,98 192,104 224,86 256,80 288,72 320,68',
            '0,140 32,142 64,128 96,134 128,120 160,124 192,108 224,118 256,104 288,98 320,86',
            '0,140 32,134 64,142 96,128 128,134 160,116 192,124 224,108 256,116 288,90 320,98',
            '0,140 32,138 64,124 96,130 128,108 160,114 192,96 224,102 256,88 288,94 320,76',
            '0,140 32,124 64,138 96,114 128,128 160,108 192,118 224,94 256,108 288,82 320,90',
            '0,140 32,148 64,138 96,144 128,130 160,138 192,122 224,128 256,114 288,118 320,102',
            '0,140 32,130 64,116 96,108 128,98 160,104 192,84 224,90 256,72 288,80 320,60',
            '0,140 32,144 64,134 96,138 128,124 160,128 192,114 224,120 256,106 288,110 320,94',
          ].map((points, i) => (
            <polyline
              key={i}
              fill="none"
              stroke="var(--ink-300)"
              strokeWidth="0.7"
              strokeOpacity="0.55"
              points={points}
            />
          ))}
          {/* Mean fill */}
          <polyline
            fill="url(#mc-fill)"
            stroke="none"
            points="0,168 0,140 32,134 64,130 96,124 128,116 160,112 192,104 224,100 256,92 288,86 320,80 320,168"
          />
          {/* Mean line brass */}
          <polyline
            fill="none"
            stroke="var(--brass-500)"
            strokeWidth="2"
            points="0,140 32,134 64,130 96,124 128,116 160,112 192,104 224,100 256,92 288,86 320,80"
          />
          {/* p95 dashed bond */}
          <polyline
            fill="none"
            stroke="var(--bond-500)"
            strokeWidth="0.9"
            strokeDasharray="3,3"
            points="0,140 32,120 64,108 96,90 128,82 160,68 192,58 224,46 256,38 288,30 320,24"
          />
          {/* p5 dashed title */}
          <polyline
            fill="none"
            stroke="var(--title-500)"
            strokeWidth="0.9"
            strokeDasharray="3,3"
            points="0,140 32,150 64,154 96,156 128,158 160,158 192,160 224,160 256,160 288,160 320,160"
          />
        </svg>
      </div>
      <div className="border-paper-300 mt-3.5 flex items-baseline justify-between border-t pt-3.5">
        <span className="text-mkt-mono text-ink-500 text-[11.5px] tracking-wider">
          Juste valeur unitaire (μ) <span className="text-ink-300 italic">· IC 95 %</span>
        </span>
        <span className="text-mkt-mono text-ink-900 text-[22px] font-medium leading-none tracking-[-0.02em]">
          288,42 €
          <span className="text-mkt-italic text-brass-700 ml-1.5 text-[18px]">± 14,8 €</span>
        </span>
      </div>
    </PvFrame>
  );
}

/** Pilier 3 — Audit trail : 4 events horodatés + hash sha256 */
export function PvAudit({ className }: { className?: string }) {
  const events = [
    {
      ts: ['07.05', '14:32'],
      body: (
        <>
          Validation finale du plan{' '}
          <span className="text-mkt-italic text-brass-700">BSPCE-2026-001</span> par David Lefèvre
          (CEO).
        </>
      ),
      hash: 'sha256 · 4f8a…c12d',
    },
    {
      ts: ['06.05', '09:18'],
      body: (
        <>
          Approbation CFO pour{' '}
          <span className="text-mkt-italic text-brass-700">5 attributions</span> (480 unités, ~138
          k€ FMV).
        </>
      ),
      hash: 'sha256 · 9e23…7b40',
    },
    {
      ts: ['05.05', '11:47'],
      body: (
        <>
          Refresh IFRS 2 trimestriel —{' '}
          <span className="text-mkt-italic text-brass-700">juste valeur</span> recalculée pour 3
          plans.
        </>
      ),
      hash: 'sha256 · a1c7…2ef9',
    },
    {
      ts: ['04.05', '16:02'],
      body: (
        <>
          Yousign — <span className="text-mkt-italic text-brass-700">signature qualifiée</span>{' '}
          reçue, lettre d&apos;attribution Marie L.
        </>
      ),
      hash: 'sha256 · b8f4…d301',
    },
  ];
  return (
    <PvFrame
      tag="● Journal de bord · Q1 2026"
      title="Audit trail — événements récents"
      className={className}
    >
      <div className="flex flex-col">
        {events.map((e, i) => (
          <div
            key={e.hash}
            className={cn(
              'grid grid-cols-[90px_1fr] gap-4 py-3 text-[12.5px]',
              i > 0 ? 'border-paper-300 border-t' : '',
            )}
          >
            <div className="text-mkt-mono text-ink-500 text-[10.5px] leading-snug">
              {e.ts[0]}
              <br />
              {e.ts[1]}
            </div>
            <div className="text-ink-700 leading-snug">
              {e.body}
              <div className="text-mkt-mono text-ink-400 mt-1 text-[9.5px] tracking-wider">
                {e.hash}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PvFrame>
  );
}

/** Pilier 4 — Portail bénéficiaire : greeting + vesting bar (256/1200) + 752 k€ gain net */
export function PvPortal({ className }: { className?: string }) {
  return (
    <PvFrame tag="● Vue salarié · Marie L." title="" className={className}>
      <div className="text-mkt-italic text-brass-700 -mt-2 mb-1 text-[16px]">Bonjour Marie,</div>
      <h4
        className="text-ink-900 mb-4 max-w-[14ch] text-[24px] font-medium leading-[1.15] tracking-[-0.02em]"
        style={{ fontFamily: 'var(--font-serif)', textWrap: 'balance' }}
      >
        vous détenez <span className="text-mkt-italic text-brass-700">1 200 BSPCE</span> sur
        Paragraphe.
      </h4>
      <div className="border-paper-300 bg-paper-100 mb-3.5 rounded-lg border p-4">
        <div className="text-mkt-mono text-ink-500 mb-2 flex justify-between text-[10.5px]">
          <span>Vesting · 256 / 1 200 acquis</span>
          <span>21,3 %</span>
        </div>
        <div className="bg-paper-200 relative flex h-3.5 overflow-hidden rounded-[3px]">
          <div className="bg-bond-500" style={{ width: '21.3%' }} />
          <div
            style={{
              width: '4.9%',
              background: 'linear-gradient(90deg, var(--bond-500), var(--ink-700))',
            }}
          />
          <div
            style={{
              width: '53.8%',
              background:
                'repeating-linear-gradient(45deg, var(--ink-300) 0 5px, var(--paper-200) 5px 10px)',
            }}
          />
          <div
            style={{
              width: '20%',
              background:
                'repeating-linear-gradient(90deg, var(--brass-500) 0 3px, transparent 3px 6px)',
              border: '1px dashed var(--brass-500)',
            }}
          />
          <div
            className="bg-brass-500 absolute"
            style={{ top: -6, bottom: -6, left: '26.2%', width: '1.5px' }}
            aria-hidden
          />
        </div>
      </div>
      <div className="bg-ink-900 text-paper-50 rounded-[10px] px-5 py-5">
        <div
          className="text-brass-300 mb-2 text-[9.5px] font-semibold uppercase tracking-[0.22em]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Si Paragraphe se vendait à 200 M€ · gain net
        </div>
        <div className="text-mkt-mono text-paper-50 text-[42px] font-semibold leading-none tracking-[-0.04em]">
          752<span className="text-brass-300 ml-1.5 text-[18px] font-medium">k€</span>
        </div>
      </div>
    </PvFrame>
  );
}

/** Hero mock — dashboard mini live avec 4 KPIs + vesting bar + tag brass */
export function HeroMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-paper-300 bg-paper-50 relative overflow-hidden rounded-[14px] border p-7 shadow-lg',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-1px] rounded-[14px]"
        style={{
          background: 'linear-gradient(135deg, rgba(184,134,91,0.16), transparent 40%)',
        }}
      />
      {/* Tag brass top-right */}
      <span
        className="bg-brass-50 border-brass-100 text-brass-700 absolute right-[18px] top-[18px] z-10 inline-flex items-center rounded-[3px] border px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        ● Cap table · Live
      </span>
      <div className="relative">
        <div className="flex items-baseline justify-between">
          <div
            className="text-ink-900 text-[18px] font-medium tracking-[-0.01em]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Paragraphe SAS
          </div>
        </div>
        <div className="text-ink-500 text-mkt-mono mb-1 text-[10.5px] tracking-wider">
          Q1 2026 · 07.05
        </div>
        <div className="bg-brass-500 mb-4 h-px w-8" aria-hidden />
        <div className="mb-4 grid grid-cols-2 gap-4">
          {[
            {
              ov: 'Capital totalement dilué',
              v: '9,78',
              u: 'M actions',
              delta: '+ 0,3 % vs T-1',
            },
            { ov: 'FMV par action', v: '312', u: '€', delta: '+ 12,8 % YoY' },
            {
              ov: 'Bénéficiaires actifs',
              v: '47',
              u: '/ 5 plans',
              delta: '+ 6 ce trimestre',
            },
            {
              ov: 'IFRS 2 — charge T1',
              v: '428',
              u: 'k€',
              delta: "selon plan d'audit",
            },
          ].map((kpi) => (
            <div
              key={kpi.ov}
              className="border-paper-300 bg-paper-100 rounded-lg border px-4 py-3.5"
            >
              <div className="text-brass-500 mb-2 text-[9.5px] font-semibold uppercase tracking-[0.18em]">
                {kpi.ov}
              </div>
              <div className="text-mkt-mono text-ink-900 flex items-baseline gap-1.5 text-[26px] font-medium leading-none tracking-[-0.02em]">
                {kpi.v}
                <span className="text-ink-500 text-[11px]">{kpi.u}</span>
              </div>
              <div className="text-mkt-mono text-bond-500 mt-1.5 text-[10.5px] font-semibold">
                {kpi.delta}
              </div>
            </div>
          ))}
        </div>
        <div className="border-paper-300 bg-paper-100 rounded-lg border p-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <div className="text-ink-700 text-[11px] font-semibold uppercase tracking-[0.1em]">
              Plan BSPCE-2026-001 · Vesting
            </div>
            <div className="text-mkt-mono text-ink-500 text-[10px]">15.03.2026 → 15.03.2030</div>
          </div>
          <div
            className="bg-paper-200 h-4.5 relative flex overflow-hidden rounded-[3px]"
            style={{ height: 18 }}
          >
            <div className="bg-bond-500" style={{ width: '21%' }} />
            <div
              style={{
                width: '5%',
                background: 'linear-gradient(90deg, var(--bond-500), var(--ink-700))',
              }}
            />
            <div
              style={{
                width: '54%',
                background:
                  'repeating-linear-gradient(45deg, var(--ink-300) 0 5px, var(--paper-200) 5px 10px)',
              }}
            />
            <div
              style={{
                width: '20%',
                background:
                  'repeating-linear-gradient(90deg, var(--brass-500) 0 3px, transparent 3px 6px)',
                border: '1px dashed var(--brass-500)',
              }}
            />
            <div
              className="bg-brass-500 absolute"
              style={{ top: -8, bottom: -8, left: '26%', width: '1.5px' }}
              aria-hidden
            />
          </div>
          <div className="text-mkt-mono text-ink-500 mt-2 flex justify-between text-[10px]">
            <span>0</span>
            <span>25 %</span>
            <span>50 %</span>
            <span>75 %</span>
            <span>100 %</span>
          </div>
        </div>
      </div>
    </div>
  );
}
