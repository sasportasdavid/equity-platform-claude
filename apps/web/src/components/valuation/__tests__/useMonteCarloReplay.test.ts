// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMonteCarloReplay } from '../useMonteCarloReplay';

/**
 * Module 11 B4 — Tests `useMonteCarloReplay`.
 *
 * Pattern : on mock `requestAnimationFrame` + `cancelAnimationFrame` pour
 * avoir un contrôle déterministe sur la timing de l'animation. `performance.now()`
 * est aussi mocké pour avancer le temps frame par frame.
 *
 * Directive `@vitest-environment jsdom` requise (vitest.config par défaut =
 * 'node', donc pas de DOM). jsdom est dispo dans les dépendances
 * (apps/web/package.json).
 */

describe('useMonteCarloReplay', () => {
  let now = 0;
  let frameCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let nextFrameId = 1;

  beforeEach(() => {
    now = 0;
    frameCallbacks = [];
    nextFrameId = 1;

    vi.spyOn(performance, 'now').mockImplementation(() => now);

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.push({ id, cb });
        return id;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        frameCallbacks = frameCallbacks.filter((f) => f.id !== id);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Avance le temps de `deltaMs`, exécute toutes les frames pending au new now. */
  function advance(deltaMs: number) {
    now += deltaMs;
    const pending = frameCallbacks;
    frameCallbacks = [];
    for (const { cb } of pending) cb(now);
  }

  it('starts at progress=0 when enabled=true', () => {
    const { result } = renderHook(() => useMonteCarloReplay({ durationMs: 1000, enabled: true }));
    expect(result.current.progress).toBe(0);
  });

  it('starts at progress=1 when enabled=false (static render)', () => {
    const { result } = renderHook(() => useMonteCarloReplay({ durationMs: 1000, enabled: false }));
    expect(result.current.progress).toBe(1);
  });

  it('reaches progress=1 after durationMs has elapsed', () => {
    const { result } = renderHook(() =>
      useMonteCarloReplay({ durationMs: 1000, easing: 'linear' }),
    );
    act(() => {
      advance(0); // First frame fires immediately at startTime
      advance(500);
      advance(500);
    });
    expect(result.current.progress).toBe(1);
  });

  it('linear easing returns progress=0.5 at half duration', () => {
    const { result } = renderHook(() =>
      useMonteCarloReplay({ durationMs: 1000, easing: 'linear' }),
    );
    act(() => {
      advance(0);
      advance(500);
    });
    expect(result.current.progress).toBeCloseTo(0.5, 5);
  });

  it('easeOutCubic returns progress > 0.5 at half duration (ease-out shape)', () => {
    const { result } = renderHook(() =>
      useMonteCarloReplay({ durationMs: 1000, easing: 'easeOutCubic' }),
    );
    act(() => {
      advance(0);
      advance(500);
    });
    // easeOutCubic(0.5) = 1 - 0.5^3 = 0.875
    expect(result.current.progress).toBeCloseTo(0.875, 3);
  });

  it('calls onProgress at each frame with eased value', () => {
    const onProgress = vi.fn();
    renderHook(() => useMonteCarloReplay({ durationMs: 1000, easing: 'linear', onProgress }));
    act(() => {
      advance(0);
      advance(250);
    });
    expect(onProgress).toHaveBeenCalled();
    const lastCall = onProgress.mock.calls.at(-1);
    expect(lastCall?.[0]).toBeCloseTo(0.25, 3);
  });

  it('calls onComplete exactly once when reaching progress=1', () => {
    const onComplete = vi.fn();
    renderHook(() => useMonteCarloReplay({ durationMs: 500, easing: 'linear', onComplete }));
    act(() => {
      advance(0);
      advance(500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Subsequent frames should not re-trigger onComplete (loop is stopped)
    act(() => advance(100));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('restart() resets progress to 0 and re-runs the animation', () => {
    const { result } = renderHook(() =>
      useMonteCarloReplay({ durationMs: 1000, easing: 'linear' }),
    );
    act(() => {
      advance(0);
      advance(1000);
    });
    expect(result.current.progress).toBe(1);

    act(() => {
      result.current.restart();
    });
    expect(result.current.progress).toBe(0);

    act(() => {
      advance(0);
      advance(500);
    });
    expect(result.current.progress).toBeCloseTo(0.5, 3);
  });

  it('restart() is a no-op when enabled=false', () => {
    const { result } = renderHook(() => useMonteCarloReplay({ durationMs: 1000, enabled: false }));
    expect(result.current.progress).toBe(1);

    act(() => {
      result.current.restart();
    });
    expect(result.current.progress).toBe(1);
  });

  it('cleans up requestAnimationFrame on unmount (no leak)', () => {
    const { unmount } = renderHook(() =>
      useMonteCarloReplay({ durationMs: 5000, easing: 'linear' }),
    );
    act(() => advance(0));
    expect(frameCallbacks.length).toBeGreaterThan(0);

    unmount();

    // After unmount, the cancelAnimationFrame should have removed the pending callback
    expect(frameCallbacks.length).toBe(0);
  });

  it('isAnimating toggles correctly during the lifecycle', () => {
    const { result } = renderHook(() => useMonteCarloReplay({ durationMs: 500, easing: 'linear' }));
    // Pre-frame: useEffect hasn't fired requestAnimationFrame yet, but startAnimation
    // has already set isAnimating=true synchronously
    expect(result.current.isAnimating).toBe(true);
    act(() => {
      advance(0);
      advance(500);
    });
    expect(result.current.isAnimating).toBe(false);
  });
});
