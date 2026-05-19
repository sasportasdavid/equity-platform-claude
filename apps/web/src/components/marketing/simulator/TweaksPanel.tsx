'use client';

import { useCallback, useId, useRef } from 'react';
import type { SimulatorParams } from '@/hooks/useMcSimulator';
import { cn } from '@/lib/utils';

const NF_PCT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const NF_T = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF_EUR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

type SliderConfig = {
  label: string;
  paramKey: 'sigma' | 'B' | 'T';
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  formatBound: (v: number) => string;
  /** Pour `B`, on ne lance jamais isDragging=false direct au mount ; le slider est désactivé si null. */
  disabledIfNull?: boolean;
};

const SLIDERS: SliderConfig[] = [
  {
    label: 'Volatilité σ',
    paramKey: 'sigma',
    min: 0.1,
    max: 0.6,
    step: 0.01,
    format: (v) => `${NF_PCT.format(v * 100)} %`,
    formatBound: (v) => `${NF_PCT.format(v * 100)} %`,
  },
  {
    label: 'Barrière B',
    paramKey: 'B',
    min: 55,
    max: 120,
    step: 1,
    format: (v) => `${NF_EUR.format(v)} €`,
    formatBound: (v) => `${NF_EUR.format(v)} €`,
    disabledIfNull: true,
  },
  {
    label: 'Maturité T',
    paramKey: 'T',
    min: 1,
    max: 7,
    step: 0.25,
    format: (v) => `${NF_T.format(v)} ans`,
    formatBound: (v) => `${NF_T.format(v)} ans`,
  },
];

export function TweaksPanel({
  params,
  setParam,
  nextSeed,
}: {
  params: SimulatorParams;
  setParam: <K extends keyof SimulatorParams>(
    key: K,
    value: SimulatorParams[K],
    isDragging?: boolean,
  ) => void;
  nextSeed: () => void;
}) {
  return (
    <div className="border-white/8 bg-white/3 rounded-[8px] border p-5">
      <div className="text-mkt-mono mb-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#D4A06A]">
        Tweaks · re-simu live
      </div>
      <div className="flex flex-col gap-5">
        {SLIDERS.map((cfg) => (
          <Slider key={cfg.paramKey} cfg={cfg} params={params} setParam={setParam} />
        ))}
      </div>
      <button
        type="button"
        onClick={nextSeed}
        className="text-mkt-mono mt-5 w-full rounded border border-[#D4A06A]/40 bg-transparent px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#F0EAD8]/85 transition-all hover:bg-[#D4A06A]/10"
      >
        ↻ Nouveau seed
      </button>
    </div>
  );
}

function Slider({
  cfg,
  params,
  setParam,
}: {
  cfg: SliderConfig;
  params: SimulatorParams;
  setParam: <K extends keyof SimulatorParams>(
    key: K,
    value: SimulatorParams[K],
    isDragging?: boolean,
  ) => void;
}) {
  const id = useId();
  const isB = cfg.paramKey === 'B';
  const rawValue = params[cfg.paramKey];
  const disabled = isB && rawValue === null;
  const value = rawValue === null ? cfg.min : (rawValue as number);

  const draggingRef = useRef(false);
  const lastEmittedRef = useRef(0);

  const onPointerDown = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    // commit final via release direct précis
    setParam(cfg.paramKey, value as never, false);
  }, [setParam, cfg.paramKey, value]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      // throttle ~50 ms pendant drag
      const now = performance.now();
      const isDragging = draggingRef.current;
      if (isDragging) {
        if (now - lastEmittedRef.current < 50) {
          // setState local instantané même si on n'envoie pas au worker
          setParam(cfg.paramKey, v as never, true);
          return;
        }
        lastEmittedRef.current = now;
        setParam(cfg.paramKey, v as never, true);
      } else {
        // keyboard / step click : release direct
        setParam(cfg.paramKey, v as never, false);
      }
    },
    [setParam, cfg.paramKey],
  );

  const pct = ((value - cfg.min) / (cfg.max - cfg.min)) * 100;

  return (
    <div className={cn('flex flex-col gap-2', disabled && 'opacity-40')}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[12px] text-[#F0EAD8]/85">
          {cfg.label}
        </label>
        <span
          className="text-[14px] font-medium text-[#D4A06A]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {disabled ? '—' : cfg.format(value)}
        </span>
      </div>
      <div className="relative h-[18px]">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
        {!disabled && (
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#D4A06A]/40"
            style={{ width: `${pct}%`, left: 0 }}
          />
        )}
        <input
          id={id}
          type="range"
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          value={value}
          disabled={disabled}
          onChange={onChange}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'mc-slider absolute inset-0 w-full cursor-pointer appearance-none bg-transparent',
            'disabled:cursor-not-allowed',
            // Thumb WebKit
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:size-3.5',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-[#D4A06A]',
            '[&::-webkit-slider-thumb]:border-2',
            '[&::-webkit-slider-thumb]:border-[#0B1124]',
            '[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(212,160,106,0.3)]',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:transition-transform',
            'hover:[&::-webkit-slider-thumb]:scale-110',
            'disabled:[&::-webkit-slider-thumb]:bg-[rgba(212,160,106,0.3)]',
            'disabled:[&::-webkit-slider-thumb]:cursor-not-allowed',
            // Thumb Firefox
            '[&::-moz-range-thumb]:size-3.5',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-[#D4A06A]',
            '[&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-[#0B1124]',
            '[&::-moz-range-thumb]:cursor-pointer',
            'disabled:[&::-moz-range-thumb]:bg-[rgba(212,160,106,0.3)]',
          )}
        />
      </div>
      <div className="text-mkt-mono flex justify-between text-[9.5px] text-[#F0EAD8]/35">
        <span>{cfg.formatBound(cfg.min)}</span>
        <span>{cfg.formatBound(cfg.max)}</span>
      </div>
    </div>
  );
}
