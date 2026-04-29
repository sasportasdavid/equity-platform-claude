'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, FileText, History, LineChart as LineIcon } from 'lucide-react';
import { AwardSynthesisTab } from '@/components/awards/detail/AwardSynthesisTab';
import { AwardVestingTab } from '@/components/awards/detail/AwardVestingTab';
import { AwardModificationsTab } from '@/components/awards/detail/AwardModificationsTab';
import { AwardPlanRulesTab } from '@/components/awards/detail/AwardPlanRulesTab';
import { AwardAuditTab } from '@/components/awards/detail/AwardAuditTab';
import type { AwardDetailRow } from '@/server/queries/awards';

/**
 * Conteneur client des 5 onglets de la page détail award (Module 3b B4).
 *
 * Onglets : Synthèse (default) / Vesting / Modifications / Plan rules / Audit.
 *
 * Toutes les transitions metier (cancel/forfeit/transition) sont accessibles
 * depuis l'onglet Synthèse via la card Workflow (réutilise AwardRowActions
 * de B3).
 */
export function AwardDetailClient({
  detail,
  canCancel,
  canModify,
  canPropose,
}: {
  detail: AwardDetailRow;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
}) {
  return (
    <Tabs defaultValue="synthesis" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
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
      <TabsContent value="audit">
        <AwardAuditTab detail={detail} />
      </TabsContent>
    </Tabs>
  );
}
