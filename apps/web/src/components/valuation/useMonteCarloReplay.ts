'use client';

/**
 * Module 11 B4 — `useMonteCarloReplay` hook.
 *
 * Encapsule la logique d'animation cinématique du viewer Monte Carlo :
 *   - requestAnimationFrame loop
 *   - Mapping linéaire elapsed → progress [0..1]
 *   - Easing function configurable (default `easeOutCubic`)
 *   - Cleanup automatique au unmount (cancelAnimationFrame)
 *   - `restart()` rejoue l'animation depuis 0
 *   - Callbacks `onProgress` (chaque frame) et `onComplete` (une seule fois)
 *
 * Permet de synchroniser plusieurs animations (paths canvas + KPI count-up)
 * sur la même progression, exposée via la prop `progress`.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.4 + briefing B4.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type EasingName, resolveEasing } from './helpers';

export type UseMonteCarloReplayOptions = {
  /** Durée totale de l'animation en ms. Default 5000. */
  durationMs?: number;
  /** Easing function. Default `easeOutCubic`. */
  easing?: EasingName;
  /**
   * Si `false`, l'animation ne démarre pas et `progress` reste à 1
   * (rendu statique). Default `true`.
   */
  enabled?: boolean;
  /** Callback à chaque frame. Reçoit la progression eased [0..1]. */
  onProgress?: (progress: number) => void;
  /** Callback appelé une seule fois quand `progress` atteint 1. */
  onComplete?: () => void;
};

export type UseMonteCarloReplayReturn = {
  /** Progression actuelle après easing [0..1]. */
  progress: number;
  /** `true` tant que l'animation tourne (false avant start, false après complete). */
  isAnimating: boolean;
  /** Relance l'animation depuis 0. No-op si `enabled=false`. */
  restart: () => void;
};

/**
 * Hook custom pour piloter une animation cinématique.
 *
 * Pattern de cleanup : `frameIdRef` stocke le handle rAF courant. Le useEffect
 * retourne un cleanup qui appelle `cancelAnimationFrame` pour éviter les leaks.
 * Dans des tests Vitest, le hook peut être testé sans mock rAF en utilisant
 * `globalThis.requestAnimationFrame` que jsdom fournit (mais on peut aussi
 * mock manuellement pour avoir un contrôle déterministe — cf. tests).
 */
export function useMonteCarloReplay(
  options: UseMonteCarloReplayOptions = {},
): UseMonteCarloReplayReturn {
  const {
    durationMs = 5000,
    easing = 'easeOutCubic',
    enabled = true,
    onProgress,
    onComplete,
  } = options;

  // Memoïsé pour stabiliser la dep de `startAnimation` (sinon useEffect rerun
  // à chaque render et restart la replay en boucle).
  const easingFn = useMemo(() => resolveEasing(easing), [easing]);

  // `enabled=false` → progress fixé à 1 (rendu statique full).
  const [progress, setProgress] = useState<number>(enabled ? 0 : 1);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  /** Sequence number incrémenté à chaque restart() pour invalider les frames de l'ancienne run. */
  const runIdRef = useRef(0);
  const frameIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);

  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompleteRef.current = onComplete;
  }, [onProgress, onComplete]);

  const startAnimation = useCallback(() => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (durationMs <= 0) {
      setProgress(1);
      onProgressRef.current?.(1);
      onCompleteRef.current?.();
      return;
    }

    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    completedRef.current = false;
    startTimeRef.current = null;
    setProgress(0);
    setIsAnimating(true);

    const tick = (now: number) => {
      // Si une autre run a démarré entre-temps (restart()), on stoppe celle-ci.
      if (myRunId !== runIdRef.current) return;
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const linearT = Math.min(elapsed / durationMs, 1);
      const eased = easingFn(linearT);
      setProgress(eased);
      onProgressRef.current?.(eased);

      if (linearT < 1) {
        frameIdRef.current = requestAnimationFrame(tick);
      } else {
        setIsAnimating(false);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }
    };

    frameIdRef.current = requestAnimationFrame(tick);
  }, [durationMs, easingFn]);

  const restart = useCallback(() => {
    if (!enabled) return;
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    startAnimation();
  }, [enabled, startAnimation]);

  // Mount : démarre l'animation si enabled, sinon rendu statique
  useEffect(() => {
    if (!enabled) {
      setProgress(1);
      setIsAnimating(false);
      return;
    }
    startAnimation();
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
    // startAnimation est stable (useCallback) — déps explicites = enabled
  }, [enabled, startAnimation]);

  return { progress, isAnimating, restart };
}
