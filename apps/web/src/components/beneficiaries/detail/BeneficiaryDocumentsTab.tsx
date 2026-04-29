import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Onglet Documents — placeholder Module 6.
 *
 * En V1 : empty state + récap des types de documents prévus.
 * Module 6 livrera l'upload + signature Yousign + visualisation.
 */
export function BeneficiaryDocumentsTab() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" />
              Documents personnels
            </CardTitle>
            <CardDescription>
              Contrats, KYC, attestations de plan, documents fiscaux. À venir Module 6.
            </CardDescription>
          </div>
          <Button size="sm" disabled title="Disponible Module 6 (Document Engine)">
            Téléverser un document
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-8 text-center text-sm">
          <FileText className="mx-auto mb-3 size-10 opacity-40" />
          <p className="font-medium">Aucun document</p>
          <p className="mt-2 text-xs">
            Le Module 6 (Document Engine) introduira la gestion documentaire :
          </p>
          <ul className="text-muted-foreground/80 mt-2 inline-block space-y-0.5 text-left text-xs">
            <li>• Contrats de travail et avenants</li>
            <li>• KYC (CNI, justificatif domicile)</li>
            <li>• Attestations de plan signées (intégration Yousign)</li>
            <li>• Documents fiscaux (DSN, attestations annuelles)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
