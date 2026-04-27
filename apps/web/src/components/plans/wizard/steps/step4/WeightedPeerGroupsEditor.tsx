'use client';

import { useFormContext } from 'react-hook-form';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  PLAN_WIZARD_LIMITS,
  type PeerCompany,
  type PeerGroupInput,
  type PerformanceConditionInput,
  type PlanWizardData,
} from '@equity/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * MODULE_03A_PLANS Step 4.7 — éditeur de groupes de peers pondérés.
 *
 * Permet de découper un panel en sous-groupes (ex : "Pharma Europe 60 %",
 * "Pharma US 40 %") chacun avec sa propre liste de peers. La somme des
 * poids des groupes doit valoir 100 % (banner vert/rouge live).
 *
 * Limites :
 *  - max `MAX_PEER_GROUPS = 10` groupes au total
 *  - max `MAX_PEER_GROUP = 30` peers par groupe
 *  - poids 0–100 par groupe, somme = 100 % (tolérance 0.01)
 *  - chaque peer (name + ticker) validé Zod, message FR « Ticker requis »
 *
 * Le mode WEIGHTED est implicitement actif si `weightedPeerGroups.length > 0`.
 * `MarketBranch` propose un toggle qui purge l'autre champ (peerGroup vs
 * weightedPeerGroups) au switch.
 */

let groupCounter = 0;
function blankGroup(): PeerGroupInput {
  let id: string;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    id = crypto.randomUUID();
  } else {
    groupCounter += 1;
    id = `group-fallback-${groupCounter}`;
  }
  return { id, name: '', weight: 0, peers: [blankPeer()] };
}

let weightedPeerCounter = 0;
function blankPeer(): PeerCompany {
  let id: string;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    id = crypto.randomUUID();
  } else {
    weightedPeerCounter += 1;
    id = `wpeer-fallback-${weightedPeerCounter}`;
  }
  return { id, name: '', ticker: '' };
}

export function WeightedPeerGroupsEditor({ index }: { index: number }) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  // Register déclaratif pour shouldUnregister au switch de marketMetricType.
  register(`conditions.${index}.weightedPeerGroups`, { shouldUnregister: true });

  const condition = watch(`conditions.${index}`) as PerformanceConditionInput | undefined;
  const groups = condition?.weightedPeerGroups ?? [];

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, unknown> | undefined> | undefined
  )?.[index];
  const groupsError = conditionErrors?.weightedPeerGroups as
    | { message?: string; [k: number]: GroupError | undefined }
    | undefined;

  const totalWeight = groups.reduce((s, g) => s + (g.weight ?? 0), 0);
  const sumOk = Math.abs(totalWeight - 100) < 0.01;
  const atGroupLimit = groups.length >= PLAN_WIZARD_LIMITS.MAX_PEER_GROUPS;

  function setGroups(next: PeerGroupInput[]) {
    setValue(`conditions.${index}.weightedPeerGroups`, next, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function addGroup() {
    if (atGroupLimit) return;
    setGroups([...groups, blankGroup()]);
  }

  function removeGroup(gIdx: number) {
    setGroups(groups.filter((_, i) => i !== gIdx));
  }

  function updateGroup(gIdx: number, patch: Partial<PeerGroupInput>) {
    setGroups(groups.map((g, i) => (i === gIdx ? { ...g, ...patch } : g)));
  }

  function addPeer(gIdx: number) {
    const group = groups[gIdx];
    if (!group || group.peers.length >= PLAN_WIZARD_LIMITS.MAX_PEER_GROUP) return;
    updateGroup(gIdx, { peers: [...group.peers, blankPeer()] });
  }

  function removePeer(gIdx: number, peerIdx: number) {
    const group = groups[gIdx];
    if (!group) return;
    updateGroup(gIdx, { peers: group.peers.filter((_, i) => i !== peerIdx) });
  }

  function updatePeer(gIdx: number, peerIdx: number, patch: Partial<PeerCompany>) {
    const group = groups[gIdx];
    if (!group) return;
    updateGroup(gIdx, {
      peers: group.peers.map((p, i) => (i === peerIdx ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="space-y-3" data-testid={`weighted-peer-groups-editor-${index}`}>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          Groupes pondérés ({groups.length} / {PLAN_WIZARD_LIMITS.MAX_PEER_GROUPS})
        </Label>
        {groupsError?.message ? (
          <p className="text-destructive text-xs">{String(groupsError.message)}</p>
        ) : null}
      </div>

      {/* Bandeau somme */}
      {groups.length > 0 ? (
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-xs',
            sumOk
              ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200'
              : 'border-destructive/30 bg-destructive/5 text-destructive',
          )}
          data-testid={`weighted-sum-banner-${index}`}
          data-ok={sumOk ? 'true' : 'false'}
        >
          {sumOk ? (
            <>
              ✓ Somme des poids = <strong>100 %</strong> sur {groups.length} groupe(s).
            </>
          ) : (
            <>
              ⚠ Somme des poids = <strong>{totalWeight.toFixed(2)} %</strong> (
              {(totalWeight - 100).toFixed(2)} % d’écart). Le mode WEIGHTED exige exactement 100 %.
            </>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed py-6 text-center text-sm">
          Aucun groupe pour l’instant. Créez vos sous-panels (ex : « Pharma Europe », « Pharma US »)
          pour répartir le calcul du TSR relatif.
        </p>
      )}

      <div className="space-y-3">
        {groups.map((group, gIdx) => (
          <GroupCard
            key={group.id}
            gIdx={gIdx}
            group={group}
            error={groupsError?.[gIdx]}
            onChangeName={(name) => updateGroup(gIdx, { name })}
            onChangeWeight={(weight) => updateGroup(gIdx, { weight })}
            onRemove={() => removeGroup(gIdx)}
            onAddPeer={() => addPeer(gIdx)}
            onRemovePeer={(peerIdx) => removePeer(gIdx, peerIdx)}
            onUpdatePeer={(peerIdx, patch) => updatePeer(gIdx, peerIdx, patch)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGroup}
          disabled={atGroupLimit}
          data-testid={`weighted-add-group-${index}`}
        >
          <Plus className="size-4" /> Ajouter un groupe
        </Button>
        {atGroupLimit ? (
          <p className="text-muted-foreground text-xs">
            Limite atteinte ({PLAN_WIZARD_LIMITS.MAX_PEER_GROUPS} groupes max).
          </p>
        ) : null}
      </div>
    </div>
  );
}

type GroupError = {
  name?: { message?: string };
  weight?: { message?: string };
  peers?: {
    message?: string;
    [k: number]: { name?: { message?: string }; ticker?: { message?: string } };
  };
};

function GroupCard({
  gIdx,
  group,
  error,
  onChangeName,
  onChangeWeight,
  onRemove,
  onAddPeer,
  onRemovePeer,
  onUpdatePeer,
}: {
  gIdx: number;
  group: PeerGroupInput;
  error: GroupError | undefined;
  onChangeName: (name: string) => void;
  onChangeWeight: (weight: number) => void;
  onRemove: () => void;
  onAddPeer: () => void;
  onRemovePeer: (peerIdx: number) => void;
  onUpdatePeer: (peerIdx: number, patch: Partial<PeerCompany>) => void;
}) {
  const [open, setOpen] = useState(true);
  const peerError = error?.peers;
  const atPeerLimit = group.peers.length >= PLAN_WIZARD_LIMITS.MAX_PEER_GROUP;

  return (
    <div className="border-border bg-card rounded-md border" data-testid={`weighted-group-${gIdx}`}>
      <div className="grid items-end gap-3 border-b px-3 py-2 sm:grid-cols-[auto_1fr_120px_auto]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-expanded={open}
          aria-label={`${open ? 'Replier' : 'Déplier'} le groupe ${gIdx + 1}`}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="space-y-1">
          <Label htmlFor={`wpg-${gIdx}-name`} className="text-xs">
            Nom du groupe *
          </Label>
          <Input
            id={`wpg-${gIdx}-name`}
            value={group.name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="Ex : Pharma Europe"
            aria-invalid={!!error?.name?.message}
            className="h-8"
          />
          {error?.name?.message ? (
            <p className="text-destructive text-xs">{String(error.name.message)}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`wpg-${gIdx}-weight`} className="text-xs">
            Poids (%) *
          </Label>
          <Input
            id={`wpg-${gIdx}-weight`}
            type="number"
            min={0}
            max={100}
            step="any"
            value={group.weight ?? 0}
            onChange={(e) => onChangeWeight(Number(e.target.value))}
            aria-invalid={!!error?.weight?.message}
            className="h-8 font-mono"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Supprimer le groupe ${gIdx + 1}`}
        >
          <Trash2 className="text-destructive size-4" />
        </Button>
      </div>

      {open ? (
        <div className="space-y-2 px-3 py-3">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              Peers du groupe ({group.peers.length} / {PLAN_WIZARD_LIMITS.MAX_PEER_GROUP})
            </p>
            {peerError?.message ? (
              <p className="text-destructive text-xs">{String(peerError.message)}</p>
            ) : null}
          </div>
          {group.peers.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed py-4 text-center text-xs">
              Aucun peer dans ce groupe.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="w-10 px-2 py-1.5 text-left font-medium">#</th>
                    <th className="px-2 py-1.5 text-left font-medium">Nom</th>
                    <th className="px-2 py-1.5 text-left font-medium">Ticker</th>
                    <th className="w-10 px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.peers.map((peer, peerIdx) => {
                    const pErr = peerError?.[peerIdx];
                    return (
                      <tr key={peer.id ?? peerIdx} className="border-t">
                        <td className="text-muted-foreground px-2 py-1.5 font-mono text-xs">
                          {peerIdx + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={peer.name}
                            onChange={(e) => onUpdatePeer(peerIdx, { name: e.target.value })}
                            placeholder="Ex : Sanofi"
                            aria-invalid={!!pErr?.name?.message}
                            className="h-7"
                          />
                          {pErr?.name?.message ? (
                            <p className="text-destructive mt-0.5 text-xs">
                              {String(pErr.name.message)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={peer.ticker}
                            onChange={(e) =>
                              onUpdatePeer(peerIdx, { ticker: e.target.value.toUpperCase() })
                            }
                            placeholder="Ex : SAN.PA"
                            aria-invalid={!!pErr?.ticker?.message}
                            className="h-7 font-mono"
                          />
                          {pErr?.ticker?.message ? (
                            <p className="text-destructive mt-0.5 text-xs">
                              {String(pErr.ticker.message)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onRemovePeer(peerIdx)}
                            aria-label={`Supprimer peer ${peerIdx + 1} du groupe ${gIdx + 1}`}
                          >
                            <Trash2 className="text-destructive size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddPeer}
            disabled={atPeerLimit}
          >
            <Plus className="size-3.5" /> Ajouter un peer dans ce groupe
          </Button>
        </div>
      ) : null}
    </div>
  );
}
