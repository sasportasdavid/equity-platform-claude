'use client';

import { PRESETS } from '@/lib/mc/presets';
import type { PresetKey } from '@/lib/mc/types';
import { cn } from '@/lib/utils';

const ORDER: PresetKey[] = ['psp_barrier', 'aga_classic', 'bspce', 'so_us', 'tsr_peer'];

export function PresetSelector({
  value,
  onChange,
}: {
  value: PresetKey;
  onChange: (preset: PresetKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Type de plan" className="flex flex-wrap gap-2">
        {ORDER.map((key) => {
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                'rounded-md border px-3.5 py-2 text-[12.5px] font-medium tracking-wide transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A06A]/60',
                active
                  ? 'border-[#D4A06A]/40 bg-[#D4A06A]/15 text-[#F0EAD8]'
                  : 'border-[#F0EAD8]/15 bg-transparent text-[#F0EAD8]/70 hover:border-[#F0EAD8]/30 hover:text-[#F0EAD8]/90',
              )}
            >
              {PRESETS[key].shortLabel}
            </button>
          );
        })}
      </div>
      <p
        className="text-[12.5px] italic leading-snug text-[#F0EAD8]/65"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {PRESETS[value].description}
      </p>
    </div>
  );
}
