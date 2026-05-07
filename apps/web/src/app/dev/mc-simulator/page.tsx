import { McSimulator } from '@/components/marketing/simulator/McSimulator';

/**
 * Sandbox `/dev/mc-simulator` — validation visuelle du simulateur
 * Phase 2 sans toucher aux pages publiques.
 *
 * Protégé en prod par `apps/web/src/app/dev/layout.tsx`
 * (ENABLE_DEV_SANDBOX=true requis sur Vercel preview).
 */
export default function McSimulatorDevPage() {
  return (
    <div className="min-h-screen bg-[#0B1124] p-4 sm:p-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <McSimulator />
      </div>
    </div>
  );
}
