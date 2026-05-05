-- Module 13 V2 PR #42 B1.1 — Tamper-evident chain columns sur audit_events.
--
-- Ajoute 3 colonnes pour la hash chain SHA-256 (cf MODULE_13_AUDIT_TRAIL.md §3) :
-- - event_hash (text 64 hex)    : SHA-256 du payload canonical || previous_hash
-- - previous_hash (text 64 hex) : event_hash du previous event de la chaîne org
-- - chain_position (bigint)     : position monotone par org (UNIQUE per org_id)
--
-- Stratégie V1 = mark-and-sweep (Option A spec §3.3) : les events pré-Module 13
-- restent NULL sur les 3 colonnes. Le trigger BEFORE INSERT (fichier suivant)
-- assigne chain_position uniquement pour les nouveaux events.

ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS event_hash      text,
  ADD COLUMN IF NOT EXISTS previous_hash   text,
  ADD COLUMN IF NOT EXISTS chain_position  bigint;

-- Per-org chain unicity (mark-and-sweep : NULL exclu de l'index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_chain_per_org
  ON public.audit_events (org_id, chain_position)
  WHERE chain_position IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_event_hash
  ON public.audit_events (event_hash)
  WHERE event_hash IS NOT NULL;

-- Hex format guards
ALTER TABLE public.audit_events
  ADD CONSTRAINT chk_audit_events_event_hash_format
    CHECK (event_hash IS NULL OR event_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT chk_audit_events_previous_hash_format
    CHECK (previous_hash IS NULL OR previous_hash ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN public.audit_events.event_hash IS
  'SHA-256 hex (64) du payload canonical JSON || previous_hash. NULL pour events pré-Module 13 (mark-and-sweep V1, cf MODULE_13 §3.3 Option A). Calculé en AFTER INSERT trigger.';
COMMENT ON COLUMN public.audit_events.previous_hash IS
  'event_hash du previous event de la chaîne org (chain_position - 1). NULL pour le genesis event de chaque org (chain_position = 1, le genesis SHA-256 dérivé est utilisé dans le payload mais pas stocké en previous_hash).';
COMMENT ON COLUMN public.audit_events.chain_position IS
  'Position dans la chaîne par org (UNIQUE per org_id). NULL pour events pré-Module 13. Assigné en BEFORE INSERT trigger via advisory lock per-org.';
