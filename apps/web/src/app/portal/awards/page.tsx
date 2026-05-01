/**
 * Module 8 — Page liste awards (placeholder B3).
 *
 * Cette route est la "home" du portail bénéficiaire (atterrissage post-
 * onboarding et post-login). Le contenu réel (cards summary + lien vers
 * détail award) est livré en B3.
 *
 * V1 placeholder : message d'accueil simple. Ne pas appeler le RPC ici tant
 * que B3 n'a pas livré les composants AwardSummaryCard / VestingChart.
 */
export default function PortalAwardsPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mes attributions</h1>
        <p className="text-muted-foreground text-sm">
          Vos plans d&apos;actionnariat salarié et leur état d&apos;avancement.
        </p>
      </div>

      <div className="border-border/40 bg-muted/20 rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          La liste détaillée de vos attributions arrive prochainement (B3).
        </p>
      </div>
    </div>
  );
}
