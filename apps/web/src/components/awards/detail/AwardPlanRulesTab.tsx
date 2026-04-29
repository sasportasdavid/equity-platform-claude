import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

export function AwardPlanRulesTab({ detail }: { detail: AwardDetailRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan rules — placeholder</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Snapshot v{detail.award.plan_version ?? 1} du plan {detail.plan?.name ?? '—'} —
        implémentation au commit suivant.
      </CardContent>
    </Card>
  );
}
