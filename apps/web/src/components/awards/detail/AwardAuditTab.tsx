import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

export function AwardAuditTab({ detail }: { detail: AwardDetailRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit — placeholder</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {detail.auditEvents.length} audit event(s) — implémentation au commit suivant.
      </CardContent>
    </Card>
  );
}
