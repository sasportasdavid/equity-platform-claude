'use client';

import { useMcSimulator, type WorkerFactory } from '@/hooks/useMcSimulator';
import { PRESETS } from '@/lib/mc/presets';
import type { PresetKey } from '@/lib/mc/types';
import { AuditFooter, AuditPanel } from './AuditPanel';
import { KPICards } from './KPICards';
import { PathsCanvas } from './PathsCanvas';
import { PresetSelector } from './PresetSelector';
import { TweaksPanel } from './TweaksPanel';

/**
 * Simulateur Monte Carlo IFRS 2 — composant racine Phase 2.
 *
 * Compose les sous-composants en grid 12 colonnes desktop / stack
 * vertical mobile. Wrap tout dans le container ink-900 du DS.
 */
export function McSimulator({
  initialPreset = 'psp_barrier',
  workerFactory,
}: {
  initialPreset?: PresetKey;
  /** Test-only override for the Worker factory (used by Vitest mocks). */
  workerFactory?: WorkerFactory;
}) {
  const sim = useMcSimulator(initialPreset, workerFactory);
  const isQuick = sim.isComputing && sim.tier === 'quick';

  return (
    <div
      className="border-white/8 relative overflow-hidden rounded-[14px] border p-7 shadow-2xl"
      style={{ background: '#0B1124', color: '#F0EAD8' }}
      data-mc-simulator
    >
      {/* === Header === */}
      <div className="border-white/8 flex items-start justify-between gap-6 border-b pb-7">
        <div className="flex flex-col gap-2">
          <div className="text-mkt-mono flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4A06A]">
            <span className="size-2 rounded-full bg-[#D4A06A]" aria-hidden />
            Valorisation Monte Carlo · Live
          </div>
          <h2
            className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-0.02em] text-[#F0EAD8] md:text-[44px]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            <span className="italic" style={{ fontVariationSettings: "'opsz' 144" }}>
              {PRESETS[sim.presetKey].shortLabel}
            </span>{' '}
            · simulateur IFRS 2
          </h2>
          <p className="text-[14px] text-[#F0EAD8]/55">
            {PRESETS[sim.presetKey].label} · grant date fair value
          </p>
        </div>
        <AuditPanel result={sim.result} />
      </div>

      {/* === Preset selector === */}
      <div className="mt-6">
        <PresetSelector value={sim.presetKey} onChange={sim.setPreset} />
      </div>

      {/* === Main grid : canvas (8 cols) + sidebar (4 cols) === */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <PathsCanvas
            result={sim.result}
            params={sim.params}
            isComputing={sim.isComputing}
            className="h-[400px] sm:h-[440px] lg:h-[500px]"
          />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-4">
          <KPICards result={sim.result} isQuick={isQuick} />
          <TweaksPanel params={sim.params} setParam={sim.setParam} nextSeed={sim.nextSeed} />
        </div>
      </div>

      <AuditFooter result={sim.result} />
    </div>
  );
}
