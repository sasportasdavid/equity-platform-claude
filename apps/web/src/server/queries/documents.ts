import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 6 B4 — Server queries pour les documents (UI page détail award).
 *
 * `getDocumentsForAward` charge les `document_instances` pour un award
 * donné + leurs `signature_requests` + un agrégat des signers (status,
 * count). Toutes les queries passent par `createSupabaseServerClient`
 * (cookies user) → soumis aux RLS Pattern 1 (org_id + permission).
 *
 * `listCompanyRepresentativeOptions` charge les users de l'org éligibles
 * comme signataire société (rôles OWNER ou ADMIN_HR), pour le combobox de
 * SendForSignatureDialog.
 */

// ---------------------------------------------------------------------------
// getDocumentsForAward
// ---------------------------------------------------------------------------

export type AwardDocumentSigner = {
  id: string;
  full_name: string;
  email: string;
  role_in_signature: string;
  signing_order: number;
  status: string;
  viewed_at: string | null;
  signed_at: string | null;
  yousign_sign_url: string | null;
};

export type AwardDocumentSignatureRequest = {
  id: string;
  status: string;
  yousign_procedure_id: string | null;
  signing_order: string;
  expiry_date: string | null;
  sent_at: string | null;
  completed_at: string | null;
  proof_certificate_url: string | null;
  signers: AwardDocumentSigner[];
};

export type AwardDocumentRow = {
  id: string;
  document_number: string | null;
  status: string;
  template_id: string | null;
  template_code: string | null;
  template_name: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  signed_pdf_storage_path: string | null;
  proof_certificate_url: string | null;
  generated_at: string | null;
  generated_by: string | null;
  generated_by_email: string | null;
  signed_at: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  archived_at: string | null;
  created_at: string;
  signature_request: AwardDocumentSignatureRequest | null;
};

type DocBaseRow = {
  id: string;
  document_number: string | null;
  status: string;
  template_id: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  signed_pdf_storage_path: string | null;
  proof_certificate_url: string | null;
  generated_at: string | null;
  generated_by: string | null;
  signed_at: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  archived_at: string | null;
  created_at: string;
};
type SigReqJoin = {
  id: string;
  document_id: string;
  status: string;
  yousign_procedure_id: string | null;
  signing_order: string;
  expiry_date: string | null;
  sent_at: string | null;
  completed_at: string | null;
  proof_certificate_url: string | null;
};
type SignerJoin = {
  id: string;
  signature_request_id: string;
  full_name: string;
  email: string;
  role_in_signature: string;
  signing_order: number;
  status: string;
  viewed_at: string | null;
  signed_at: string | null;
  yousign_sign_url: string | null;
};

export async function getDocumentsForAward(awardId: string): Promise<AwardDocumentRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data: docs } = await supabase
    .from('document_instances')
    .select(
      `id, document_number, status, template_id, storage_path, storage_bucket,
       signed_pdf_storage_path, proof_certificate_url,
       generated_at, generated_by, signed_at, voided_at, voided_reason, archived_at, created_at`,
    )
    .eq('related_entity_type', 'AWARD')
    .eq('related_entity_id', awardId)
    .order('created_at', { ascending: false });

  const docList = (docs ?? []) as DocBaseRow[];
  if (docList.length === 0) return [];

  const docIds = docList.map((d) => d.id);

  const [{ data: sigReqs }, { data: templates }, { data: profiles }] = await Promise.all([
    supabase
      .from('signature_requests')
      .select(
        `id, document_id, status, yousign_procedure_id, signing_order,
         expiry_date, sent_at, completed_at, proof_certificate_url`,
      )
      .in('document_id', docIds),
    docList.some((d) => d.template_id)
      ? supabase
          .from('document_templates')
          .select('id, code, name')
          .in(
            'id',
            docList.map((d) => d.template_id).filter((x): x is string => Boolean(x)),
          )
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    docList.some((d) => d.generated_by)
      ? supabase
          .from('user_profiles')
          .select('id, email')
          .in(
            'id',
            docList.map((d) => d.generated_by).filter((x): x is string => Boolean(x)),
          )
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
  ]);

  const sigReqByDoc = new Map<string, SigReqJoin>();
  for (const sr of (sigReqs ?? []) as SigReqJoin[]) sigReqByDoc.set(sr.document_id, sr);

  const sigReqIds = Array.from(sigReqByDoc.values()).map((s) => s.id);
  const { data: signers } = sigReqIds.length
    ? await supabase
        .from('signers')
        .select(
          `id, signature_request_id, full_name, email, role_in_signature,
           signing_order, status, viewed_at, signed_at, yousign_sign_url`,
        )
        .in('signature_request_id', sigReqIds)
    : { data: [] as SignerJoin[] };

  const signersByReq = new Map<string, SignerJoin[]>();
  for (const s of (signers ?? []) as SignerJoin[]) {
    const arr = signersByReq.get(s.signature_request_id) ?? [];
    arr.push(s);
    signersByReq.set(s.signature_request_id, arr);
  }

  const tplById = new Map<string, { code: string; name: string }>();
  for (const t of (templates ?? []) as { id: string; code: string; name: string }[]) {
    tplById.set(t.id, { code: t.code, name: t.name });
  }
  const profileById = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; email: string }[]) {
    profileById.set(p.id, p.email);
  }

  return docList.map<AwardDocumentRow>((d) => {
    const tpl = d.template_id ? tplById.get(d.template_id) : null;
    const sr = sigReqByDoc.get(d.id);
    const signersList = sr ? (signersByReq.get(sr.id) ?? []) : [];
    return {
      ...d,
      template_code: tpl?.code ?? null,
      template_name: tpl?.name ?? null,
      generated_by_email: d.generated_by ? (profileById.get(d.generated_by) ?? null) : null,
      signature_request: sr
        ? {
            id: sr.id,
            status: sr.status,
            yousign_procedure_id: sr.yousign_procedure_id,
            signing_order: sr.signing_order,
            expiry_date: sr.expiry_date,
            sent_at: sr.sent_at,
            completed_at: sr.completed_at,
            proof_certificate_url: sr.proof_certificate_url,
            signers: signersList.sort((a, b) => a.signing_order - b.signing_order),
          }
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// listCompanyRepresentativeOptions — combobox signer 2 dans SendForSignatureDialog
// ---------------------------------------------------------------------------

export type CompanyRepresentativeOption = {
  user_id: string;
  email: string;
  full_name: string | null;
  roles: string[];
};

const ELIGIBLE_REP_ROLES = ['OWNER', 'ADMIN_HR'] as const;

export async function listCompanyRepresentativeOptions(
  orgId: string,
): Promise<CompanyRepresentativeOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('memberships')
    .select(`user_id, roles, status, user_profiles ( email, full_name )`)
    .eq('org_id', orgId)
    .eq('status', 'ACTIVE');

  type Row = {
    user_id: string;
    roles: string[] | null;
    user_profiles: { email?: string; full_name?: string | null } | null;
  };
  return ((data ?? []) as Row[])
    .filter((r) => (r.roles ?? []).some((role) => ELIGIBLE_REP_ROLES.includes(role as never)))
    .map((r) => ({
      user_id: r.user_id,
      email: r.user_profiles?.email ?? '',
      full_name: r.user_profiles?.full_name ?? null,
      roles: r.roles ?? [],
    }))
    .filter((r) => r.email);
}
