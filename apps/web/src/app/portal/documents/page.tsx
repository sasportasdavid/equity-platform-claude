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
    <div className="space-y-8" data-testid="portal-documents-page">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">VOS DOCUMENTS</p>
        <h1 className="text-h1 text-ink-900">
          Documents <span className="serif-italic text-brass-500">contractuels signés</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          {documents.length === 0
            ? 'Aucun document signé pour le moment.'
            : `${documents.length} document${documents.length > 1 ? 's' : ''} signé${documents.length > 1 ? 's' : ''} liés à vos attributions, à votre disposition pour téléchargement.`}
        </p>
      </header>

      <PortalDocumentsTable documents={documents} />
    </div>
  );
}
