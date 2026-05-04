'use client';

/**
 * Module 11 B5 — `RequestValuationRunDialog.tsx`.
 *
 * Modal de déclenchement d'un nouveau valuation_run avec configuration
 * Module 11 (includeVisualization, numPaths, numTimeSteps, seed).
 *
 * UX :
 *   - Bouton primaire "Lancer une simulation" dans le header de la page
 *   - Modal : checkbox "Inclure visualisation" (default ON), num paths
 *     (default 100k), num time steps (default 36), seed optionnel
 *   - Submit → requestValuationRun(input) → toast + redirect vers la page
 *     du run (replay si viz, sinon detail legacy).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestValuationRun } from '@/server/actions/valuations';

export type RequestValuationRunDialogProps = {
  planId: string;
};

export function RequestValuationRunDialog({ planId }: RequestValuationRunDialogProps) {
  const [open, setOpen] = useState(false);
  const [includeViz, setIncludeViz] = useState(true);
  // Module 11 B6 quick fix α — default réduit à 20k (cf dette #94).
  // 100k + viz dépasse le timeout EF Supabase (~150s).
  const [numPaths, setNumPaths] = useState(20000);
  const [numTimeSteps, setNumTimeSteps] = useState(36);
  const [seedStr, setSeedStr] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    const trimmed = seedStr.trim();
    const parsedSeed = trimmed ? Number(trimmed) : undefined;
    if (parsedSeed !== undefined && !Number.isInteger(parsedSeed)) {
      toast.error('Seed doit être un entier');
      return;
    }
    startTransition(async () => {
      const res = await requestValuationRun({
        planId,
        includeVisualization: includeViz,
        numPaths,
        numTimeSteps,
        ...(parsedSeed !== undefined ? { seed: parsedSeed } : {}),
      });
      if (!res.ok) {
        toast.error(`Erreur : ${res.error}`);
        return;
      }
      toast.success('Simulation lancée — chargement du résultat…');
      setOpen(false);
      const target = res.includesVisualization
        ? `/dashboard/valuations/runs/${res.runId}`
        : `/dashboard/plans/${planId}/valuations/${res.runId}`;
      router.push(target);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" data-testid="request-valuation-run-button">
            <PlayCircle className="mr-2 size-4" />
            Lancer une simulation
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle simulation Monte Carlo</DialogTitle>
          <DialogDescription>
            Lance un calcul de juste valeur IFRS 2 sur le moteur Python. La visualisation des
            trajectoires permet l&apos;animation cinématique côté UI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="include-viz"
              checked={includeViz}
              onCheckedChange={(c) => setIncludeViz(c === true)}
              disabled={isPending}
            />
            <div className="space-y-1">
              <Label htmlFor="include-viz" className="cursor-pointer">
                Inclure la visualisation Monte Carlo
              </Label>
              <p className="text-muted-foreground text-xs">
                Stocke les paths + convergence + histogram dans la response. ~50–200 KB de payload
                supplémentaire.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="num-paths">Nombre de paths</Label>
              <Input
                id="num-paths"
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={numPaths}
                onChange={(e) => setNumPaths(Number(e.target.value))}
                disabled={isPending}
                data-testid="input-num-paths"
              />
              <p className="text-muted-foreground text-xs">
                20 000 paths recommandé. Au-delà de 50 000 avec visualisation, le moteur peut
                dépasser le timeout.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="num-steps">Pas de temps</Label>
              <Input
                id="num-steps"
                type="number"
                min={12}
                max={365}
                step={1}
                value={numTimeSteps}
                onChange={(e) => setNumTimeSteps(Number(e.target.value))}
                disabled={isPending}
                data-testid="input-num-steps"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seed">Seed (optionnel)</Label>
            <Input
              id="seed"
              type="text"
              placeholder="Auto si vide"
              value={seedStr}
              onChange={(e) => setSeedStr(e.target.value)}
              disabled={isPending}
              data-testid="input-seed"
            />
            <p className="text-muted-foreground text-xs">
              Permet de reproduire un calcul à l&apos;identique pour audit IFRS 2.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={isPending}>
                Annuler
              </Button>
            }
          />
          <Button onClick={handleSubmit} disabled={isPending} data-testid="submit-valuation-run">
            {isPending ? 'Lancement…' : 'Lancer la simulation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
