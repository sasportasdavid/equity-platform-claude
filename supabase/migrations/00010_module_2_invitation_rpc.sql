-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00010 : RPC publique pour lire une invitation par son token (Module 2 §1.4 / §1.5)
--
-- Audit des policies Module 1 :
--   - invitations: policy `invitations_org` couvre uniquement authenticated
--     avec org.manage_members + org_id = current_org_id(). Un user anon
--     (qui n'a pas encore de session) ne peut donc PAS lire son invitation
--     en cliquant sur le lien email /accept-invite?token=xxx.
--
-- Solution sécurisée (sans assouplir les policies générales) : une RPC
-- SECURITY DEFINER qui :
--   - Filtre par token unique (équivalent d'une preuve de connaissance)
--   - Filtre par status = 'PENDING' et expires_at > now()
--   - N'expose qu'un sous-ensemble safe : pas le token lui-même, pas
--     d'autres invitations
--   - Renvoie 0 row si pas trouvé / expiré / déjà utilisé (pas de leak
--     d'existence)
--
-- L'acceptation effective (qui crée user + membership) sera une RPC
-- séparée `accept_invitation` créée en Phase 2 (Backend), car elle
-- nécessite la création de auth.users via service_role qui n'est pas
-- exposable côté DB.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  id              UUID,
  org_id          UUID,
  org_name        TEXT,
  email           TEXT,
  roles           TEXT[],
  message         TEXT,
  invited_by      UUID,
  invited_by_email TEXT,
  beneficiary_id  UUID,
  expires_at      TIMESTAMPTZ,
  is_for_beneficiary BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garde-fou : token vide / NULL → 0 rows
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.org_id,
    o.name                                                   AS org_name,
    i.email,
    i.roles,
    i.message,
    i.invited_by,
    inviter.email                                            AS invited_by_email,
    i.beneficiary_id,
    i.expires_at,
    ('BENEFICIARY' = ANY(i.roles))                           AS is_for_beneficiary
  FROM invitations i
  JOIN organizations o ON o.id = i.org_id
  LEFT JOIN auth.users inviter ON inviter.id = i.invited_by
  WHERE i.token = p_token
    AND i.status = 'PENDING'
    AND i.expires_at > now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_invitation_by_token IS
  'Module 2 §1.4 — RPC publique pour la page /accept-invite. Filtre status PENDING et expires_at > now(). Aucun leak d''existence : 0 rows si invalide.';
