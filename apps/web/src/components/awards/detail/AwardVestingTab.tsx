import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

export function AwardVestingTab({
  detail,
  canModify: _canModify,
}: {
  detail: AwardDetailRow;
  canModify: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vesting — placeholder</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {detail.vestingEvents.length} vesting event(s) — implémentation au commit suivant.
      </CardContent>
    </Card>
  );
}
