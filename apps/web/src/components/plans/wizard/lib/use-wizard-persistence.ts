'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { PlanWizardData } from '@equity/shared';

/**
 * Hook d'auto-save / restauration du wizard.
 *
 * Stratégie 2 niveaux :
 *  - **localStorage** (debounce 500 ms) : restauration immédiate après
 *    refresh / fermeture-réouverture d'onglet, sans aller-retour réseau.
 *  - **Server Action `saveDraftPlan`** (debounce 2 s) : sauvegarde
 *    distante pour récupération inter-appareils. La Server Action est
 *    optionnelle (passée en prop) — le hook fonctionne aussi en pur
 *    localStorage le temps que le backend soit branché (cf. Module 3a §3).
 *
 * Au mount, on tente la restauration depuis localStorage en priorité
 * (instantané), puis on fait un fetch DB en arrière-plan via
 * `loadServerDraft` qui écrasera si une version plus récente existe.
 */

const LS_KEY = 'plan-wizard-draft';

export type DraftMeta = {
  /** Timestamp ISO de la dernière sauvegarde locale réussie. */
  savedAt: string | null;
  /** Statut de la dernière sauvegarde Server Action. */
  serverStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** Message d'erreur Server Action (si applicable). */
  serverError: string | null;
};

export type SaveDraftFn = (
  data: PlanWizardData,
) => Promise<{ ok: true; savedAt: string } | { ok: false; error: string }>;

export type LoadServerDraftFn = () => Promise<
  { ok: true; data: Partial<PlanWizardData>; savedAt: string } | { ok: false }
>;

export function useWizardPersistence({
  saveDraft,
  loadServerDraft,
  enabled = true,
}: {
  /** Server Action de sauvegarde distante. Optionnelle pour faciliter
   *  les sandboxes — si absente, seul localStorage est utilisé. */
  saveDraft?: SaveDraftFn;
  /** Server Action de chargement de brouillon distant. */
  loadServerDraft?: LoadServerDraftFn;
  /** Désactive le hook (ex : en mode lecture seule). */
  enabled?: boolean;
} = {}) {
  const { watch, reset, getValues } = useFormContext<PlanWizardData>();
  const [meta, setMeta] = useState<DraftMeta>({
    savedAt: null,
    serverStatus: 'idle',
    serverError: null,
  });
  const [restoredFrom, setRestoredFrom] = useState<'local' | 'server' | null>(null);
  const lsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredOnceRef = useRef(false);

  // --- Restauration au mount ---------------------------------------------
  useEffect(() => {
    if (!enabled || restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    // 1) localStorage (instantané)
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { data: Partial<PlanWizardData>; savedAt: string };
        if (parsed?.data) {
          reset(parsed.data as PlanWizardData);
          setMeta((m) => ({ ...m, savedAt: parsed.savedAt }));
          setRestoredFrom('local');
        }
      }
    } catch {
      // localStorage corrompu — on l'efface silencieusement.
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {
        // ignore
      }
    }
    // 2) Server Action (en arrière-plan, peut écraser si plus récent)
    if (loadServerDraft) {
      loadServerDraft()
        .then((result) => {
          if (!result.ok) return;
          // Comparer les timestamps — on ne ré-écrit que si server > local
          const serverDate = Date.parse(result.savedAt);
          const localDate = meta.savedAt ? Date.parse(meta.savedAt) : 0;
          if (serverDate > localDate) {
            reset(result.data as PlanWizardData);
            setMeta((m) => ({ ...m, savedAt: result.savedAt }));
            setRestoredFrom('server');
          }
        })
        .catch(() => {
          // ignore — on garde la version locale
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Auto-save sur changement -----------------------------------------
  // On watch sans dépendance pour piéger TOUS les changements via
  // une subscription RHF.
  useEffect(() => {
    if (!enabled) return;
    const subscription = watch((values) => {
      // localStorage debounce 500ms
      if (lsTimerRef.current) clearTimeout(lsTimerRef.current);
      lsTimerRef.current = setTimeout(() => {
        try {
          const savedAt = new Date().toISOString();
          const payload = JSON.stringify({ data: values, savedAt });
          window.localStorage.setItem(LS_KEY, payload);
          setMeta((m) => ({ ...m, savedAt }));
        } catch {
          // quota exceeded ou autre — ignore
        }
      }, 500);

      // Server Action debounce 2s
      if (saveDraft) {
        if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
        serverTimerRef.current = setTimeout(async () => {
          setMeta((m) => ({ ...m, serverStatus: 'saving', serverError: null }));
          try {
            const result = await saveDraft(values as PlanWizardData);
            if (result.ok) {
              setMeta((m) => ({ ...m, serverStatus: 'saved', savedAt: result.savedAt }));
            } else {
              setMeta((m) => ({ ...m, serverStatus: 'error', serverError: result.error }));
            }
          } catch (e) {
            setMeta((m) => ({
              ...m,
              serverStatus: 'error',
              serverError: e instanceof Error ? e.message : 'Erreur inconnue',
            }));
          }
        }, 2000);
      }
    });
    return () => {
      subscription.unsubscribe();
      if (lsTimerRef.current) clearTimeout(lsTimerRef.current);
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
    };
  }, [enabled, watch, saveDraft]);

  /** Force une sauvegarde immédiate (sans debounce). */
  const saveNow = useCallback(async () => {
    if (!enabled) return;
    const values = getValues();
    try {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(LS_KEY, JSON.stringify({ data: values, savedAt }));
      setMeta((m) => ({ ...m, savedAt }));
    } catch {
      // ignore
    }
    if (saveDraft) {
      setMeta((m) => ({ ...m, serverStatus: 'saving' }));
      try {
        const result = await saveDraft(values as PlanWizardData);
        if (result.ok) {
          setMeta((m) => ({ ...m, serverStatus: 'saved', savedAt: result.savedAt }));
        } else {
          setMeta((m) => ({ ...m, serverStatus: 'error', serverError: result.error }));
        }
      } catch (e) {
        setMeta((m) => ({
          ...m,
          serverStatus: 'error',
          serverError: e instanceof Error ? e.message : 'Erreur inconnue',
        }));
      }
    }
  }, [enabled, getValues, saveDraft]);

  /** Efface le brouillon local + signale au serveur si supporté. */
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(LS_KEY);
      setMeta({ savedAt: null, serverStatus: 'idle', serverError: null });
      setRestoredFrom(null);
    } catch {
      // ignore
    }
  }, []);

  return { meta, restoredFrom, saveNow, clearDraft };
}
