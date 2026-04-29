'use client';

import Link from 'next/link';
import { Banknote, Briefcase, Edit3, Home, Shield, User as UserIcon, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BeneficiaryStatusBadge } from '@/components/shared/beneficiary-status-badge';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';

const CONTRACT_LABELS: Record<string, string> = {
  CDI: 'CDI',
  CDD: 'CDD (Contrat à durée déterminée)',
  STAGE: 'Stage',
  ALTERNANCE: 'Alternance',
  CONSULTANT: 'Consultant',
  MANDATAIRE_SOCIAL: 'Mandataire social',
  AUTRE: 'Autre',
};

const GENDER_LABELS: Record<string, string> = {
  M: 'Masculin',
  F: 'Féminin',
  X: 'Non spécifié',
};

/**
 * Onglet Profil — Module 4 B4.
 *
 * Layout 2 colonnes (1 col mobile) avec 5 cartes :
 *   Gauche  : Identité, Adresse, Banque
 *   Droite  : Statut, Contrat, Fiscalité, Compte
 */
export function BeneficiaryProfileTab({
  detail,
  canUpdate,
  onEdit,
}: {
  detail: BeneficiaryDetailRow;
  canUpdate: boolean;
  onEdit: () => void;
}) {
  const b = detail.beneficiary;
  const hasAddress =
    b.address_line_1 || b.address_line_2 || b.postal_code || b.city || b.country !== 'FR';
  const hasBank = b.iban_masked || b.bic || b.bank_name || b.bank_account_holder_name;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Colonne gauche */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserIcon className="size-4" />
                  Identité
                </CardTitle>
              </div>
              {canUpdate ? (
                <Button size="sm" variant="ghost" onClick={onEdit} data-testid="profile-edit">
                  <Edit3 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Prénom / Nom</dt>
              <dd className="font-medium">
                {b.first_name} {b.last_name}
              </dd>
              {b.preferred_name ? (
                <>
                  <dt className="text-muted-foreground">Préféré</dt>
                  <dd>{b.preferred_name}</dd>
                </>
              ) : null}
              {b.gender ? (
                <>
                  <dt className="text-muted-foreground">Genre</dt>
                  <dd>{GENDER_LABELS[b.gender] ?? b.gender}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono text-xs">{b.email}</dd>
              {b.phone_encrypted ? (
                <>
                  <dt className="text-muted-foreground">Téléphone</dt>
                  <dd className="font-mono text-xs">
                    <span className="text-muted-foreground/60">[chiffré]</span>
                  </dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="size-4" />
              Adresse
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasAddress ? (
              <address className="space-y-0.5 text-sm not-italic">
                {b.address_line_1 ? <p>{b.address_line_1}</p> : null}
                {b.address_line_2 ? <p>{b.address_line_2}</p> : null}
                <p>
                  {b.postal_code ?? ''} {b.city ?? ''}
                </p>
                <p className="text-muted-foreground text-xs">{b.country ?? 'FR'}</p>
              </address>
            ) : (
              <p className="text-muted-foreground text-sm italic">Adresse non renseignée</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="size-4" />
              Banque
            </CardTitle>
            <CardDescription className="text-[11px]">
              Données stockées en clair en V1 (Vault prévu en V2 — Module 9 ou 11).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasBank ? (
              <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
                {b.iban_masked ? (
                  <>
                    <dt className="text-muted-foreground">IBAN</dt>
                    <dd className="font-mono text-xs">{b.iban_masked}</dd>
                  </>
                ) : null}
                {b.bic ? (
                  <>
                    <dt className="text-muted-foreground">BIC</dt>
                    <dd className="font-mono text-xs">{b.bic}</dd>
                  </>
                ) : null}
                {b.bank_name ? (
                  <>
                    <dt className="text-muted-foreground">Banque</dt>
                    <dd>{b.bank_name}</dd>
                  </>
                ) : null}
                {b.bank_account_holder_name ? (
                  <>
                    <dt className="text-muted-foreground">Titulaire</dt>
                    <dd>{b.bank_account_holder_name}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                Coordonnées bancaires non renseignées (requises pour exercice cash-settled — Module
                9).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Colonne droite */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4" />
              Statut & dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Statut</dt>
              <dd>
                <BeneficiaryStatusBadge status={b.status} />
              </dd>
              <dt className="text-muted-foreground">Date d&apos;embauche</dt>
              <dd className="font-mono text-xs">{formatDate(b.hire_date)}</dd>
              {b.lifecycle_changed_at ? (
                <>
                  <dt className="text-muted-foreground">Dernière transition</dt>
                  <dd className="font-mono text-xs">{formatDate(b.lifecycle_changed_at)}</dd>
                </>
              ) : null}
              {b.termination_date ? (
                <>
                  <dt className="text-muted-foreground">Date de sortie</dt>
                  <dd className="font-mono text-xs">{formatDate(b.termination_date)}</dd>
                </>
              ) : null}
              {b.lifecycle_change_reason ? (
                <>
                  <dt className="text-muted-foreground">Dernière raison</dt>
                  <dd className="text-muted-foreground italic">{b.lifecycle_change_reason}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="size-4" />
              Contrat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                {b.contract_type ? (CONTRACT_LABELS[b.contract_type] ?? b.contract_type) : '—'}
              </dd>
              <dt className="text-muted-foreground">Poste</dt>
              <dd>{b.job_title ?? '—'}</dd>
              <dt className="text-muted-foreground">Département</dt>
              <dd>{b.department ?? '—'}</dd>
              <dt className="text-muted-foreground">Manager</dt>
              <dd>
                {detail.manager ? (
                  <Link
                    href={`/dashboard/beneficiaries/${detail.manager.id}`}
                    className="text-primary hover:underline"
                  >
                    {detail.manager.first_name} {detail.manager.last_name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground italic">Pas de manager défini</span>
                )}
              </dd>
            </dl>

            {detail.directReports.length > 0 ? (
              <details className="mt-3 border-t pt-2">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                  <Users className="mr-1 inline size-3" />
                  {detail.directReports.length} subordonné
                  {detail.directReports.length > 1 ? 's' : ''}
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {detail.directReports.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/dashboard/beneficiaries/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.first_name} {r.last_name}
                      </Link>
                      <span className="text-muted-foreground ml-1">— {r.email}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4" />
              Fiscalité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Résidence fiscale</dt>
              <dd className="font-mono">{b.tax_residence_country}</dd>
              <dt className="text-muted-foreground">Résident France</dt>
              <dd>
                {b.is_tax_resident_france ? (
                  <span className="text-emerald-600">✓ Oui</span>
                ) : (
                  <span className="text-muted-foreground">✗ Non</span>
                )}
              </dd>
              <dt className="text-muted-foreground">N° fiscal</dt>
              <dd className="font-mono text-xs">
                {b.tax_id ? `**** **** **${b.tax_id.slice(-2)}` : '—'}
              </dd>
            </dl>
            {b.is_tax_resident_france && b.tax_residence_country !== 'FR' ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
                ⚠ Résident fiscal France avec adresse hors France ({b.tax_residence_country}).
                Configuration spéciale ?
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserIcon className="size-4" />
              Compte utilisateur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono text-xs">{b.email}</dd>
              <dt className="text-muted-foreground">Compte créé</dt>
              <dd>
                {b.user_id ? (
                  <span className="text-xs text-emerald-600">✓ Oui</span>
                ) : (
                  <span className="text-muted-foreground text-xs italic">Pas encore connecté</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Invité</dt>
              <dd>
                {b.invited_at ? (
                  <span className="text-xs">
                    {formatDate(b.invited_at)} ({b.invitation_count ?? 1}×)
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs italic">Jamais invité</span>
                )}
              </dd>
              {b.first_login_at ? (
                <>
                  <dt className="text-muted-foreground">1er login</dt>
                  <dd className="font-mono text-xs">{formatDate(b.first_login_at)}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
