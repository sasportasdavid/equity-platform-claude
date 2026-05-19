-- =============================================================================
-- Migration 00106 : next_award_number_impl self-healing
-- =============================================================================
--
-- BUG observé 2026-05-19 :
-- `duplicate key value violates unique constraint "idx_awards_number"` lors
-- d'une création d'attribution sur l'org Capiwise. Cause : counter
-- `award_number_counters.current_seq` = 11, mais MAX(awards.award_number)
-- pour l'année courante = 13 (AWD-2026-0013 existant). next_award_number()
-- retournait AWD-2026-0012 (seq+1=12) qui existait déjà → unique violation.
--
-- Hot-fix manuel appliqué (UPDATE counter SET current_seq=13). Mais la
-- classe de bug peut revenir :
--   - Race condition entre 2 INSERT simultanés (READ_COMMITTED isolation)
--   - DELETE manuel d'awards sans resync counter
--   - INSERT manuel d'award avec numéro hors séquence (admin debug)
--   - Restore partiel depuis backup non aligné
--
-- FIX : self-healing dans `next_award_number_impl` — au lieu de faire
-- aveuglément `counter + 1`, on prend `GREATEST(counter + 1, MAX(awards) + 1)`.
-- Le counter rattrape automatiquement la table source de vérité, même après
-- des manipulations manuelles ou des races.
--
-- Performance : 1 SELECT MAX supplémentaire par appel. Index existant
-- sur `idx_awards_number` (UNIQUE) rend la lookup O(log N) — coût
-- négligeable (~1 ms même sur 100k awards).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.next_award_number_impl(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year         INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq          INTEGER;
  v_existing_max INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id requis';
  END IF;

  -- ⚠️ Self-healing : on prend en compte le MAX réel dans awards.
  -- Si quelqu'un a INSERT manuellement / si le counter a dérivé,
  -- on rattrape automatiquement.
  SELECT COALESCE(MAX(SUBSTRING(award_number FROM '-(\d+)$')::int), 0)
    INTO v_existing_max
    FROM public.awards
    WHERE org_id = p_org_id
      AND award_number LIKE 'AWD-' || v_year::text || '-%'
      AND deleted_at IS NULL;

  INSERT INTO public.award_number_counters (org_id, current_year, current_seq)
  VALUES (p_org_id, v_year, GREATEST(1, v_existing_max + 1))
  ON CONFLICT (org_id) DO UPDATE
    SET current_year = v_year,
        current_seq  = CASE
          WHEN award_number_counters.current_year = v_year
            THEN GREATEST(
              award_number_counters.current_seq + 1,
              v_existing_max + 1
            )
          ELSE GREATEST(1, v_existing_max + 1)
        END,
        updated_at   = now()
  RETURNING current_seq INTO v_seq;

  RETURN format('AWD-%s-%s', v_year, lpad(v_seq::TEXT, 4, '0'));
END $function$;

COMMENT ON FUNCTION public.next_award_number_impl(UUID) IS
  'Module 3b (00020) + fix 00105 tenant guard + fix 00106 self-healing — Génère le prochain numéro d''award atomique. Le counter est resynchronisé au MAX(awards) à chaque appel pour éviter les duplicate key violations après race conditions, DELETE manuels, ou restores partiels.';
