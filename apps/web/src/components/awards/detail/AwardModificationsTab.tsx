import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

export function AwardModificationsTab({
  detail,
  canModify: _canModify,
}: {
  detail: AwardDetailRow;
  canModify: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Modifications — placeholder</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {detail.modifications.length} modification(s) — implémentation au commit suivant.
      </CardContent>
    </Card>
  );
}
