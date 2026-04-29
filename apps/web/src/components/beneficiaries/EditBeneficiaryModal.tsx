'use client';

import { BeneficiaryFormModal } from './BeneficiaryFormModal';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';

type Beneficiary = BeneficiaryDetailRow['beneficiary'];

/**
 * Alias rétrocompatible (Module 4 B5) — délègue à `BeneficiaryFormModal`
 * en mode='edit'. Conservé pour ne pas casser les call-sites du B4
 * (BeneficiaryDetailClient + BeneficiaryProfileTab).
 *
 * Pour de nouveaux call-sites, utiliser directement `BeneficiaryFormModal`
 * avec `mode='create' | 'edit'`.
 */
export function EditBeneficiaryModal({
  open,
  onOpenChange,
  beneficiary,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beneficiary: Beneficiary;
  onSuccess: () => void;
}) {
  return (
    <BeneficiaryFormModal
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      beneficiary={beneficiary}
      onSuccess={onSuccess}
    />
  );
}
