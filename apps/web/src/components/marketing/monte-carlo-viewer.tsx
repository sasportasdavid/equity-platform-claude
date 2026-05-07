/**
 * @deprecated Phase 5 — Remplacer par `McSimulator` (variant compact ou full)
 * dans `apps/web/src/components/marketing/simulator/McSimulator.tsx`.
 *
 * Encore utilisé en Phase 5 par :
 *  - `produit/valorisation-ifrs2/page.tsx` BigFeature "Visualisation Monte
 *     Carlo native, pas un PDF mort" → `MonteCarloViewerCompact`
 *
 * À retirer en Phase 6 quand le BigFeature sera refactoré (mini-mockup
 * SVG ou autre). La homepage et la section ReplayViewerSection ont déjà
 * basculé sur `McSimulatorLazy variant=compact|full` avec lazy mount
 * via IntersectionObserver.
 *
 * --- Documentation historique du composant ---
 *
 * Monte Carlo Viewer — reproduction fidèle du mockup live Capiwise.
 *
 * Vue dashboard complète en dark mode (ink-900) du replay viewer
 * Module 11 IFRS 2. Utilisée :
 *  - Homepage : pilier "Valorisation IFRS 2" (à la place de PvMonteCarlo)
 *  - /produit/valorisation-ifrs2 : visuel principal de la page
 *
 * Composants reproduits depuis le mockup :
 *  - Header : eyebrow VALORISATION MONTE CARLO LIVE · titre serif italique
 *    · seed/hash/runtime · CTA "Nouveau seed"
 *  - Trajectoires : 600 paths Touchée+ITM/OTM/Forfeited + lignes p5/p50/p95
 *    + Strike 50€ + Barrière 75€ + inset Asymétrie
 *  - Sidebar : Juste valeur 13,27 € · 4 KPIs · Greeks Δ/ν/ϱ · Tweaks 3 sliders
 *  - 4 mini-charts : Convergence, Distribution, S(T), Temps avant touche
 *  - 2 sensibilités : Barrière, Volatilité
 *  - Footer : moteur GBM Box-Muller · pricer barrier-up-and-in call · IFRS 2 §16-18
 */

import { cn } from '@/lib/utils';

const COLORS = {
  bg: '#0B1124', // ink-900 plus profond pour dashboard
  panelBg: 'rgba(255,255,255,0.025)',
  panelBorder: 'rgba(255,255,255,0.08)',
  ink900: '#0B1124',
  text: '#F0EAD8',
  textDim: '#8A8474',
  textMuted: 'rgba(240,234,216,0.55)',
  brass: '#D4A06A',
  brassMid: '#B8865B',
  brassDim: 'rgba(212,160,106,0.65)',
  bond: '#4FB58A',
  paperLight: 'rgba(240,234,216,0.06)',
};

/**
 * Header haut du viewer : titre serif italique + meta (seed/hash/runtime)
 * + bouton Nouveau seed.
 */
function MCHeader() {
  return (
    <div className="border-white/8 flex items-start justify-between border-b pb-7">
      <div className="flex flex-col gap-2">
        <div className="text-mkt-mono flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4A06A]">
          <span className="size-2 rounded-full bg-[#D4A06A]" aria-hidden />
          Valorisation Monte Carlo · Live
        </div>
        <h3
          className="m-0 text-[44px] font-medium leading-[1.05] tracking-[-0.02em] text-[#F0EAD8]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          PSP{' '}
          <span className="italic" style={{ fontVariationSettings: "'opsz' 144" }}>
            2026
          </span>{' '}
          ·{' '}
          <span className="italic" style={{ fontVariationSettings: "'opsz' 144" }}>
            Tranche 3
          </span>
        </h3>
        <p className="text-[14px] text-[#F0EAD8]/55">
          Performance Share Plan avec barrière de cours · IFRS 2 grant date fair value
        </p>
      </div>
      <div className="flex items-start gap-6">
        <div className="text-mkt-mono flex flex-col items-end gap-1 text-[11px] tracking-wider text-[#F0EAD8]/55">
          <div>
            <span className="text-[#F0EAD8]/40">seed</span>{' '}
            <span className="text-[#F0EAD8]/85">00000042</span>
          </div>
          <div>
            <span className="text-[#F0EAD8]/40">hash</span>{' '}
            <span className="text-[#F0EAD8]/85">0x6c23f9e5</span>
          </div>
          <div>
            <span className="text-[#F0EAD8]/40">runtime</span>{' '}
            <span className="text-[#F0EAD8]/85">179 ms · 60k paths</span>
          </div>
        </div>
        <button
          type="button"
          className="text-mkt-mono bg-white/4 hover:bg-white/8 shrink-0 rounded border border-white/10 px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#F0EAD8]/85"
        >
          ↻ Nouveau seed
        </button>
      </div>
    </div>
  );
}

/** Panneau wrapper avec border + fond légèrement clair */
function MCPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-white/8 bg-white/3 rounded-[8px] border p-5', className)}>
      {children}
    </div>
  );
}

function MCPanelTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-mkt-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#F0EAD8]/85">
          {title}
        </span>
        {subtitle ? (
          <span className="text-mkt-mono text-[10px] text-[#F0EAD8]/45">{subtitle}</span>
        ) : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

/** Trajectoires — viz principale 600 paths + percentiles + strike/barrière */
function MCTrajectories() {
  // 18 paths simulés : ITM (vert), OTM (saffron), Forfeited (gris bleu)
  // Génération déterministe pour rendu identique côté serveur.
  const paths = Array.from({ length: 18 }).map((_, i) => {
    const seed = i * 11 + 7;
    const points: string[] = [];
    let y = 250 + (i % 3) * 8;
    for (let t = 0; t <= 50; t++) {
      const x = (t / 50) * 1000;
      const drift = -0.6;
      const vol = Math.sin(seed + t * 0.5) * 8 + Math.cos(seed * 0.7 + t * 0.3) * 6;
      y = y + drift + vol;
      y = Math.max(45, Math.min(290, y));
      points.push(`${x},${y}`);
    }
    const final = parseFloat(points[points.length - 1]!.split(',')[1]!);
    let cls: 'itm' | 'otm' | 'forfeited' = 'forfeited';
    if (final < 100) cls = 'itm';
    else if (final < 180) cls = 'otm';
    const stroke = cls === 'itm' ? '#4FB58A' : cls === 'otm' ? '#D4A06A' : 'rgba(150,160,180,0.4)';
    const opacity = cls === 'itm' ? 0.55 : cls === 'otm' ? 0.5 : 0.35;
    return { points: points.join(' '), stroke, opacity };
  });

  return (
    <MCPanel className="col-span-full">
      <MCPanelTitle
        title="Trajectoires (échantillon · 600)"
        subtitle="moteur GBM risk-neutral"
        right={
          <div className="text-mkt-mono flex items-center gap-5 text-[10.5px] text-[#F0EAD8]/65">
            <span className="inline-flex items-center gap-2">
              <span className="h-px w-3 bg-[#4FB58A]" /> Touchée + ITM ( 34.8 % )
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-px w-3 bg-[#D4A06A]" /> Touchée OTM ( 7.0 % )
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-px w-3 bg-white/30" /> Forfeited ( 58.2 % )
            </span>
          </div>
        }
      />
      <div className="relative h-[340px] overflow-hidden rounded">
        <svg viewBox="0 0 1000 320" preserveAspectRatio="none" className="h-full w-full">
          {/* Grid horizontal subtle */}
          {[60, 120, 180, 240].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="1000"
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          ))}
          {/* All paths */}
          {paths.map((p, i) => (
            <polyline
              key={i}
              points={p.points}
              fill="none"
              stroke={p.stroke}
              strokeOpacity={p.opacity}
              strokeWidth="0.8"
            />
          ))}
          {/* p95 dashed brass dim */}
          <line
            x1="0"
            y1="50"
            x2="1000"
            y2="35"
            stroke="rgba(212,160,106,0.5)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
          {/* Barrière à 75€ */}
          <line
            x1="0"
            y1="105"
            x2="1000"
            y2="105"
            stroke="rgba(212,160,106,0.7)"
            strokeWidth="1.2"
            strokeDasharray="6,4"
          />
          {/* Strike + S0 à 50€ */}
          <line
            x1="0"
            y1="180"
            x2="1000"
            y2="180"
            stroke="rgba(212,160,106,0.4)"
            strokeWidth="1"
            strokeDasharray="2,3"
          />
          {/* p50 mean line solid brass */}
          <line x1="0" y1="190" x2="1000" y2="195" stroke="#D4A06A" strokeWidth="2" />
          {/* p5 dashed dim */}
          <line
            x1="0"
            y1="240"
            x2="1000"
            y2="265"
            stroke="rgba(150,160,180,0.4)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
        </svg>
        {/* Y axis labels overlay */}
        <div className="text-mkt-mono pointer-events-none absolute right-0 top-0 flex h-full flex-col justify-between py-1 text-right text-[10.5px] text-[#F0EAD8]/55">
          <div>
            <div className="leading-none">p95 · 121 €</div>
          </div>
          <div className="text-[#D4A06A]">BARRIÈRE · 75 €</div>
          <div>
            <div>p50 · 47 €</div>
          </div>
          <div>
            <div>p5 · 17 €</div>
          </div>
        </div>
        <div className="text-mkt-mono pointer-events-none absolute left-0 top-0 flex h-full flex-col justify-between py-1 pl-1 text-[10.5px] text-[#F0EAD8]/55">
          <div></div>
          <div>STRIKE K · 50 €</div>
          <div>S₀ · 50 €</div>
          <div></div>
        </div>
        <div className="text-mkt-mono pointer-events-none absolute bottom-1 left-1 text-[10.5px] text-[#F0EAD8]/45">
          t = 0
        </div>
        <div className="text-mkt-mono pointer-events-none absolute bottom-1 right-2 text-[10.5px] text-[#F0EAD8]/45">
          T = 3.5 ans
        </div>
        {/* Inset Asymétrie */}
        <div className="border-white/12 bg-white/4 absolute right-[28%] top-4 max-w-[230px] rounded border p-3 backdrop-blur-sm">
          <div className="text-mkt-mono mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
            Asymétrie
          </div>
          <p
            className="m-0 text-[11.5px] italic leading-snug text-[#F0EAD8]/75"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Drift positif r = 3,2 % en mesure risque-neutre
          </p>
        </div>
      </div>
    </MCPanel>
  );
}

/** Sidebar — Juste valeur + 4 KPIs + Greeks + Tweaks */
function MCSidebar() {
  return (
    <div className="flex flex-col gap-4">
      {/* Juste valeur — bloc principal */}
      <MCPanel>
        <div className="text-mkt-mono mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
          Juste valeur · IFRS 2 grant FV
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-[56px] font-medium leading-none tracking-[-0.03em] text-[#F0EAD8]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            13,27
          </span>
          <span className="text-mkt-mono text-[18px] text-[#D4A06A]">€</span>
        </div>
        <div className="text-mkt-mono mt-3 flex items-baseline gap-3 text-[11px] text-[#F0EAD8]/55">
          <span>± 0,111 €</span>
          <span className="text-[#F0EAD8]/35">IC 95%</span>
          <span>[13,06 ; 13,49]</span>
        </div>
      </MCPanel>

      {/* 4 KPIs grid 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { lbl: 'Hit rate', v: '41,8', u: '%', sub: 'paths ≥ 75 €' },
          { lbl: 'Forfeited', v: '58,2', u: '%', sub: 'payoff = 0' },
          { lbl: 'ITM Final', v: '34,8', u: '%', sub: 'contribuent à FV' },
          { lbl: 'Paths', v: '60', u: 'k', sub: '60 pas · dt 0,058a' },
        ].map((k) => (
          <div key={k.lbl} className="border-white/8 bg-white/3 rounded border p-3.5">
            <div className="text-mkt-mono mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
              {k.lbl}
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[#F0EAD8]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {k.v}
              </span>
              <span className="text-mkt-mono text-[14px] text-[#D4A06A]">{k.u}</span>
            </div>
            <div className="text-mkt-mono mt-2 text-[10px] text-[#F0EAD8]/45">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Greeks */}
      <MCPanel>
        <div className="text-mkt-mono mb-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
          Greeks · Différences finies
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { sym: 'Δ', name: '', val: '0,379', unit: '' },
            { sym: 'ν', name: '(vega)', val: '0,086', unit: '/1%' },
            { sym: 'ϱ', name: '(rho)', val: '2,323', unit: '/1%' },
          ].map((g) => (
            <div key={g.sym} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[18px] italic text-[#F0EAD8]/85"
                  style={{ fontFamily: 'var(--font-serif)', fontVariationSettings: "'opsz' 144" }}
                >
                  {g.sym}
                </span>
                <span className="text-mkt-mono text-[10px] text-[#F0EAD8]/40">{g.name}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-[20px] font-medium leading-none tracking-[-0.02em] text-[#F0EAD8]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {g.val}
                </span>
                <span className="text-mkt-mono text-[10px] text-[#F0EAD8]/45">{g.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </MCPanel>

      {/* Tweaks live */}
      <MCPanel>
        <div className="text-mkt-mono mb-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
          Tweaks · re-simu live
        </div>
        <div className="flex flex-col gap-4">
          {[
            { label: 'Volatilité σ', value: '32,0 %', min: '10,0 %', max: '60,0 %', pos: 0.55 },
            {
              label: 'Barrière B',
              value: '75 €',
              min: '55 €',
              mid: '50 % vs S₀',
              max: '120 €',
              pos: 0.45,
            },
            { label: 'Maturité T', value: '3,50 ans', min: '1,00 ans', max: '6,00 ans', pos: 0.5 },
          ].map((t) => (
            <div key={t.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-[#F0EAD8]/85">{t.label}</span>
                <span
                  className="text-[14px] font-medium text-[#D4A06A]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t.value}
                </span>
              </div>
              <div className="relative h-[3px] rounded-full bg-white/10">
                <div
                  className="absolute h-full rounded-full bg-[#D4A06A]/40"
                  style={{ width: `${t.pos * 100}%` }}
                />
                <span
                  aria-hidden
                  className="absolute size-3.5 rounded-full bg-[#D4A06A] ring-2 ring-[#0B1124]"
                  style={{ left: `calc(${t.pos * 100}% - 7px)`, top: '-5.5px' }}
                />
              </div>
              <div className="text-mkt-mono flex justify-between text-[9.5px] text-[#F0EAD8]/35">
                <span>{t.min}</span>
                {'mid' in t ? <span>{(t as { mid?: string }).mid}</span> : null}
                <span>{t.max}</span>
              </div>
            </div>
          ))}
        </div>
      </MCPanel>
    </div>
  );
}

/** Mini chart panel : sparkline + label + value */
function MCMiniChart({
  title,
  subtitle,
  type,
}: {
  title: string;
  subtitle: string;
  type: 'convergence' | 'distribution' | 'terminal' | 'time';
}) {
  return (
    <MCPanel>
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="text-mkt-mono text-[9.5px] font-semibold uppercase leading-snug tracking-[0.16em] text-[#F0EAD8]/85">
          {title}
        </div>
        <div className="text-mkt-mono text-[9.5px] text-[#F0EAD8]/45">{subtitle}</div>
      </div>
      <div className="relative h-[100px]">
        <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="h-full w-full">
          {type === 'convergence' && (
            <>
              {/* Area band */}
              <path
                d="M 0,55 L 20,40 L 40,32 L 60,28 L 80,26 L 100,24 L 120,23 L 140,22 L 160,21 L 180,21 L 200,21 L 200,35 L 180,33 L 160,32 L 140,32 L 120,32 L 100,33 L 80,35 L 60,38 L 40,42 L 20,50 L 0,65 Z"
                fill="rgba(212,160,106,0.15)"
              />
              <polyline
                points="0,60 20,45 40,36 60,30 80,28 100,26 120,25 140,24 160,23 180,23 200,23"
                fill="none"
                stroke="#D4A06A"
                strokeWidth="1.5"
              />
              <text
                x="2"
                y="14"
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="#F0EAD8"
                opacity="0.55"
              >
                15.7
              </text>
              <text x="178" y="20" fontFamily="var(--font-mono)" fontSize="9" fill="#D4A06A">
                13.27 €
              </text>
              <text
                x="2"
                y="92"
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="#F0EAD8"
                opacity="0.55"
              >
                4.1
              </text>
              <text
                x="2"
                y="100"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.4"
              >
                100
              </text>
              <text
                x="80"
                y="100"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.4"
              >
                1k
              </text>
              <text
                x="160"
                y="100"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.4"
              >
                10k
              </text>
            </>
          )}
          {type === 'distribution' && (
            <>
              {/* Histogram */}
              {[80, 25, 15, 10, 7, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1].map((h, i) => (
                <rect
                  key={i}
                  x={i * 12 + 5}
                  y={100 - h - 5}
                  width="10"
                  height={h + 5}
                  fill={i === 0 ? '#4FB58A' : '#D4A06A'}
                  opacity={i === 0 ? 0.85 : 0.55}
                />
              ))}
              <text
                x="2"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                0
              </text>
              <text
                x="60"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                payoff actualisé · €
              </text>
              <text
                x="170"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                461€
              </text>
            </>
          )}
          {type === 'terminal' && (
            <>
              {[5, 18, 32, 45, 35, 22, 14, 9, 6, 4, 3, 2, 2, 1, 1].map((h, i) => (
                <rect
                  key={i}
                  x={i * 12 + 5}
                  y={100 - h * 1.3 - 5}
                  width="10"
                  height={h * 1.3 + 5}
                  fill="#D4A06A"
                  opacity={0.55}
                />
              ))}
              <text
                x="2"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                4€
              </text>
              <text
                x="60"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                prix terminal · €
              </text>
              <text
                x="170"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                565€
              </text>
            </>
          )}
          {type === 'time' && (
            <>
              {Array.from({ length: 30 }).map((_, i) => {
                const h = Math.abs(Math.sin(i * 0.45) * 30 + Math.cos(i * 0.7) * 15) + 10;
                return (
                  <rect
                    key={i}
                    x={i * 6.4 + 5}
                    y={100 - h - 5}
                    width="5"
                    height={h + 5}
                    fill="rgba(150,160,200,0.45)"
                  />
                );
              })}
              <text
                x="2"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                0.1a
              </text>
              <text
                x="80"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                t · années
              </text>
              <text
                x="170"
                y="98"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="#F0EAD8"
                opacity="0.45"
              >
                3.5a
              </text>
            </>
          )}
        </svg>
      </div>
    </MCPanel>
  );
}

/** Sensibilité chart : courbe lisse avec point highlight */
function MCSensitivity({
  title,
  subtitle,
  curveType,
  highlight,
}: {
  title: string;
  subtitle: string;
  curveType: 'down' | 'up';
  highlight: { x: number; label: string };
}) {
  const points =
    curveType === 'down'
      ? '0,30 30,32 60,38 90,46 120,58 150,72 180,86 200,95'
      : '0,90 30,82 60,72 90,62 120,52 150,42 180,32 200,28';
  return (
    <MCPanel>
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="text-mkt-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#F0EAD8]/85">
          {title}
        </div>
        <div className="text-mkt-mono text-[9.5px] text-[#F0EAD8]/45">{subtitle}</div>
      </div>
      <div className="relative h-[110px]">
        <svg viewBox="0 0 200 110" preserveAspectRatio="none" className="h-full w-full">
          {/* Area */}
          <path
            d={`M ${points.split(' ').join(' L ')} L 200,110 L 0,110 Z`}
            fill="rgba(212,160,106,0.12)"
          />
          {/* Curve */}
          <polyline points={points} fill="none" stroke="#D4A06A" strokeWidth="1.5" />
          {/* Highlight dot */}
          <line
            x1={highlight.x}
            y1="0"
            x2={highlight.x}
            y2="100"
            stroke="rgba(212,160,106,0.4)"
            strokeWidth="0.7"
            strokeDasharray="2,3"
          />
          <circle cx={highlight.x} cy={curveType === 'down' ? 56 : 50} r="3.5" fill="#D4A06A" />
          <text
            x={highlight.x - 18}
            y="20"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill="#F0EAD8"
            fontWeight="600"
          >
            {highlight.label}
          </text>
          <text
            x="2"
            y="14"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            fill="#F0EAD8"
            opacity="0.55"
          >
            {curveType === 'down' ? '5,18€' : '3,54€'}
          </text>
          <text
            x="2"
            y="98"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            fill="#F0EAD8"
            opacity="0.55"
          >
            {curveType === 'down' ? '7,62€' : '3,02€'}
          </text>
          <text
            x="2"
            y="108"
            fontFamily="var(--font-mono)"
            fontSize="8"
            fill="#F0EAD8"
            opacity="0.4"
          >
            {curveType === 'down' ? '55€' : '15%'}
          </text>
          <text
            x="178"
            y="108"
            fontFamily="var(--font-mono)"
            fontSize="8"
            fill="#F0EAD8"
            opacity="0.4"
          >
            {curveType === 'down' ? '110€' : '53%'}
          </text>
        </svg>
      </div>
    </MCPanel>
  );
}

/**
 * Composant principal — viewer complet sur fond ink-900.
 */
export function MonteCarloViewer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-white/8 relative overflow-hidden rounded-[14px] border p-7 shadow-2xl',
        className,
      )}
      style={{ background: COLORS.bg, color: COLORS.text }}
    >
      <MCHeader />
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <MCTrajectories />
          {/* 4 mini charts */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MCMiniChart
              title="Convergence FV vs N"
              subtitle="échelle log · IC 95%"
              type="convergence"
            />
            <MCMiniChart
              title="Distribution Payoffs"
              subtitle="39132 paths à 0"
              type="distribution"
            />
            <MCMiniChart title="S(T) · Prix Terminal" subtitle="médiane 46,7 €" type="terminal" />
            <MCMiniChart title="Temps avant Touche" subtitle="moyenne 1,54 ans" type="time" />
          </div>
          {/* 2 sensibilités */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MCSensitivity
              title="Sensibilité Barrière"
              subtitle="FV vs niveau de barrière · 8k paths"
              curveType="down"
              highlight={{ x: 65, label: '13,10€' }}
            />
            <MCSensitivity
              title="Sensibilité Volatilité"
              subtitle="FV vs σ · 8k paths"
              curveType="up"
              highlight={{ x: 110, label: '13,29€' }}
            />
          </div>
        </div>
        <MCSidebar />
      </div>
      {/* Footer */}
      <div className="text-mkt-mono border-white/8 mt-6 flex items-center justify-between border-t pt-4 text-[10.5px] tracking-wider text-[#F0EAD8]/40">
        <span>
          moteur · GBM Box-Muller · pricer barrier-up-and-in call · discount continuous · v2.4.1
        </span>
        <span>conforme IFRS 2 §16-18 · audit-ready · 2026-05-07</span>
      </div>
    </div>
  );
}

/** Variante compacte pour le pilier homepage — masque le footer + footer charts */
export function MonteCarloViewerCompact({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-white/8 relative overflow-hidden rounded-[14px] border p-5 shadow-2xl',
        className,
      )}
      style={{ background: COLORS.bg, color: COLORS.text }}
    >
      <MCHeader />
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        <MCTrajectories />
        <MCSidebar />
      </div>
    </div>
  );
}
