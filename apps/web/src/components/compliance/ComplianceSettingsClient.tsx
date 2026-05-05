'use client';

/**
 * Module 12 B4 — Orchestrateur client de la page settings compliance.
 *
 * Layout : header + grid 2 colonnes (anchor side-nav + sections groupées
 * par scope). Chaque section contient des `ComplianceRuleCard`.
 *
 * Le bouton "Réinitialiser tout" est gated sur `canEdit` (perm
 * `compliance_rules.config.write`).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { EffectiveRuleFull, RuleScope } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComplianceRuleCard } from './ComplianceRuleCard';
import { ResetAllConfirmDialog } from './ResetAllConfirmDialog';

export type ComplianceSettingsClientProps = {
  rulesByScope: Record<RuleScope, EffectiveRuleFull[]>;
  totalCount: number;
  canEdit: boolean;
  scopeLabels: Record<RuleScope, string>;
  scopeOrder: RuleScope[];
};

export function ComplianceSettingsClient({
  rulesByScope,
  totalCount,
  canEdit,
  scopeLabels,
  scopeOrder,
}: ComplianceSettingsClientProps) {
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);

  // Filtrer les scopes qui ont au moins 1 rule
  const visibleScopes = scopeOrder.filter((scope) => rulesByScope[scope].length > 0);
  const overriddenCount = visibleScopes.reduce(
    (sum, scope) => sum + rulesByScope[scope].filter((r) => r.is_overridden).length,
    0,
  );

  function handleRefresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6" data-testid="compliance-settings">
      {/* DS V2 B1b — header éditorial avec NarrativeTitle italic + TitleRule */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-overline text-brass-500">PARAMÈTRES · CONFORMITÉ</p>
          <h2 className="text-h1 text-ink-900">
            Conformité — <span className="serif-italic">gardez la main.</span>
          </h2>
          <div className="bg-brass-500 mt-3 h-[2px] w-16" aria-hidden="true" />
          <p className="serif-italic text-ink-500 max-w-2xl text-sm leading-relaxed">
            Personnalisez les seuils de validation de votre organisation. Les valeurs par défaut
            reflètent les bonnes pratiques marché et la conformité légale française.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Badge variant="secondary">{totalCount} règles</Badge>
            {overriddenCount > 0 ? (
              <Badge className="bg-brass-100 text-brass-900 border-brass-300">
                {overriddenCount} personnalisée{overriddenCount > 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge variant="outline">Configuration par défaut</Badge>
            )}
          </div>
        </div>
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            data-testid="reset-all-trigger"
          >
            <RotateCcw className="mr-2 size-3.5" strokeWidth={1.75} />
            Réinitialiser tout
          </Button>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        {/* Side-nav anchor links */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="flex flex-col gap-0.5 text-sm">
            <p className="text-overline text-ink-500 mb-2">Sections</p>
            {visibleScopes.map((scope) => (
              <a
                key={scope}
                href={`#scope-${scope}`}
                className="hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 transition-colors"
              >
                {scopeLabels[scope]}{' '}
                <span className="text-muted-foreground/70 ml-1 text-xs">
                  ({rulesByScope[scope].length})
                </span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          {visibleScopes.map((scope) => {
            const rules = rulesByScope[scope];
            return (
              <section key={scope} id={`scope-${scope}`} className="scroll-mt-4">
                <h3 className="border-paper-300 mb-3 border-b pb-2 text-lg font-semibold">
                  {scopeLabels[scope]}{' '}
                  <span className="text-muted-foreground text-sm font-normal">
                    ({rules.length} règle{rules.length > 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <ComplianceRuleCard
                      key={rule.rule_code}
                      rule={rule}
                      canEdit={canEdit}
                      onUpdate={handleRefresh}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <ResetAllConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
