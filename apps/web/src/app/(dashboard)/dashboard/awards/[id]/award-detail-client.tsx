'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  Clock,
  FileSignature,
  FileText,
  History,
  LineChart as LineIcon,
} from 'lucide-react';
import { AwardSynthesisTab } from '@/components/awards/detail/AwardSynthesisTab';
import { AwardVestingTab } from '@/components/awards/detail/AwardVestingTab';
import { AwardModificationsTab } from '@/components/awards/detail/AwardModificationsTab';
import { AwardPlanRulesTab } from '@/components/awards/detail/AwardPlanRulesTab';
import { AwardAuditTab } from '@/components/awards/detail/AwardAuditTab';
import { AwardDocumentsTab } from '@/components/awards/detail/AwardDocumentsTab';
import type { AwardDetailRow } from '@/server/queries/awards';
import type { AwardDocumentRow, CompanyRepresentativeOption } from '@/server/queries/documents';

/**
 * Conteneur client des 6 onglets de la page détail award.
 *
 * Onglets : Synthèse / Vesting / Modifications / Plan rules / Documents (B4) / Audit.
 *
 * Toutes les transitions metier (cancel/forfeit/transition) sont accessibles
 * depuis l'onglet Synthèse via la card Workflow (réutilise AwardRowActions
 * de B3). L'onglet Documents pilote la génération PDF + envoi Yousign +
 * statut signature.
 */
export function AwardDetailClient({
  detail,
  canCancel,
  canModify,
  canPropose,
  canGenerateDoc,
  canVoidDoc,
  documents,
  companyRepresentatives,
  beneficiary,
}: {
  detail: AwardDetailRow;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
  canGenerateDoc: boolean;
  canVoidDoc: boolean;
  documents: AwardDocumentRow[];
  companyRepresentatives: CompanyRepresentativeOption[];
  beneficiary: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
  };
}) {
  return (
    <Tabs defaultValue="synthesis" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
        <TabsTrigger value="synthesis" data-testid="tab-synthesis">
          <Clock className="mr-1.5 size-3.5" /> Synthèse
        </TabsTrigger>
        <TabsTrigger value="vesting" data-testid="tab-vesting">
          <LineIcon className="mr-1.5 size-3.5" /> Vesting
        </TabsTrigger>
        <TabsTrigger value="modifications" data-testid="tab-modifications">
          <FileText className="mr-1.5 size-3.5" /> Modifications
        </TabsTrigger>
        <TabsTrigger value="plan-rules" data-testid="tab-plan-rules">
          <Calendar className="mr-1.5 size-3.5" /> Plan rules
        </TabsTrigger>
        <TabsTrigger value="documents" data-testid="tab-documents">
          <FileSignature className="mr-1.5 size-3.5" /> Documents
          {documents.length > 0 ? (
            <span className="bg-muted text-muted-foreground ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
              {documents.length}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="audit" data-testid="tab-audit">
          <History className="mr-1.5 size-3.5" /> Audit
        </TabsTrigger>
      </TabsList>

      <TabsContent value="synthesis">
        <AwardSynthesisTab
          detail={detail}
          canCancel={canCancel}
          canModify={canModify}
          canPropose={canPropose}
        />
      </TabsContent>
      <TabsContent value="vesting">
        <AwardVestingTab detail={detail} canModify={canModify} />
      </TabsContent>
      <TabsContent value="modifications">
        <AwardModificationsTab detail={detail} canModify={canModify} />
      </TabsContent>
      <TabsContent value="plan-rules">
        <AwardPlanRulesTab detail={detail} />
      </TabsContent>
      <TabsContent value="documents">
        <AwardDocumentsTab
          awardId={detail.award.id}
          awardStatus={detail.award.status}
          beneficiary={beneficiary}
          documents={documents}
          companyRepresentatives={companyRepresentatives}
          canGenerate={canGenerateDoc}
          canVoid={canVoidDoc}
        />
      </TabsContent>
      <TabsContent value="audit">
        <AwardAuditTab detail={detail} />
      </TabsContent>
    </Tabs>
  );
}
