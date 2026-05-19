'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useMcSimulator, type WorkerFactory } from '@/hooks/useMcSimulator';
import { PRESETS } from '@/lib/mc/presets';
import type { PresetKey } from '@/lib/mc/types';
import { AuditFooter, AuditPanel } from './AuditPanel';
import { KPICards } from './KPICards';
import { PathsCanvas } from './PathsCanvas';
import { PresetSelector } from './PresetSelector';
import { TweaksPanel } from './TweaksPanel';

/**
 * Simulateur Monte Carlo IFRS 2 — composant racine.
 *
 * Deux variants Phase 5 :
 *  - `full` (default) : presets + sliders + nouveau seed + KPI 2x2 +
 *     description italique. Utilisé sur `/produit/valorisation-ifrs2`
 *     dans `ReplayViewerSection`.
 *  - `compact` : canvas + FV principale uniquement + CTA brass vers
 *     la page produit ancrée sur `#simulateur`. Pas d'interaction.
 *     Utilisé sur la homepage (pilier ii Valorisation IFRS 2).
 */
export function McSimulator({
  initialPreset = 'psp_barrier',
  workerFactory,
  variant = 'full',
}: {
  initialPreset?: PresetKey;
  /** Test-only override for the Worker factory (used by Vitest mocks). */
  workerFactory?: WorkerFactory;
  variant?: 'full' | 'compact';
}) {
  const sim = useMcSimulator(initialPreset, workerFactory);
  const isQuick = sim.isComputing && sim.tier === 'quick';
  const isCompact = variant === 'compact';

  return (
    <div
      className="border-white/8 relative overflow-hidden rounded-[14px] border p-7 shadow-2xl"
      style={{ background: '#0B1124', color: '#F0EAD8' }}
      data-mc-simulator
      data-variant={variant}
    >
      {/* === Header === */}
      <div className="border-white/8 flex items-start justify-between gap-6 border-b pb-6">
        <div className="flex flex-col gap-2">
          <div className="text-mkt-mono flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4A06A]">
            <span className="size-2 rounded-full bg-[#D4A06A]" aria-hidden />
            Valorisation Monte Carlo · Live
          </div>
          <h2
            className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-0.02em] text-[#F0EAD8] md:text-[36px]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            <span className="italic" style={{ fontVariationSettings: "'opsz' 144" }}>
              {PRESETS[sim.presetKey].shortLabel}
            </span>{' '}
            · simulateur IFRS 2
          </h2>
          {!isCompact ? (
            <p className="text-[14px] text-[#F0EAD8]/55">
              {PRESETS[sim.presetKey].label} · grant date fair value
            </p>
          ) : null}
        </div>
        <AuditPanel result={sim.result} seed={sim.params.seed} />
      </div>

      {/* === Preset selector (full only) === */}
      {!isCompact ? (
        <div className="mt-6">
          <PresetSelector value={sim.presetKey} onChange={sim.setPreset} />
        </div>
      ) : null}

      {/* === Main grid === */}
      <div
        className={
          isCompact
            ? 'mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]'
            : 'mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12'
        }
      >
        <div className={isCompact ? 'min-w-0' : 'min-w-0 lg:col-span-8'}>
          <PathsCanvas
            result={sim.result}
            params={sim.params}
            isComputing={sim.isComputing}
            className={
              isCompact
                ? 'h-[280px] sm:h-[320px] lg:h-[340px]'
                : 'h-[400px] sm:h-[440px] lg:h-[500px]'
            }
          />
        </div>
        <div className={isCompact ? 'flex flex-col gap-4' : 'flex flex-col gap-5 lg:col-span-4'}>
          <KPICards result={sim.result} isQuick={isQuick} T={sim.params.T} variant={variant} />
          {!isCompact ? (
            <TweaksPanel params={sim.params} setParam={sim.setParam} nextSeed={sim.nextSeed} />
          ) : (
            <Link
              href="/produit/valorisation-ifrs2#simulateur"
              className="inline-flex items-center justify-center gap-2 rounded border border-[#D4A06A]/40 bg-transparent px-4 py-3 text-[12.5px] font-medium uppercase tracking-[0.16em] text-[#F0EAD8]/85 transition-all hover:bg-[#D4A06A]/10"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Essayer le simulateur
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      <AuditFooter result={sim.result} />
    </div>
  );
}
