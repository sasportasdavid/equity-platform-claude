'use client';

import { BeneficiaryFormModal } from './BeneficiaryFormModal';

/**
 * Alias mode='create' du `BeneficiaryFormModal` — Module 4 B5.
 *
 * Boutons : "Créer" et "Créer et inviter". Email éditable.
 */
export function CreateBeneficiaryModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <BeneficiaryFormModal
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}
