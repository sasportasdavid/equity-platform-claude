'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, FileText, FileWarning, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';
import { DocumentStatusBadge } from '@/components/documents/DocumentStatusBadge';
import { SendForSignatureDialog } from '@/components/documents/SendForSignatureDialog';
import { SignatureRequestStatusDialog } from '@/components/documents/SignatureRequestStatusDialog';
import { generateAwardDocument, voidDocument } from '@/server/actions/documents';
import type { AwardDocumentRow, CompanyRepresentativeOption } from '@/server/queries/documents';

type GenerableStatuses =
  | 'APPROVED'
  | 'BOARD_APPROVED'
  | 'PENDING_SIGNATURE'
  | 'GRANTED'
  | 'VESTING';

const STATUSES_ALLOWING_GENERATE: GenerableStatuses[] = [
  'APPROVED',
  'BOARD_APPROVED',
  'PENDING_SIGNATURE',
  'GRANTED',
  'VESTING',
];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Module 6 B4 — Onglet "Documents" sur la page détail award.
 *
 * Liste les `document_instances` pour cet award + leurs `signature_requests`
 * + un agrégat signers. Pour chaque doc, actions contextuelles selon status :
 *   - DRAFT/GENERATED → Aperçu, Envoyer pour signature, Voider
 *   - SENT_FOR_SIGNATURE/PARTIALLY_SIGNED → Voir détail signature, Aperçu
 *   - SIGNED → Aperçu signé, Aperçu certificat preuve
 *   - VOIDED → reason + voided_at
 *
 * Permission UI :
 *   - Générer / Envoyer : canGenerate (alias documents.send_for_signature)
 *   - Voider / Annuler signature : canVoid (documents.void)
 */
export function AwardDocumentsTab({
  awardId,
  awardStatus,
  beneficiary,
  documents,
  companyRepresentatives,
  canGenerate,
  canVoid,
}: {
  awardId: string;
  awardStatus: string;
  beneficiary: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
  };
  documents: AwardDocumentRow[];
  companyRepresentatives: CompanyRepresentativeOption[];
  canGenerate: boolean;
  canVoid: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [previewState, setPreviewState] = useState<{
    documentId: string;
    documentNumber: string | null;
    variant: 'ORIGINAL' | 'SIGNED' | 'PROOF';
  } | null>(null);
  const [sendState, setSendState] = useState<{
    documentId: string;
    documentNumber: string | null;
  } | null>(null);
  const [statusState, setStatusState] = useState<AwardDocumentRow | null>(null);
  const [generating, setGenerating] = useState(false);

  const canGenerateNow =
    canGenerate &&
    STATUSES_ALLOWING_GENERATE.includes(awardStatus as GenerableStatuses) &&
    !documents.some(
      (d) =>
        d.status === 'GENERATED' ||
        d.status === 'SENT_FOR_SIGNATURE' ||
        d.status === 'PARTIALLY_SIGNED' ||
        d.status === 'SIGNED',
    );

  function handleGenerate() {
    setGenerating(true);
    startTransition(async () => {
      const res = await generateAwardDocument({ awardId });
      setGenerating(false);
      if (res.ok) {
        toast.success(`Document généré (${res.documentId.slice(0, 8)}…)`);
        if (res.warnings.length > 0) {
          toast.warning(`${res.warnings.length} warning(s) compliance`);
        }
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleVoid(documentId: string) {
    const reason = window.prompt(
      'Raison du void (min 10 caractères) — ce document sera marqué VOIDED et retiré du flow.',
      '',
    );
    if (!reason || reason.trim().length < 10) {
      if (reason !== null) toast.error('Raison trop courte (min 10 caractères)');
      return;
    }
    startTransition(async () => {
      const res = await voidDocument({ documentId, reason: reason.trim() });
      if (res.ok) {
        toast.success('Document voidé');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Empty state + CTA générer */}
      {documents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Aucun document pour cet award</CardTitle>
            <CardDescription>
              Génère le document d&apos;attribution pour démarrer le workflow signature.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canGenerateNow ? (
              <Button
                onClick={handleGenerate}
                disabled={generating || pending}
                data-testid="generate-document"
              >
                {generating ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 size-4" />
                )}
                Générer le document d&apos;attribution
              </Button>
            ) : (
              <div className="text-muted-foreground flex items-start gap-2 text-sm">
                <FileWarning className="mt-0.5 size-4 shrink-0" />
                <span>
                  {!canGenerate
                    ? 'Permission insuffisante (documents.send_for_signature requise).'
                    : `Award status=${awardStatus} — la génération n'est possible qu'à partir de APPROVED.`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* CTA proéminent si pas de doc actif mais des archivés */}
      {documents.length > 0 && canGenerateNow ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between p-3">
            <p className="text-sm">
              Aucun document actif — régénère le document d&apos;attribution si nécessaire.
            </p>
            <Button size="sm" onClick={handleGenerate} disabled={generating || pending}>
              {generating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Re-générer
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Liste docs */}
      {documents.map((doc) => {
        const sigReq = doc.signature_request;
        const signedCount = sigReq?.signers.filter((s) => s.status === 'SIGNED').length ?? 0;
        const totalSigners = sigReq?.signers.length ?? 0;

        return (
          <Card key={doc.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <span className="font-mono">{doc.document_number ?? '—'}</span>
                    <span data-testid={`document-status-badge-${doc.id}`}>
                      <DocumentStatusBadge status={doc.status} />
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {doc.template_name ?? doc.template_code ?? 'Template inconnu'} · Généré{' '}
                    {formatDateTime(doc.generated_at)}
                    {doc.generated_by_email ? ` par ${doc.generated_by_email}` : ''}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Voided info */}
              {doc.status === 'VOIDED' ? (
                <div className="bg-destructive/5 text-destructive border-destructive/30 rounded-md border p-2 text-xs">
                  Voidé le {formatDateTime(doc.voided_at)}.
                  {doc.voided_reason ? ` Raison : ${doc.voided_reason}` : ''}
                </div>
              ) : null}

              {/* Sig request summary */}
              {sigReq && doc.status !== 'VOIDED' ? (
                <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
                  <span className="font-medium">Signature</span>
                  <span className="text-muted-foreground">
                    {signedCount}/{totalSigners} signataires · status {sigReq.status} · envoyé{' '}
                    {formatDateTime(sigReq.sent_at)}
                  </span>
                </div>
              ) : null}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {doc.storage_path ? (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`preview-document-${doc.id}`}
                    onClick={() =>
                      setPreviewState({
                        documentId: doc.id,
                        documentNumber: doc.document_number,
                        variant: 'ORIGINAL',
                      })
                    }
                  >
                    <Eye className="mr-1.5 size-3.5" /> Aperçu PDF
                  </Button>
                ) : null}

                {doc.status === 'GENERATED' && canGenerate ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setSendState({
                        documentId: doc.id,
                        documentNumber: doc.document_number,
                      })
                    }
                  >
                    <Send className="mr-1.5 size-3.5" /> Envoyer pour signature
                  </Button>
                ) : null}

                {sigReq &&
                (doc.status === 'SENT_FOR_SIGNATURE' || doc.status === 'PARTIALLY_SIGNED') ? (
                  <Button size="sm" variant="outline" onClick={() => setStatusState(doc)}>
                    <Eye className="mr-1.5 size-3.5" /> Statut signature
                  </Button>
                ) : null}

                {doc.status === 'SIGNED' && doc.signed_pdf_storage_path ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPreviewState({
                        documentId: doc.id,
                        documentNumber: doc.document_number,
                        variant: 'SIGNED',
                      })
                    }
                  >
                    <Eye className="mr-1.5 size-3.5" /> PDF signé
                  </Button>
                ) : null}

                {doc.status === 'SIGNED' && doc.proof_certificate_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPreviewState({
                        documentId: doc.id,
                        documentNumber: doc.document_number,
                        variant: 'PROOF',
                      })
                    }
                  >
                    <Eye className="mr-1.5 size-3.5" /> Certificat preuve
                  </Button>
                ) : null}

                {canVoid && doc.status !== 'VOIDED' && doc.status !== 'SIGNED' && !sigReq ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive ml-auto"
                    onClick={() => handleVoid(doc.id)}
                    disabled={pending}
                  >
                    <Trash2 className="mr-1.5 size-3.5" /> Voider
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Modales */}
      {previewState ? (
        <DocumentPreviewDialog
          open={!!previewState}
          onOpenChange={(o) => !o && setPreviewState(null)}
          documentId={previewState.documentId}
          documentNumber={previewState.documentNumber}
          variant={previewState.variant}
        />
      ) : null}

      {sendState ? (
        <SendForSignatureDialog
          open={!!sendState}
          onOpenChange={(o) => !o && setSendState(null)}
          documentId={sendState.documentId}
          documentNumber={sendState.documentNumber}
          beneficiary={beneficiary}
          companyRepresentatives={companyRepresentatives}
        />
      ) : null}

      {statusState && statusState.signature_request ? (
        <SignatureRequestStatusDialog
          open={!!statusState}
          onOpenChange={(o) => !o && setStatusState(null)}
          documentNumber={statusState.document_number}
          request={statusState.signature_request}
          canCancel={canVoid}
        />
      ) : null}
    </div>
  );
}
