import { Mail } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * CTA "Contacter le support" — bouton mailto avec subject + body pré-remplis.
 *
 * Utilisé sur les pages où une fonctionnalité V1.0 est limitée et où l'on
 * propose à l'utilisateur de contacter David directement par email.
 *
 * Subject pré-rempli : `[Capiwise V1.0] <feature>`
 * Body pré-rempli : template avec contexte (page actuelle si fourni).
 *
 * L'email est configurable via `NEXT_PUBLIC_SUPPORT_EMAIL` (default
 * `david@capiwise.fr`).
 */

export type SupportContactCTAProps = {
  /** Sujet court de la demande, ex: "Configuration compliance custom". */
  feature: string;
  /** Contexte page (path, org_id, etc.) inclus dans le body. */
  context?: string;
  /** Variante du bouton (par défaut secondary). */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  /** Taille du bouton (par défaut sm). */
  size?: 'default' | 'sm' | 'lg';
  /** Override du label du bouton (par défaut "Contacter David"). */
  label?: string;
};

const DEFAULT_EMAIL = 'david@capiwise.fr';

function buildMailto({
  email,
  feature,
  context,
}: {
  email: string;
  feature: string;
  context?: string;
}): string {
  const subject = `[Capiwise V1.0] ${feature}`;
  const bodyLines = [
    'Bonjour David,',
    '',
    `Sur Capiwise je voulais ${feature.toLowerCase()}.`,
    '',
    context ? `Contexte : ${context}` : null,
    '',
    'Merci !',
  ].filter(Boolean);

  const params = new URLSearchParams({
    subject,
    body: bodyLines.join('\n'),
  });

  return `mailto:${email}?${params.toString()}`;
}

export function SupportContactCTA({
  feature,
  context,
  variant = 'secondary',
  size = 'sm',
  label = 'Contacter David',
}: SupportContactCTAProps) {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? DEFAULT_EMAIL;
  const href = buildMailto({ email, feature, context });

  return (
    <a href={href} className={cn(buttonVariants({ variant, size }))}>
      <Mail />
      {label}
    </a>
  );
}

// Exporté pour tests unitaires.
export { buildMailto as _buildMailtoForTests };
