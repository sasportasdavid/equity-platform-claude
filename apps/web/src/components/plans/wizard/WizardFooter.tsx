'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DraftMeta } from './lib/use-wizard-persistence';

/**
 * Footer du wizard.
 *
 *  - Précédent / Suivant : navigation (Précédent désactivé sur Step 1).
 *  - Step 7 : bouton « Créer le plan » qui appelle `onSubmit`.
 *  - Boutons utility : « Sauvegarder brouillon » (force save_now) et
 *    « Effacer brouillon ».
 *  - Statut compact à gauche : "Sauvegardé · 14:35" / "Sauvegarde…" /
 *    "Erreur : ...".
 */
export function WizardFooter({
  isFirst,
  isLast,
  isValidating,
  isSubmitting,
  canProceed,
  onPrev,
  onNext,
  onSubmit,
  onSaveNow,
  onClearDraft,
  draftMeta,
}: {
  isFirst: boolean;
  isLast: boolean;
  isValidating: boolean;
  isSubmitting: boolean;
  canProceed: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onSaveNow: () => void;
  onClearDraft: () => void;
  draftMeta: DraftMeta;
}) {
  return (
    <footer className="bg-background sticky bottom-0 z-10 mt-8 border-t pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DraftStatus meta={draftMeta} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveNow}
            disabled={isSubmitting}
            data-testid="wizard-save-draft"
          >
            <Save className="size-4" /> Sauvegarder brouillon
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearDraft}
            disabled={isSubmitting}
            data-testid="wizard-clear-draft"
          >
            <Trash2 className="text-destructive size-4" /> Effacer brouillon
          </Button>
          <div className="bg-border mx-1 h-6 w-px" aria-hidden />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={isFirst || isSubmitting}
            data-testid="wizard-prev"
          >
            <ArrowLeft className="size-4" /> Précédent
          </Button>
          {isLast ? (
            <Button
              type="button"
              size="sm"
              onClick={onSubmit}
              disabled={isSubmitting}
              data-testid="wizard-submit"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}{' '}
              Créer le plan
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onNext}
              disabled={!canProceed || isValidating || isSubmitting}
              data-testid="wizard-next"
            >
              {isValidating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}{' '}
              Suivant
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}

function DraftStatus({ meta }: { meta: DraftMeta }) {
  const time = meta.savedAt ? formatTime(meta.savedAt) : null;
  if (meta.serverStatus === 'saving') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Loader2 className="size-3 animate-spin" /> Sauvegarde en cours…
      </span>
    );
  }
  if (meta.serverStatus === 'error') {
    return (
      <span className={cn('text-destructive inline-flex items-center gap-1 text-xs')}>
        ⚠ Échec sauvegarde serveur : {meta.serverError ?? 'inconnu'}
      </span>
    );
  }
  if (time) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <CheckCircle2 className="size-3 text-emerald-600" /> Sauvegardé · {time}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground text-xs italic">
      Brouillon enregistré automatiquement.
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}
