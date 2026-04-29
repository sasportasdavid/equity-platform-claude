'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  AWARD_MODIFICATION_TYPES,
  bulkAwardImportSchema,
  cancelAwardSchema,
  createAwardSchema,
  createModificationSchema,
  forfeitAwardSchema,
  transitionAwardSchema,
  updateAwardDraftSchema,
  uuidSchema,
  type AwardStatus,
  type BulkAwardImportInput,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import {
  canTransition,
  isCancellable,
  timestampFieldForStatus,
} from '@/lib/stateMachines/awardStateMachine';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 3b — Server Actions pour le lifecycle des awards.
 *
 * 8 actions (cf. spec §5.1) :
 *   - createAwardDraft / updateAwardDraft / loadAward
 *   - transitionAward (pivot state machine)
 *   - cancelAward (wrapper transitionAward → CANCELLED)
 *   - forfeitAward (wrapper transitionAward → FORFEITED + metadata leaver)
 *   - bulkCreateAwards (CSV import via RPC bulk_create_awards)
 *   - createAwardModification (IFRS 2.27-28 modifications post-grant)
 *
 * Pattern de retour uniforme :
 *   { ok: true, ... } | { ok: false, error: string, validationIssues?: number }
 *
 * Toutes les actions :
 *   1. Zod parse → return validation error si KO
 *   2. requirePermission appropriée
 *   3. SELECT FOR UPDATE row-lock pour transitionAward (anti-race)
 *   4. Audit (best-effort, non-bloquant)
 *   5. revalidatePath des routes impactées
 */

// ---------------------------------------------------------------------------
// Types de retour communs
// ---------------------------------------------------------------------------

export type ActionOk<T> = { ok: true } & T;
export type ActionError = { ok: false; error: string; validationIssues?: number };
/** Réponse void — pas de payload data. */
export type ActionVoid = { ok: true } | ActionError;

function validationError<T>(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ---------------------------------------------------------------------------
// 1. createAwardDraft — appelle RPC create_award_full
// ---------------------------------------------------------------------------

export type CreateAwardOk = ActionOk<{ id: string; awardNumber: string }>;
export type CreateAwardResult = CreateAwardOk | ActionError;

export async function createAwardDraft(input: unknown): Promise<CreateAwardResult> {
  const parsed = createAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data;
  const user = await requirePermission('awards.propose');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_award_full', {
    p_data: {
      planId: data.planId,
      beneficiaryId: data.beneficiaryId,
      unitsGranted: data.unitsGranted,
      exercisePrice: data.exercisePrice ?? '',
      grantDate: data.grantDate,
      vestingStartDate: data.vestingStartDate ?? '',
      expiryDate: data.expiryDate ?? '',
      acceptanceDeadline: data.acceptanceDeadline ?? '',
      initialStatus: data.initialStatus,
    } as never,
  });

  if (rpcError) return { ok: false, error: rpcError.message };
  const newId = rpcResult as unknown as string | null;
  if (!newId) return { ok: false, error: 'RPC create_award_full sans id retour' };

  // Récupérer l'award_number pour le retour API (le RPC ne le renvoie pas)
  const { data: row } = await supabase
    .from('awards')
    .select('award_number')
    .eq('id', newId)
    .maybeSingle();

  revalidatePath('/dashboard/awards');
  revalidatePath(`/dashboard/plans/${data.planId}`);

  return { ok: true, id: newId, awardNumber: row?.award_number ?? '' };
}

// ---------------------------------------------------------------------------
// 2. updateAwardDraft — UPDATE direct, refuse si status != DRAFT
// ---------------------------------------------------------------------------

export async function updateAwardDraft(
  awardId: string,
  patch: unknown,
): Promise<ActionVoid | ActionError> {
  const idCheck = uuidSchema.safeParse(awardId);
  if (!idCheck.success) return { ok: false, error: 'award_id invalide' };
  const patchCheck = updateAwardDraftSchema.safeParse(patch);
  if (!patchCheck.success) return validationError(patchCheck.error);

  const user = await requirePermission('awards.propose');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('awards')
    .select('id, status, plan_id')
    .eq('id', idCheck.data)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Award introuvable' };
  if (existing.status !== 'DRAFT') {
    return {
      ok: false,
      error: `Award en status ${existing.status} — édition possible uniquement en DRAFT`,
    };
  }

  // Mapping camelCase → snake_case
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const p = patchCheck.data;
  if (p.beneficiaryId !== undefined) updateData.beneficiary_id = p.beneficiaryId;
  if (p.unitsGranted !== undefined) updateData.units_granted = p.unitsGranted;
  if (p.exercisePrice !== undefined) updateData.exercise_price = p.exercisePrice;
  if (p.grantDate !== undefined) updateData.grant_date = p.grantDate;
  if (p.vestingStartDate !== undefined) updateData.vesting_start_date = p.vestingStartDate;
  if (p.expiryDate !== undefined) updateData.expiry_date = p.expiryDate;
  if (p.acceptanceDeadline !== undefined) updateData.acceptance_deadline = p.acceptanceDeadline;

  const { error } = await supabase
    .from('awards')
    .update(updateData as never)
    .eq('id', idCheck.data);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'award.updated',
    resourceType: 'AWARD',
    resourceId: idCheck.data,
    metadata: p as Record<string, unknown>,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/awards');
  revalidatePath(`/dashboard/plans/${existing.plan_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. loadAward — SELECT joint awards + plan + beneficiary + counts
// ---------------------------------------------------------------------------

export type AwardDetail = {
  id: string;
  awardNumber: string | null;
  status: string;
  unitsGranted: number;
  unitsVested: number | null;
  exercisePrice: number | null;
  grantDate: string;
  vestingStartDate: string | null;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string | null;
  plan: { id: string; name: string; planType: string } | null;
  beneficiary: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  vestingEventsCount: number;
  modificationsCount: number;
};

export async function loadAward(
  awardId: string,
): Promise<ActionOk<{ award: AwardDetail }> | ActionError> {
  const idCheck = uuidSchema.safeParse(awardId);
  if (!idCheck.success) return { ok: false, error: 'award_id invalide' };

  const can = await hasPermission('awards.read.all');
  if (!can) return { ok: false, error: 'Permission awards.read.all requise' };

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('awards')
    .select(
      `id, award_number, status, units_granted, units_vested, exercise_price, grant_date,
       vesting_start_date, expiry_date, created_at, updated_at,
       plan:plans!awards_plan_id_fkey ( id, name, plan_type ),
       beneficiary:beneficiaries!awards_beneficiary_id_fkey ( id, first_name, last_name, email )`,
    )
    .eq('id', idCheck.data)
    .maybeSingle();

  if (error || !row) return { ok: false, error: error?.message ?? 'Award introuvable' };

  const [{ count: veCount }, { count: modCount }] = await Promise.all([
    supabase
      .from('vesting_events')
      .select('id', { count: 'exact', head: true })
      .eq('award_id', idCheck.data),
    supabase
      .from('award_modifications')
      .select('id', { count: 'exact', head: true })
      .eq('award_id', idCheck.data),
  ]);

  return {
    ok: true,
    award: {
      id: row.id,
      awardNumber: row.award_number,
      status: row.status,
      unitsGranted: Number(row.units_granted),
      unitsVested: row.units_vested != null ? Number(row.units_vested) : null,
      exercisePrice: row.exercise_price != null ? Number(row.exercise_price) : null,
      grantDate: row.grant_date,
      vestingStartDate: row.vesting_start_date,
      expiryDate: row.expiry_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      plan: row.plan
        ? { id: row.plan.id, name: row.plan.name, planType: row.plan.plan_type }
        : null,
      beneficiary: row.beneficiary
        ? {
            id: row.beneficiary.id,
            firstName: row.beneficiary.first_name,
            lastName: row.beneficiary.last_name,
            email: row.beneficiary.email,
          }
        : null,
      vestingEventsCount: veCount ?? 0,
      modificationsCount: modCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. transitionAward — la plus critique
// ---------------------------------------------------------------------------
// Permission mapping selon §2.4 :
//   PROPOSED ← DRAFT          : awards.propose
//   PENDING_APPROVAL ← *      : awards.propose
//   APPROVED ← PENDING_APPROVAL : awards.approve
//   BOARD_APPROVED ← PENDING_BOARD : awards.board.approve (fallback awards.approve V1)
//   PENDING_SIGNATURE ← *     : awards.propose
//   GRANTED ← PENDING_SIGNATURE : awards.propose (admin flip manuel V1)
//   * ← VESTING/POST          : awards.update (transitions cron)
//   * → CANCELLED             : awards.cancel
//   * → FORFEITED             : awards.modify

function permissionForTransition(_from: AwardStatus, to: AwardStatus): string {
  if (to === 'CANCELLED') return 'awards.cancel';
  if (to === 'FORFEITED') return 'awards.modify';
  if (to === 'APPROVED') return 'awards.approve';
  if (to === 'BOARD_APPROVED') return 'awards.approve'; // V1 : fallback (awards.board.approve viendra B7)
  // Tous les autres transitions (PROPOSED, PENDING_*, GRANTED…) → propose
  return 'awards.propose';
}

export async function transitionAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = transitionAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, toStatus, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Charger l'award (pas de SELECT FOR UPDATE car Supabase JS ne l'expose pas
  // — la course est très improbable côté UX, et les triggers DB attrapent
  // les violations cohérence pool/lock).
  const { data: award } = await supabase
    .from('awards')
    .select('id, status, plan_id, beneficiary_id, units_granted, units_vested, vesting_start_date')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };

  const fromStatus = award.status as AwardStatus;
  if (!canTransition(fromStatus, toStatus)) {
    return {
      ok: false,
      error: `Transition interdite : ${fromStatus} → ${toStatus}`,
    };
  }

  // Permission check selon la transition cible
  const requiredPerm = permissionForTransition(fromStatus, toStatus);
  const user = await requirePermission(requiredPerm as never);
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Side-effect GRANTED → matérialiser vesting_events
  if (toStatus === 'GRANTED') {
    const { error: matError } = await supabase.rpc('materialize_vesting_events', {
      p_award_id: awardId,
    });
    if (matError) {
      return { ok: false, error: `materialize_vesting_events échoué : ${matError.message}` };
    }
  }

  // UPDATE status + timestamp dédié si applicable
  const updateData: Record<string, unknown> = {
    status: toStatus,
    updated_at: new Date().toISOString(),
  };
  const tsField = timestampFieldForStatus(toStatus);
  if (tsField) updateData[tsField] = new Date().toISOString();
  if (toStatus === 'CANCELLED' && reason) updateData.cancellation_reason = reason;

  const { error: updError } = await supabase
    .from('awards')
    .update(updateData as never)
    .eq('id', awardId);
  if (updError) return { ok: false, error: updError.message };

  await logAuditEvent({
    eventType: 'award.status_changed',
    resourceType: 'AWARD',
    resourceId: awardId,
    beforeState: { status: fromStatus },
    afterState: { status: toStatus },
    metadata: { from: fromStatus, to: toStatus, reason: reason ?? null },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/awards');
  if (award.plan_id) revalidatePath(`/dashboard/plans/${award.plan_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4 bis. createAndPropose — helper « créer + soumettre » (modale UI B3)
// ---------------------------------------------------------------------------
// Wrap createAwardDraft + transitionAward → PROPOSED en 1 appel.
//
// Décision archi : on FORCE `initialStatus='DRAFT'` au create (même si
// l'input demande 'PROPOSED'), puis on appelle transitionAward(_, 'PROPOSED').
// Pourquoi : cohérence d'audit. La transition DRAFT → PROPOSED émet
// systématiquement `award.status_changed`. Si on shortcut en créant
// directement en PROPOSED, l'audit ne montre que `award.created` et un
// futur dev sera surpris de ne pas voir l'event de soumission.
//
// Si la transition échoue (compliance, pool exceeded au PROPOSED, etc.),
// l'award reste en DRAFT et l'utilisateur peut le reprendre depuis la liste.

export async function createAndPropose(input: unknown): Promise<CreateAwardResult> {
  // Validation upfront pour pouvoir injecter initialStatus='DRAFT'
  const parsed = createAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const created = await createAwardDraft({ ...parsed.data, initialStatus: 'DRAFT' });
  if (!created.ok) return created;

  const transition = await transitionAward({ awardId: created.id, toStatus: 'PROPOSED' });
  if (!transition.ok) {
    return {
      ok: false,
      error: `Award ${created.awardNumber} créé en DRAFT, soumission échouée : ${transition.error}. Vous pouvez le reprendre depuis la liste.`,
    };
  }
  return created;
}

// ---------------------------------------------------------------------------
// 5. cancelAward — wrapper transitionAward → CANCELLED
// ---------------------------------------------------------------------------

export async function cancelAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = cancelAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: award } = await supabase
    .from('awards')
    .select('status')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };
  if (!isCancellable(award.status as AwardStatus)) {
    return {
      ok: false,
      error: `Award en status ${award.status} non cancellable (utilisez forfeitAward ou createAwardModification post-GRANTED)`,
    };
  }

  return transitionAward({ awardId, toStatus: 'CANCELLED', reason });
}

// ---------------------------------------------------------------------------
// 6. forfeitAward — wrapper transitionAward → FORFEITED
// ---------------------------------------------------------------------------
//
// V1 — units_forfeited = units_granted - units_vested (les non-vested partent).
// Le treatment fin (forfeit_all / keep_vested / pro_rata / accelerate)
// par leaver_type sera géré au Module 9.

export async function forfeitAward(input: unknown): Promise<ActionVoid | ActionError> {
  const parsed = forfeitAwardSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, leaverType, eventDate, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: award } = await supabase
    .from('awards')
    .select('id, status, units_granted, units_vested, plan_id')
    .eq('id', awardId)
    .maybeSingle();
  if (!award) return { ok: false, error: 'Award introuvable' };
  if (!canTransition(award.status as AwardStatus, 'FORFEITED')) {
    return { ok: false, error: `Award en status ${award.status} non forfeitable` };
  }

  const unitsForfeited = Math.max(0, Number(award.units_granted) - Number(award.units_vested ?? 0));

  // Audit forfeit metadata avant la transition (pour avoir tous les détails)
  const user = await requirePermission('awards.modify');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  await logAuditEvent({
    eventType: 'award.forfeited',
    resourceType: 'AWARD',
    resourceId: awardId,
    metadata: {
      leaver_type: leaverType,
      event_date: eventDate,
      units_forfeited: unitsForfeited,
      units_granted: Number(award.units_granted),
      units_vested: Number(award.units_vested ?? 0),
      reason: reason ?? null,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return transitionAward({
    awardId,
    toStatus: 'FORFEITED',
    reason: reason ?? `Leaver event ${leaverType} @ ${eventDate}`,
  });
}

// ---------------------------------------------------------------------------
// 7. bulkCreateAwards — appelle RPC bulk_create_awards
// ---------------------------------------------------------------------------

export type BulkResult = ActionOk<{ created: number; awardIds: string[] }> | ActionError;

/**
 * Mapping CSV beneficiary_type → DB beneficiary_type enum.
 *   employee   → EMPLOYEE
 *   consultant → CONSULTANT
 *   dirigeant  → OFFICER
 *   external   → OTHER
 *
 * Cohérent avec MODULE_03B §5.3 (CSV format) et la table beneficiaries
 * (Module 1 — enum DB).
 */
const CSV_TYPE_TO_DB: Record<
  BulkAwardImportInput['rows'][number]['beneficiaryType'],
  'EMPLOYEE' | 'OFFICER' | 'CONSULTANT' | 'ADVISOR' | 'OTHER'
> = {
  employee: 'EMPLOYEE',
  consultant: 'CONSULTANT',
  dirigeant: 'OFFICER',
  external: 'OTHER',
};

/**
 * Bulk import CSV — Module 3b B5.
 *
 * Pipeline :
 *   1. Validation Zod du payload (planId + array de rows pré-parsées)
 *   2. requirePermission('awards.bulk_import')
 *   3. Résolution email → beneficiary_id par upsert (déduplication intra-CSV
 *      pour minimiser les round-trips)
 *   4. Appel RPC bulk_create_awards avec un array de payloads create_award_full
 *      enrichis du beneficiaryId résolu
 *   5. Revalidate la liste
 *
 * Atomicité : le RPC est ROLLBACK-total — soit les N awards sont créés, soit
 * aucun. Les beneficiaries upsertés en amont restent en cas d'échec RPC : c'est
 * acceptable (idempotents sur email, pas de pollution data — un retry de
 * l'import les réutilisera).
 *
 * Audit : `award.bulk_imported` est inséré par le RPC lui-même (cf.
 * migration 00021), pas besoin de logAuditEvent côté Server Action.
 */
export async function bulkCreateAwards(input: unknown): Promise<BulkResult> {
  const parsed = bulkAwardImportSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data as BulkAwardImportInput;
  const user = await requirePermission('awards.bulk_import');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Déduplication des emails (un même bénéficiaire peut apparaître plusieurs
  //    fois dans le CSV avec des awards différents — un seul upsert suffit).
  const emailIndex = new Map<
    string,
    { fullName: string; type: BulkAwardImportInput['rows'][number]['beneficiaryType'] }
  >();
  for (const row of data.rows) {
    const key = row.beneficiaryEmail.toLowerCase();
    if (!emailIndex.has(key)) {
      emailIndex.set(key, { fullName: row.beneficiaryFullName, type: row.beneficiaryType });
    }
  }

  // 2. Upsert beneficiaries inline (SELECT par email + INSERT si absent).
  //    Pas d'appel à upsertBeneficiary() pour éviter N×requirePermission +
  //    N×audit_event "beneficiary.created" individuels — on batch tout ici.
  const emailToId = new Map<string, string>();

  // 2a. SELECT en bulk les bénéficiaires déjà existants
  const lowerEmails = Array.from(emailIndex.keys());
  const { data: existing } = await supabase
    .from('beneficiaries')
    .select('id, email')
    .eq('org_id', user.activeOrgId)
    .in('email', lowerEmails)
    .is('deleted_at', null);
  for (const ben of existing ?? []) {
    emailToId.set(ben.email.toLowerCase(), ben.id);
  }

  // 2b. INSERT les bénéficiaires manquants
  const toInsert = Array.from(emailIndex.entries())
    .filter(([email]) => !emailToId.has(email))
    .map(([email, info]) => {
      const parts = info.fullName.trim().split(/\s+/);
      const firstName = parts[0] ?? info.fullName;
      const lastName = parts.slice(1).join(' ') || '—';
      return {
        org_id: user.activeOrgId!,
        email,
        first_name: firstName,
        last_name: lastName,
        beneficiary_type: CSV_TYPE_TO_DB[info.type],
        status: 'ACTIVE' as const,
        tax_residence_country: 'FR',
      };
    });

  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('beneficiaries')
      .insert(toInsert)
      .select('id, email');
    if (insErr || !inserted) {
      return { ok: false, error: `Échec upsert bénéficiaires : ${insErr?.message ?? 'inconnu'}` };
    }
    for (const ben of inserted) {
      emailToId.set(ben.email.toLowerCase(), ben.id);
    }
    // Audit per beneficiary created — best-effort, non-bloquant.
    await Promise.allSettled(
      inserted.map((ben) =>
        logAuditEvent({
          eventType: 'beneficiary.created',
          resourceType: 'BENEFICIARY',
          resourceId: ben.id,
          metadata: { source: 'bulk_import_csv', email: ben.email },
          userId: user.id,
          userEmail: user.email,
          orgId: user.activeOrgId!,
        }),
      ),
    );
  }

  // 3. Mapping des rows CSV vers les payloads create_award_full
  const rpcRows = data.rows.map((r) => {
    const benId = emailToId.get(r.beneficiaryEmail.toLowerCase());
    if (!benId) {
      // Ne devrait jamais arriver (étape 2 a tout résolu), defense-in-depth.
      throw new Error(`Bénéficiaire non résolu pour ${r.beneficiaryEmail}`);
    }
    return {
      planId: data.planId,
      beneficiaryId: benId,
      unitsGranted: r.unitsGranted,
      exercisePrice: r.exercisePrice ?? '',
      grantDate: r.grantDate,
      vestingStartDate: r.vestingStartDate ?? '',
      expiryDate: '',
      acceptanceDeadline: '',
      initialStatus: 'DRAFT',
    };
  });

  // 4. Appel RPC atomique. Si UNE row échoue, ROLLBACK total côté DB.
  const { data: rpcResult, error } = await supabase.rpc('bulk_create_awards', {
    p_rows: rpcRows as never,
  });
  if (error) return { ok: false, error: error.message };
  const result = rpcResult as { created: number; award_ids: string[] } | null;
  if (!result) return { ok: false, error: 'Réponse bulk_create_awards inattendue' };

  revalidatePath('/dashboard/awards');
  return { ok: true, created: result.created, awardIds: result.award_ids ?? [] };
}

// ---------------------------------------------------------------------------
// 8. createAwardModification — IFRS 2.27-28 modifications post-grant
// ---------------------------------------------------------------------------

export async function createAwardModification(
  input: unknown,
): Promise<ActionOk<{ modificationId: string }> | ActionError> {
  const parsed = createModificationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, type, changes, reason, effectiveDate } = parsed.data;

  const user = await requirePermission('awards.modify');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // before_snapshot : SELECT row complet de l'award au moment T
  const { data: before } = await supabase
    .from('awards')
    .select('*')
    .eq('id', awardId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Award introuvable' };

  // after_snapshot : projection des `changes` sur le before
  const after = { ...before, ...changes };

  const { data: insRow, error: insError } = await supabase
    .from('award_modifications')
    .insert({
      org_id: user.activeOrgId,
      award_id: awardId,
      modification_type: type,
      effective_date: effectiveDate ?? new Date().toISOString().slice(0, 10),
      before_snapshot: before as never,
      after_snapshot: after as never,
      reason,
    })
    .select('id')
    .single();
  if (insError || !insRow) {
    return { ok: false, error: insError?.message ?? 'Insert award_modifications échoué' };
  }

  // has_modifications flag sur l'award
  await supabase.from('awards').update({ has_modifications: true }).eq('id', awardId);

  // Pour REPRICING / EXTENSION / ACCELERATION / ADDITIONAL_GRANT : trigger un
  // valuation_run en QUEUED (le moteur Python recalcule l'incremental fair value).
  // CANCELLATION : pas de re-valuation, c'est juste un soft-delete avec impact IFRS 2.
  const requiresRevaluation = (
    [
      'REPRICING',
      'EXTENSION',
      'ACCELERATION',
      'ADDITIONAL_GRANT',
    ] as readonly (typeof AWARD_MODIFICATION_TYPES)[number][]
  ).includes(type);
  if (requiresRevaluation && before.plan_id) {
    await supabase.from('valuation_runs').insert({
      org_id: user.activeOrgId,
      plan_id: before.plan_id,
      status: 'QUEUED',
      triggered_by: user.id,
    });
  }

  await logAuditEvent({
    eventType: 'award.modified',
    resourceType: 'AWARD',
    resourceId: awardId,
    metadata: {
      modification_id: insRow.id,
      modification_type: type,
      changes,
      reason,
      revaluation_queued: requiresRevaluation,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/awards');
  return { ok: true, modificationId: insRow.id };
}

// Pas de re-exports : Next.js interdit les exports non-async dans un fichier
// 'use server'. Les schémas Zod et types sont importés directement depuis
// `@equity/shared` côté composants client/server :
//   import { createAwardSchema, awardStatusSchema, type AwardStatus } from '@equity/shared';
