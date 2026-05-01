-- ============================================================================
-- Module 8 B1 — Permissions portal bénéficiaire
--
-- 3 nouvelles permissions :
--  - beneficiaries.update.own : modifier ses propres infos personnelles
--  - vesting_events.read.own  : voir ses propres vesting events
--  - portal.simulate_leaver   : utiliser le simulateur de scénarios leavers
--
-- Mappées au rôle BENEFICIARY (en plus de awards.read.own / documents.read.own
-- / notifications.read.own déjà présents).
--
-- ON CONFLICT DO NOTHING — recon a confirmé qu'aucune des 3 n'existe en DB.
-- ============================================================================

INSERT INTO public.permissions_catalog (code, category, description, is_dangerous) VALUES
  ('beneficiaries.update.own', 'PORTAL', 'Modifier ses propres infos personnelles (téléphone, adresse, banque)', false),
  ('vesting_events.read.own',  'PORTAL', 'Voir ses propres vesting events (planning d''acquisition)',         false),
  ('portal.simulate_leaver',   'PORTAL', 'Utiliser le simulateur de scénarios de départ (leavers)',          false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'beneficiaries.update.own'),
  ('BENEFICIARY', 'vesting_events.read.own'),
  ('BENEFICIARY', 'portal.simulate_leaver')
ON CONFLICT DO NOTHING;
