import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SupportContactCTA, type SupportContactCTAProps } from './SupportContactCTA';

/**
 * Banner V1.0 — informe l'utilisateur qu'une fonctionnalité est limitée
 * pendant la beta privée et propose un CTA pour contacter David.
 *
 * Pattern Alert + bouton inline. Utilisé en haut de pages où le scope V1.0
 * ne couvre pas tout (compliance config UI, templates additionnels, etc.).
 *
 * Anti-frustration : toujours offrir une porte de sortie (mailto support).
 */

export type BetaLimitationBannerProps = {
  /** Titre court (ex: "Configuration personnalisée disponible sur demande"). */
  title: string;
  /** Description du périmètre limité V1.0 et de ce qui est prévu V1.1. */
  description: ReactNode;
  /** Sujet pré-rempli pour le mailto (`[Capiwise V1.0] <feature>`). */
  ctaFeature: SupportContactCTAProps['feature'];
  /** Contexte additionnel (path, org name) injecté dans le body mailto. */
  ctaContext?: SupportContactCTAProps['context'];
  /** Override label CTA (default "Contacter David"). */
  ctaLabel?: string;
};

export function BetaLimitationBanner({
  title,
  description,
  ctaFeature,
  ctaContext,
  ctaLabel,
}: BetaLimitationBannerProps) {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="space-y-3">
          <div>{description}</div>
          <SupportContactCTA feature={ctaFeature} context={ctaContext} label={ctaLabel} />
        </div>
      </AlertDescription>
    </Alert>
  );
}
