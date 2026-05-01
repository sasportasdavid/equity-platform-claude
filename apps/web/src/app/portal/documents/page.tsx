import { PortalDocumentsTable } from '../components/PortalDocumentsTable';
import { getBeneficiaryDocuments } from '@/server/queries/portal';

/**
 * Module 8 B5 — Page liste globale des documents portail (§4.4).
 *
 * Server Component qui charge tous les `document_instances` SIGNED des
 * awards du bénéficiaire courant.
 *
 * Layout `/portal/*` (Module 8 B2) gère déjà l'auth + le redirect
 * onboarding si nécessaire.
 */
export default async function PortalDocumentsPage() {
  const documents = await getBeneficiaryDocuments();

  return (
    <div className="space-y-6" data-testid="portal-documents-page">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mes documents</h1>
        <p className="text-muted-foreground text-sm">
          Tous les documents que vous avez signés liés à vos attributions.
        </p>
      </div>

      <PortalDocumentsTable documents={documents} />
    </div>
  );
}
