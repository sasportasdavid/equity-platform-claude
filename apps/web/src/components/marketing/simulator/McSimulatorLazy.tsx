'use client';

import { useEffect, useRef, useState } from 'react';
import { McSimulator } from './McSimulator';
import { McSimulatorSkeleton } from './McSimulatorSkeleton';

/**
 * Wrapper lazy-mount du simulateur Monte Carlo.
 *
 * Le composant n'instancie le Web Worker + l'engine que lorsque le
 * bloc entre en viewport (avec un pre-fetch margin de 200px). Évite
 * de charger le worker au mount du document — gain LCP/TBT côté
 * homepage notamment.
 *
 * Pendant l'attente, un skeleton marine sombre garde la même hauteur
 * pour zéro layout shift.
 */
export function McSimulatorLazy({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Fallback jsdom / vieux navigateurs : mount direct via microtask.
    // setState dans un microtask évite l'erreur "cascading renders"
    // de react-hooks/set-state-in-effect (pas synchrone in-body).
    if (typeof IntersectionObserver === 'undefined') {
      const id = queueMicrotask(() => setIsVisible(true));
      return () => {
        // queueMicrotask n'a pas de cancel — on accepte l'effet trivial
        // (un setState ignoré si déjà unmounted, React l'avale gracieusement).
        void id;
      };
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px 0px' },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {isVisible ? <McSimulator variant={variant} /> : <McSimulatorSkeleton variant={variant} />}
    </div>
  );
}
