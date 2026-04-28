'use client';

import { useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  PLAN_WIZARD_LIMITS,
  type PeerCompany,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * MODULE_03A_PLANS Step 4.6 — éditeur de panel de peers (mode flat / legacy).
 *
 * Mode "flat" : liste plate de peers avec uniquement `name` + `ticker`. Les
 * options avancées (poids individuel, s0, vol override, corrélation override)
 * arriveront en 4.7 avec le `WeightedPeerGroupsEditor` qui supportera les
 * groupes hiérarchiques (groupes de groupes pondérés).
 *
 * Limites :
 *  - max `PLAN_WIZARD_LIMITS.MAX_PEER_GROUP` peers (= 30)
 *  - chaque peer doit avoir name + ticker non-vides (validé Zod)
 *  - bouton "Ajouter" désactivé à la limite + message inline
 *
 * Pattern : on travaille avec `setValue('conditions.{idx}.peerGroup', ...)`
 * directement (pas de useFieldArray) pour rester cohérent avec le reste du
 * Step 4. Pas de `register` direct sur les sous-champs : les inputs lisent
 * via `watch` et écrivent via `setValue`.
 *
 * Counter module-scope pour les ids fallback (même pattern que
 * NonMarketBranch / sandbox — voir commentaire détaillé dans
 * Step4Performance.tsx).
 */

let peerCounter = 0;
function blankPeer(): PeerCompany {
  let id: string;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    id = crypto.randomUUID();
  } else {
    peerCounter += 1;
    id = `peer-fallback-${peerCounter}`;
  }
  return { id, name: '', ticker: '' };
}

export function PeerGroupEditor({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  // Register déclaratif (sans rendre l'input) pour que RHF suive le champ
  // et l'inclue dans le payload submit. Cleanup au switch de
  // marketMetricType / conditionType géré au parent (cf. cleanConditionForType).
  // shouldUnregister VOLONTAIREMENT évité : il purgerait aussi au unmount
  // step navigation (cf. fix bug step 7 review).
  register(`conditions.${index}.peerGroup`);

  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;
  const peers = condition?.peerGroup ?? [];

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, unknown> | undefined> | undefined
  )?.[index];
  const peerGroupError = conditionErrors?.peerGroup as
    | {
        message?: string;
        [k: number]: { name?: { message?: string }; ticker?: { message?: string } };
      }
    | undefined;

  function addPeer() {
    if (peers.length >= PLAN_WIZARD_LIMITS.MAX_PEER_GROUP) return;
    setValue(`conditions.${index}.peerGroup`, [...peers, blankPeer()], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function removePeer(peerIdx: number) {
    const next = peers.filter((_, i) => i !== peerIdx);
    setValue(`conditions.${index}.peerGroup`, next, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function updatePeer(peerIdx: number, patch: Partial<PeerCompany>) {
    const next = peers.map((p, i) => (i === peerIdx ? { ...p, ...patch } : p));
    setValue(`conditions.${index}.peerGroup`, next, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  const atLimit = peers.length >= PLAN_WIZARD_LIMITS.MAX_PEER_GROUP;

  return (
    <div className="space-y-3" data-testid={`peer-group-editor-${index}`}>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          Panel de peers ({peers.length} / {PLAN_WIZARD_LIMITS.MAX_PEER_GROUP})
        </Label>
        {peerGroupError?.message ? (
          <p className="text-destructive text-xs">{String(peerGroupError.message)}</p>
        ) : null}
      </div>

      {peers.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed py-6 text-center text-sm">
          Aucun peer pour l’instant. Ajoutez les sociétés comparables pour calculer le TSR relatif.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Nom de la société</th>
                <th className="px-3 py-2 text-left font-medium">Ticker</th>
                <th className="w-12 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer, peerIdx) => {
                const peerErr = peerGroupError?.[peerIdx];
                return (
                  <tr key={peer.id ?? peerIdx} className="border-t">
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {peerIdx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={peer.name}
                        onChange={(e) => updatePeer(peerIdx, { name: e.target.value })}
                        placeholder="Ex : Sanofi"
                        aria-invalid={!!peerErr?.name?.message}
                        aria-label={`Nom du peer ${peerIdx + 1}`}
                        className="h-8"
                      />
                      {peerErr?.name?.message ? (
                        <p className="text-destructive mt-1 text-xs">
                          {String(peerErr.name.message)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={peer.ticker}
                        onChange={(e) =>
                          updatePeer(peerIdx, { ticker: e.target.value.toUpperCase() })
                        }
                        placeholder="Ex : SAN.PA"
                        aria-invalid={!!peerErr?.ticker?.message}
                        aria-label={`Ticker du peer ${peerIdx + 1}`}
                        className="h-8 font-mono"
                      />
                      {peerErr?.ticker?.message ? (
                        <p className="text-destructive mt-1 text-xs">
                          {String(peerErr.ticker.message)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removePeer(peerIdx)}
                        aria-label={`Supprimer le peer ${peerIdx + 1}`}
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPeer}
          disabled={atLimit}
          data-testid={`peer-group-add-${index}`}
        >
          <Plus className="size-4" /> Ajouter un peer
        </Button>
        {atLimit ? (
          <p className="text-muted-foreground text-xs">
            Limite atteinte ({PLAN_WIZARD_LIMITS.MAX_PEER_GROUP} peers max).
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Mode flat (legacy). Les options avancées (pondération, vol/corr override) arrivent avec
            le mode WEIGHTED au commit 4.7.
          </p>
        )}
      </div>
    </div>
  );
}
