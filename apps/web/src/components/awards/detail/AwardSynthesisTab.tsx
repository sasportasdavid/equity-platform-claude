import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

/**
 * Onglet Synthèse — placeholder, sera implémenté au commit suivant.
 */
export function AwardSynthesisTab({
  detail,
  canCancel: _canCancel,
  canModify: _canModify,
  canPropose: _canPropose,
}: {
  detail: AwardDetailRow;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Synthèse — placeholder</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Award #{detail.award.award_number ?? detail.award.id.slice(0, 8)} — implémentation au commit
        suivant.
      </CardContent>
    </Card>
  );
}
