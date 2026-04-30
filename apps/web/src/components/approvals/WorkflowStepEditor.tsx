'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApproverSelectField } from './ApproverSelectField';
import type { UserForApprover } from '@/server/queries/approvals';

/**
 * Module 5 B3 — Composant 1 step du workflow.
 *
 * Édition compacte d'1 étape : nom, type d'approbateur (radio cards),
 * sélecteur USER ou ROLE, requiredApprovals si ANY_OF_ROLE.
 */

export type StepData = {
  stepOrder: number;
  stepName: string;
  approverType: 'USER' | 'ROLE' | 'ANY_OF_ROLE' | 'ALL_OF_ROLE';
  approverRole?: string;
  approverUserId?: string;
  mode: 'SEQUENTIAL' | 'PARALLEL';
  requiredApprovals: number;
};

const APPROVER_TYPE_OPTIONS: Array<{
  value: StepData['approverType'];
  label: string;
  description: string;
}> = [
  { value: 'USER', label: 'USER', description: 'Un utilisateur spécifique' },
  { value: 'ROLE', label: 'ROLE', description: 'Au moins 1 user de ce rôle' },
  {
    value: 'ANY_OF_ROLE',
    label: 'ANY_OF_ROLE',
    description: 'N approbations parmi les users du rôle',
  },
  { value: 'ALL_OF_ROLE', label: 'ALL_OF_ROLE', description: 'Tous les users du rôle' },
];

export function WorkflowStepEditor({
  step,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  availableUsers,
  availableRoles,
}: {
  step: StepData;
  onChange: (next: StepData) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  availableUsers: UserForApprover[];
  availableRoles: string[];
}) {
  function update<K extends keyof StepData>(key: K, value: StepData[K]) {
    onChange({ ...step, [key]: value });
  }

  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
            Étape {step.stepOrder}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Monter"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Descendre"
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Supprimer"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`step-${step.stepOrder}-name`} className="text-xs">
          Nom de l&apos;étape *
        </Label>
        <Input
          id={`step-${step.stepOrder}-name`}
          value={step.stepName}
          onChange={(e) => update('stepName', e.target.value)}
          placeholder="ex: Validation CFO"
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Type d&apos;approbateur *</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {APPROVER_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('approverType', opt.value)}
              className={`rounded-md border p-2 text-left text-xs transition-colors ${
                step.approverType === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="font-mono font-semibold">{opt.label}</div>
              <div className="text-muted-foreground mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <ApproverSelectField
        type={step.approverType}
        userId={step.approverUserId}
        role={step.approverRole}
        onUserChange={(userId) => update('approverUserId', userId)}
        onRoleChange={(role) => update('approverRole', role)}
        availableUsers={availableUsers}
        availableRoles={availableRoles}
      />

      {step.approverType === 'ANY_OF_ROLE' ? (
        <div className="space-y-1.5">
          <Label htmlFor={`step-${step.stepOrder}-required`} className="text-xs">
            Approbations requises
          </Label>
          <Input
            id={`step-${step.stepOrder}-required`}
            type="number"
            min={1}
            max={20}
            value={step.requiredApprovals}
            onChange={(e) => update('requiredApprovals', Math.max(1, Number(e.target.value) || 1))}
            className="max-w-[120px]"
          />
          <p className="text-muted-foreground text-xs">
            Nombre de décisions APPROVED requises pour valider l&apos;étape (les autres restent
            SKIPPED).
          </p>
        </div>
      ) : null}
    </div>
  );
}
