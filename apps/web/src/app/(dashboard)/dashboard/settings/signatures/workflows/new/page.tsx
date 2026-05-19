import { redirect } from 'next/navigation';

/**
 * V1.X — Le mode "avancé" n'a pas de différence significative avec le wizard
 * quick pour les besoins métier V1 (3 patterns couvrent 95% des cas).
 *
 * On redirige vers le wizard pour cohérence UX. V2 = formulaire pleine
 * puissance avec multi-step custom, signer USER spécifique, template_codes
 * granular, etc.
 */
export default function NewWorkflowRedirectPage() {
  redirect('/dashboard/settings/signatures/workflows/quick');
}
