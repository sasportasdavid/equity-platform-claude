'use client';

import { useFormContext } from 'react-hook-form';
import {
  Banknote,
  Building2,
  CircleDollarSign,
  Clock,
  Gift,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { PlanWizardData, PlanWizardType } from '@equity/shared';
import { PlanTypeCard } from '../shared/plan-type-card';

/**
 * Step 1 — Type de plan (Module 3a §2.5).
 *
 * 9 cartes cliquables couvrant tous les `PlanTypeEnum` du schéma Zod.
 * Sélection unique stockée dans le form parent via `setValue('planType')`.
 *
 * Le wizard parent contrôle `methods.trigger(['planType'])` pour valider
 * l'étape avant de passer à la suivante (cf. `useWizardNavigation`).
 */

type Card = {
  type: PlanWizardType;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
};

const PLAN_CARDS: readonly Card[] = [
  {
    type: 'BSPCE',
    title: 'BSPCE',
    description:
      'Bons de souscription de parts de créateur d’entreprise. Régime fiscal favorable réservé aux startups françaises.',
    icon: <Sparkles className="size-5" />,
    badge: 'FR',
  },
  {
    type: 'AGA',
    title: 'AGA',
    description:
      'Attribution gratuite d’actions. Régime français : période d’acquisition + conservation, plafond 10 % du capital.',
    icon: <Gift className="size-5" />,
    badge: 'FR',
  },
  {
    type: 'STOCK_OPTION',
    title: 'Stock Options',
    description:
      'Option sur actions standard, avec prix d’exercice fixé à l’attribution. Marché international.',
    icon: <CircleDollarSign className="size-5" />,
  },
  {
    type: 'BSA',
    title: 'BSA',
    description:
      'Bons de souscription d’actions, instruments dédiés (consultants, advisors, investisseurs).',
    icon: <Star className="size-5" />,
  },
  {
    type: 'PERFORMANCE_SHARE',
    title: 'Actions de performance',
    description:
      'Actions soumises à conditions de performance (TSR, financières, ESG). Fréquent en grandes entreprises.',
    icon: <TrendingUp className="size-5" />,
  },
  {
    type: 'RSU',
    title: 'RSU',
    description:
      'Restricted Stock Units. Promesse d’actions livrées au vesting, équivalent international des AGA.',
    icon: <Users className="size-5" />,
  },
  {
    type: 'PHANTOM',
    title: 'Phantom Stock',
    description:
      'Plan en cash-equivalent : pas d’émission d’actions, paiement en cash basé sur la valeur de l’action.',
    icon: <Banknote className="size-5" />,
    badge: 'CASH',
  },
  {
    type: 'ESOP',
    title: 'ESOP',
    description:
      'Employee Stock Ownership Plan. Programme global d’actionnariat collectif salarié (US).',
    icon: <Building2 className="size-5" />,
  },
  {
    type: 'SAR',
    title: 'SAR',
    description:
      'Stock Appreciation Rights. Droit à la plus-value entre attribution et exercice, payé en cash ou actions.',
    icon: <Clock className="size-5" />,
    badge: 'CASH',
  },
];

export function Step1PlanType() {
  const { watch, setValue } = useFormContext<PlanWizardData>();
  const selected = watch('planType');

  return (
    <section className="space-y-4" data-testid="step-1-plan-type">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          Choisissez le type d’instrument à attribuer. Ce choix conditionne les règles de
          conformité, le calcul IFRS 2 et les options présentées dans les étapes suivantes.
        </p>
      </div>

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="radiogroup"
        aria-label="Type de plan"
      >
        {PLAN_CARDS.map((card) => (
          <PlanTypeCard
            key={card.type}
            title={card.title}
            description={card.description}
            icon={card.icon}
            badge={card.badge}
            selected={selected === card.type}
            onSelect={() =>
              setValue('planType', card.type, { shouldValidate: true, shouldDirty: true })
            }
            testId={`plan-type-${card.type.toLowerCase()}`}
          />
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Vous pourrez changer de type ultérieurement uniquement tant que le plan n’est pas verrouillé
        (aucune attribution émise).
      </p>
    </section>
  );
}
