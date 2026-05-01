-- =============================================================================
-- Module 7 B1 — notification_templates composite PK fix
-- =============================================================================
-- Module 1 a posé PK sur `code` SEUL → impossible d'avoir plusieurs canaux
-- pour le même code (ex: approval_pending IN_APP existant + approval_pending
-- EMAIL ajouté en B1). Module 7 spec assume PK composite (code, channel,
-- locale) — fix structurel obligatoire avant le seed des 6 templates.
--
-- Étapes :
-- 1. DROP FK notifications.template_code → templates.code (était
--    ON DELETE SET NULL — faible valeur référentielle, on garde
--    template_code en TEXT soft-reference côté notifications).
-- 2. DROP PK (code), ADD PK (code, channel, locale).
-- 3. Index partial pour accélérer les lookups consumer (templates actifs).
--
-- Données existantes : 8 UPPERCASE Module 1 (EMAIL/fr-FR) + 1
-- approval_pending IN_APP/fr-FR Module 5 — toutes uniques sur le composite.
-- =============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_template_code_fkey;

ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_pkey;

ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (code, channel, locale);

CREATE INDEX IF NOT EXISTS idx_notification_templates_active
  ON public.notification_templates(code, channel, locale)
  WHERE is_active = true;
