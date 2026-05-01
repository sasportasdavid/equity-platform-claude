# MODULE 7 — NOTIFICATIONS RESEND

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Mai 2026
> **Prérequis :** Modules 1, 2, 3a, 3b, 4, 5, 6 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter le **moteur de notifications email** qui consomme les notifications insérées en `PENDING` dans la table `notifications` (par Module 5 + Module 6) et les envoie via **Resend API**, avec tracking de delivery via webhook.

C'est le module qui rend le SaaS communicatif. Sans Module 7, les approbateurs ne savent pas qu'ils doivent approuver, les bénéficiaires ne savent pas qu'un award leur a été attribué, et les RH ne savent pas que les workflows avancent.

### 0.2 Décisions structurantes (déjà tranchées)

| Décision            | Choix retenu                                       | Justification                                                                                                       |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Provider**        | Resend                                             | Déjà SMTP custom Supabase Auth (mêmes credentials), API moderne, react-email natif                                  |
| **Templates V1**    | 6 templates                                        | approval_pending, approval_approved, approval_rejected, award_granted, team_member_invite, beneficiary_first_invite |
| **Composer**        | react-email                                        | Composants typés, preview en dev, HTML responsive                                                                   |
| **Stratégie envoi** | Cron pg_cron + Edge Function consumer              | Pickup les notifs PENDING toutes les 30s, batch send                                                                |
| **Webhook Resend**  | Edge Function Supabase Deno                        | Pattern v6 (waitUntil + HMAC svix) déjà éprouvé Module 6                                                            |
| **Locale V1**       | FR uniquement                                      | EN en V2                                                                                                            |
| **Domaine envoi**   | Domaine vérifié dans Resend (à confirmer côté ops) | Custom branded                                                                                                      |

### 0.3 Périmètre exact

**Inclus dans ce module :**

- Client Resend wrapper avec retry + tags
- 6 templates email react-email (FR)
- Consumer Edge Function (`notifications-consumer`) qui pickup PENDING et send
- Webhook Edge Function (`resend-webhook`) pour update status delivery
- Cron pg_cron toutes les 30s qui appelle le consumer
- Server Actions pour insertion manuelle de notif (admin)
- Hooks dans Module 5/6 pour vérifier que les notifs sont bien insérées
- Page admin `/dashboard/settings/notifications` (audit envois récents)
- Tests Vitest sur templates + Server Actions
- Cleanup nocturne notifications > 90 jours via cron

**Exclus (modules ultérieurs) :**

- Templates 7+ (signature_reminder, weekly_digest, etc.) → V2
- SMS via Twilio → V2
- Slack/Teams notifications → V2
- Editeur de templates UI → V3 (non prévu)
- Multi-langue EN/DE/IT → V2
- A/B testing templates → V3
- Personnalisation utilisateur (opt-out per template) → V2
- Push web notifications → V2 (Module 8 Beneficiary Portal)
- In-app notifications inbox UI complet → V2 (placeholder badge V1)

### 0.4 Dépendances

- Module 1 : tables `notifications`, `notification_templates` préfigurées
- Module 2 : table `user_profiles` + hook `custom_access_token_hook` (org_id en JWT)
- Module 4 : tables `beneficiaries` (recipient_email)
- Module 5 : insère déjà `notifications` rows status='PENDING' avec template_code='approval_pending'
- Module 6 : insère déjà `notifications` post-signature (à valider)
- Resend API : compte vérifié, domaine setup, RESEND_API_KEY disponible
- Cron : `pg_cron` extension activée Supabase

### 0.5 Référence

- MODULE_01_FOUNDATION sections 4.x (tables `notifications`, `notification_templates`)
- MODULE_02_IDENTITY_ROLES sections 7.1-7.3 (Resend client + 5 templates initiaux + webhook stub)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────────────┐
│  ÉVÉNEMENTS MÉTIER (Module 5/6)                                     │
│                                                                       │
│  Module 5 : start_approval_workflow → INSERT notifications PENDING  │
│             record_approval_decision → INSERT notif status_update    │
│  Module 6 : sendDocumentForSignature → (Yousign envoie ses propres   │
│             emails, on ne double pas)                                │
│             webhook signature_request.done → INSERT notif granted    │
│                                                                       │
│  → notifications row status='PENDING', channel='EMAIL',              │
│    template_code='approval_pending'/'award_granted'/etc.             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CRON pg_cron (every 30s)                                           │
│  → Edge Function: notifications-consumer                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONSUMER EDGE FUNCTION                                              │
│                                                                       │
│  1. SELECT FROM notifications                                        │
│      WHERE status='PENDING' AND channel='EMAIL'                      │
│      LIMIT 50                                                        │
│  2. For each : load template + variables → react-email render        │
│  3. Resend API send                                                  │
│  4. UPDATE notifications SET status='SENT', sent_at=now(),           │
│             provider_message_id=resp.id                              │
│  5. Si Resend throws : status='FAILED', failure_reason=err           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RESEND PLATFORM                                                     │
│  → Email envoyé au destinataire                                     │
│  → Webhook envoyé à notre EF resend-webhook quand :                 │
│    - email.delivered                                                 │
│    - email.bounced                                                   │
│    - email.complained                                                │
│    - email.opened (V2)                                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WEBHOOK EDGE FUNCTION (resend-webhook)                              │
│                                                                       │
│  1. Verify HMAC svix-signature                                       │
│  2. Ack 200 < 100ms (EdgeRuntime.waitUntil)                         │
│  3. Background : UPDATE notifications WHERE provider_message_id=...  │
│     SET status='DELIVERED'/'BOUNCED'/'COMPLAINED'                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Permissions

À seeder dans `permissions_catalog` (vérifier en recon ce qui existe Module 1) :

| Permission                      | Description                        | Roles par défaut         |
| ------------------------------- | ---------------------------------- | ------------------------ |
| `notifications.read.all`        | Voir toutes les notifs de l'org    | OWNER, ADMIN_HR, AUDITOR |
| `notifications.read.own`        | Voir ses propres notifs            | tous                     |
| `notifications.send`            | Insérer une notif manuelle (admin) | OWNER, ADMIN_HR          |
| `notifications.cancel`          | Annuler une notif PENDING          | OWNER                    |
| `notification_templates.read`   | Voir le catalogue templates        | OWNER, ADMIN_HR, AUDITOR |
| `notification_templates.update` | Modifier un template (V2 si UI)    | OWNER                    |

### 1.3 Variables d'environnement

```
RESEND_API_KEY=re_xxxxxxxxxxxxx           # déjà set (SMTP custom Supabase Auth)
RESEND_FROM_EMAIL=noreply@capiwise.com    # adresse from des emails métier
RESEND_FROM_NAME=Capiwise                 # nom from
RESEND_WEBHOOK_SECRET=whsec_xxx           # à set : secret signature svix
RESEND_REPLY_TO=support@capiwise.com      # optional reply-to
```

À configurer en cloud aussi via `supabase secrets set`.

---

## 2. SCHÉMA DB — FINALISATION

### 2.1 État actuel (Module 1 + Module 5)

Tables `notifications` et `notification_templates` créées Module 1. Module 5 insère déjà des rows. **Recon obligatoire** avant ALTER TABLE.

### 2.2 Recon attendue

```sql
-- État actuel des tables
\d notifications
\d notification_templates

-- Schema réel des colonnes
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name IN ('notifications','notification_templates')
 ORDER BY table_name, ordinal_position;

-- RLS policies
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE tablename IN ('notifications','notification_templates');

-- Templates déjà seedés (Module 5 en a peut-être ajouté)
SELECT code, channel, locale, is_active
  FROM notification_templates
 ORDER BY code;

-- Notifications PENDING actuelles (legacy de Module 5/6 jamais consommées)
SELECT template_code, channel, status, COUNT(*)
  FROM notifications
 WHERE status = 'PENDING'
 GROUP BY template_code, channel, status;

-- Permissions
SELECT code FROM permissions_catalog
 WHERE code LIKE 'notifications.%' OR code LIKE 'notification_templates.%';

-- pg_cron extension
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Cron jobs existants
SELECT jobid, jobname, schedule FROM cron.job;
```

Documenter les écarts (probablement les colonnes existent mais sont peut-être nommées différemment, et certaines permissions Module 1 utilisent peut-être des noms différents — pattern Module 6 B1).

### 2.3 Migration 00043 — Documents extension notifications

```sql
-- ============================================================
-- MODULE 7 B1 — Notifications schema finalization
-- ============================================================

-- notifications : extension pour Resend tracking
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS resend_email_id TEXT,
  ADD COLUMN IF NOT EXISTS resend_response JSONB,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Si la colonne provider_message_id existe déjà (Module 1),
-- on l'utilise comme alias. Sinon on garde resend_email_id
-- comme principal.

CREATE INDEX IF NOT EXISTS idx_notifications_pending_email
  ON notifications(status, channel, created_at)
  WHERE status = 'PENDING' AND channel = 'EMAIL';

CREATE INDEX IF NOT EXISTS idx_notifications_resend_id
  ON notifications(resend_email_id)
  WHERE resend_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(user_id, created_at)
  WHERE channel = 'IN_APP';

-- notification_templates : assure les colonnes V1
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS react_email_component TEXT, -- nom du composant React
  ADD COLUMN IF NOT EXISTS plain_text_template TEXT, -- version texte plain
  ADD COLUMN IF NOT EXISTS preview_text TEXT; -- text preview email client

-- Pour s'assurer qu'un template a bien (code, channel, locale) unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_templates_code_channel_locale
  ON notification_templates(code, channel, locale)
  WHERE is_active = true;
```

### 2.4 Migration 00044 — Seed 6 templates V1

```sql
-- ============================================================
-- Seed 6 templates V1 (FR, channel=EMAIL)
-- ============================================================

INSERT INTO notification_templates (
  code, channel, locale, subject, body_template,
  available_variables, react_email_component, preview_text, is_active
)
VALUES
  (
    'approval_pending',
    'EMAIL',
    'fr-FR',
    'Action requise : approbation d''attribution {{award_number}}',
    'Bonjour, vous avez une décision en attente sur Capiwise...',  -- fallback HTML
    '{"recipient_name":"text","award_number":"text","award_units":"number","award_plan_type":"text","creator_name":"text","app_url":"text","approval_url":"text"}'::jsonb,
    'ApprovalPendingEmail',
    'Une attribution attend votre approbation',
    true
  ),
  (
    'approval_approved',
    'EMAIL',
    'fr-FR',
    'Attribution {{award_number}} approuvée',
    'Bonjour, votre proposition d''attribution a été approuvée...',
    '{"recipient_name":"text","award_number":"text","approver_name":"text","app_url":"text","award_url":"text"}'::jsonb,
    'ApprovalApprovedEmail',
    'Votre proposition a été approuvée',
    true
  ),
  (
    'approval_rejected',
    'EMAIL',
    'fr-FR',
    'Attribution {{award_number}} refusée',
    'Bonjour, votre proposition d''attribution a été refusée...',
    '{"recipient_name":"text","award_number":"text","approver_name":"text","reason":"text","app_url":"text","award_url":"text"}'::jsonb,
    'ApprovalRejectedEmail',
    'Votre proposition a été refusée',
    true
  ),
  (
    'award_granted',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : votre attribution {{plan_type}} est active',
    'Bonjour, votre attribution est désormais active...',
    '{"beneficiary_name":"text","org_name":"text","award_number":"text","plan_type":"text","units":"number","exercise_price":"number","grant_date":"date","portal_url":"text"}'::jsonb,
    'AwardGrantedEmail',
    'Votre attribution est désormais active',
    true
  ),
  (
    'team_member_invite',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : vous êtes invité à rejoindre l''équipe',
    'Bonjour, vous avez été invité par {{inviter_name}}...',
    '{"recipient_name":"text","inviter_name":"text","inviter_email":"text","org_name":"text","accept_url":"text","expires_at_human":"text","custom_message":"text"}'::jsonb,
    'TeamMemberInviteEmail',
    'Invitation à rejoindre une équipe Capiwise',
    true
  ),
  (
    'beneficiary_first_invite',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : consultez votre attribution',
    'Bonjour, {{org_name}} vous invite à consulter votre attribution...',
    '{"beneficiary_name":"text","org_name":"text","accept_url":"text","expires_at_human":"text"}'::jsonb,
    'BeneficiaryFirstInviteEmail',
    'Consultez votre attribution',
    true
  )
ON CONFLICT (code, channel, locale) WHERE is_active = true
DO UPDATE SET
  subject = EXCLUDED.subject,
  available_variables = EXCLUDED.available_variables,
  react_email_component = EXCLUDED.react_email_component,
  preview_text = EXCLUDED.preview_text,
  updated_at = now();
```

### 2.5 Migration 00045 — Seed permissions

```sql
INSERT INTO permissions_catalog (code, description) VALUES
  ('notifications.read.all', 'Voir toutes les notifications de l''organisation'),
  ('notifications.read.own', 'Voir ses propres notifications'),
  ('notifications.send', 'Insérer une notification manuelle'),
  ('notifications.cancel', 'Annuler une notification PENDING'),
  ('notification_templates.read', 'Lire le catalogue de templates'),
  ('notification_templates.update', 'Modifier un template')
ON CONFLICT (code) DO NOTHING;

-- Mapping role-permissions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'notifications.read.all'),
  ('OWNER', 'notifications.send'),
  ('OWNER', 'notifications.cancel'),
  ('OWNER', 'notification_templates.read'),
  ('OWNER', 'notification_templates.update'),
  ('ADMIN_HR', 'notifications.read.all'),
  ('ADMIN_HR', 'notifications.send'),
  ('ADMIN_HR', 'notification_templates.read'),
  ('AUDITOR', 'notifications.read.all'),
  ('AUDITOR', 'notification_templates.read'),
  ('APPROVER', 'notifications.read.own'),
  ('BENEFICIARY', 'notifications.read.own')
ON CONFLICT DO NOTHING;
```

### 2.6 Migration 00046 — Cron job consumer

```sql
-- pg_cron : appelle l'Edge Function notifications-consumer toutes les 30s
SELECT cron.schedule(
  'notifications-consumer-tick',
  '*/1 * * * *',  -- chaque minute (Supabase pg_cron min granularité 1 min)
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notifications-consumer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Cron cleanup nocturne (purge notifications > 90 jours)
SELECT cron.schedule(
  'notifications-cleanup',
  '0 3 * * *',  -- 03:00 UTC daily
  $$
  DELETE FROM notifications
   WHERE created_at < now() - interval '90 days'
     AND status IN ('SENT','DELIVERED','FAILED','BOUNCED');
  $$
);
```

> **⚠️ Note** : la URL avec project_ref doit être substituée. Voir §10 instructions Claude Code.
>
> Si le pattern via pg_cron + http_post ne fonctionne pas (selon plan Supabase), fallback : déclenchement via Supabase Database Webhook ou via cron externe. Documenter le choix.

### 2.7 RLS policies

```sql
-- notifications : un user voit ses propres notifs
CREATE POLICY notifications_select_own ON notifications FOR SELECT
  USING (
    user_id = auth.uid()
    OR (org_id = current_org_id() AND user_has_permission('notifications.read.all'))
  );

CREATE POLICY notifications_insert_admin ON notifications FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('notifications.send')
  );

-- Pas de DELETE direct (cleanup via cron service_role)

-- notification_templates : org-wide read
CREATE POLICY notification_templates_select ON notification_templates FOR SELECT
  USING (
    is_active = true
    AND user_has_permission('notification_templates.read')
  );
```

---

## 3. CLIENT RESEND

### 3.1 Installation

```bash
pnpm -F web add resend @react-email/components @react-email/render
pnpm -F web add -D react-email
```

### 3.2 Configuration

`apps/web/src/lib/resend/client.ts` :

```typescript
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL!;
const FROM_NAME = process.env.RESEND_FROM_NAME ?? 'Capiwise';
const REPLY_TO = process.env.RESEND_REPLY_TO ?? FROM_EMAIL;

if (!RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY env var missing');
}

export const resend = new Resend(RESEND_API_KEY);

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
}): Promise<{ id: string }> {
  const result = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    tags: opts.tags,
    replyTo: opts.replyTo ?? REPLY_TO,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return { id: result.data!.id };
}
```

### 3.3 Renderer template

`apps/web/src/lib/resend/render.ts` :

```typescript
import { render } from '@react-email/render';
import {
  ApprovalPendingEmail,
  ApprovalApprovedEmail,
  ApprovalRejectedEmail,
  AwardGrantedEmail,
  TeamMemberInviteEmail,
  BeneficiaryFirstInviteEmail,
} from './templates';

const TEMPLATE_MAP = {
  ApprovalPendingEmail,
  ApprovalApprovedEmail,
  ApprovalRejectedEmail,
  AwardGrantedEmail,
  TeamMemberInviteEmail,
  BeneficiaryFirstInviteEmail,
} as const;

export type EmailComponentName = keyof typeof TEMPLATE_MAP;

export async function renderEmailTemplate(
  componentName: EmailComponentName,
  variables: Record<string, any>
): Promise<{ html: string; text: string }> {
  const Component = TEMPLATE_MAP[componentName];
  if (!Component) {
    throw new Error(`Unknown email component: ${componentName}`);
  }

  const html = await render(<Component {...variables} />);
  const text = await render(<Component {...variables} />, { plainText: true });

  return { html, text };
}
```

> **Note** : extraction du resolver dans un module no-JSX si tests Vitest l'exigent (pattern Module 6 B2 template-resolver). À évaluer en B2 selon l'install plugin React de PR #9.

### 3.4 Helper substitution variables subject

`apps/web/src/lib/resend/subject.ts` :

```typescript
export function renderSubject(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`;
  });
}
```

---

## 4. TEMPLATES REACT-EMAIL — 6 V1

Architecture :

```
apps/web/src/lib/resend/
├── client.ts
├── render.tsx
├── subject.ts
└── templates/
    ├── index.ts                          (re-export)
    ├── components/                       (composants partagés)
    │   ├── EmailLayout.tsx               (header + footer + safe defaults)
    │   ├── EmailButton.tsx
    │   ├── EmailHeader.tsx
    │   ├── EmailFooter.tsx
    │   └── EmailDivider.tsx
    ├── ApprovalPendingEmail.tsx
    ├── ApprovalApprovedEmail.tsx
    ├── ApprovalRejectedEmail.tsx
    ├── AwardGrantedEmail.tsx
    ├── TeamMemberInviteEmail.tsx
    └── BeneficiaryFirstInviteEmail.tsx
```

### 4.1 Composants partagés

`apps/web/src/lib/resend/templates/components/EmailLayout.tsx` :

```tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Tailwind,
} from '@react-email/components';

interface Props {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans">
          <Container className="mx-auto my-8 max-w-xl rounded-lg bg-white p-8">
            <Section>
              <Text className="text-xl font-bold text-slate-900">Capiwise</Text>
            </Section>
            <Hr className="my-4 border-slate-200" />
            <Section>{children}</Section>
            <Hr className="my-6 border-slate-200" />
            <Section>
              <Text className="text-xs text-slate-500">
                Capiwise · Plateforme de gestion d'actionnariat salarié.
                <br />
                Cet email vous a été envoyé suite à une activité sur votre compte.
                <br />
                Pour toute question, contactez support@capiwise.com.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
```

`EmailButton.tsx`, `EmailHeader.tsx`, `EmailFooter.tsx` à coder dans le même style. Sobre, blanc/slate, pas de couleurs flashy.

### 4.2 Template `ApprovalPendingEmail`

```tsx
import { Heading, Text, Section } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { EmailButton } from './components/EmailButton';

interface Props {
  recipient_name: string;
  award_number: string;
  award_units: number;
  award_plan_type: string;
  creator_name: string;
  app_url: string;
  approval_url: string;
}

export function ApprovalPendingEmail(props: Props) {
  return (
    <EmailLayout preview="Une attribution attend votre approbation">
      <Heading className="text-lg font-bold text-slate-900">Action requise : approbation</Heading>

      <Text className="leading-relaxed text-slate-700">Bonjour {props.recipient_name},</Text>

      <Text className="leading-relaxed text-slate-700">
        Une nouvelle attribution attend votre approbation :
      </Text>

      <Section className="my-4 rounded bg-slate-50 p-4">
        <Text className="m-0 text-sm text-slate-600">
          <strong>Numéro :</strong> {props.award_number}
        </Text>
        <Text className="m-0 text-sm text-slate-600">
          <strong>Type :</strong> {props.award_plan_type}
        </Text>
        <Text className="m-0 text-sm text-slate-600">
          <strong>Quantité :</strong> {props.award_units.toLocaleString('fr-FR')}
        </Text>
        <Text className="m-0 text-sm text-slate-600">
          <strong>Proposé par :</strong> {props.creator_name}
        </Text>
      </Section>

      <Section className="my-6 text-center">
        <EmailButton href={props.approval_url}>Examiner l'attribution</EmailButton>
      </Section>

      <Text className="text-xs text-slate-500">
        Si vous ne pouvez pas cliquer sur le bouton, copiez cette URL : {props.approval_url}
      </Text>
    </EmailLayout>
  );
}

export default ApprovalPendingEmail;
```

### 4.3 5 autres templates — suivre le même pattern

- `ApprovalApprovedEmail` : "Votre proposition a été approuvée par X."
- `ApprovalRejectedEmail` : "Votre proposition a été refusée par X. Raison : Y."
- `AwardGrantedEmail` : "Bonjour {beneficiary_name}, votre attribution {plan_type} est désormais active. {units} unités, prix d'exercice {exercise_price}€. Lien portail."
- `TeamMemberInviteEmail` : "Vous êtes invité par {inviter} à rejoindre {org}. Bouton accepter."
- `BeneficiaryFirstInviteEmail` : "Vous êtes attributaire d'un plan chez {org}. Cliquez pour découvrir."

Tous suivent le même squelette : EmailLayout > Heading > Text > Section bg-slate-50 (récap data) > EmailButton.

### 4.4 Tests Vitest sur templates

`apps/web/src/lib/resend/__tests__/templates.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { renderEmailTemplate } from '../render';

describe('renderEmailTemplate', () => {
  it('ApprovalPendingEmail renders with all variables', async () => {
    const { html, text } = await renderEmailTemplate('ApprovalPendingEmail', {
      recipient_name: 'Jean Dupont',
      award_number: 'AWD-2026-0001',
      award_units: 1500,
      award_plan_type: 'BSPCE',
      creator_name: 'Alice Martin',
      app_url: 'https://capiwise.com',
      approval_url: 'https://capiwise.com/approvals/123',
    });

    expect(html).toContain('Jean Dupont');
    expect(html).toContain('AWD-2026-0001');
    expect(html).toContain('BSPCE');
    expect(html).toContain('1\u00a0500'); // formatNumber espace insécable
    expect(text).toContain('Alice Martin');
  });

  it('throws on unknown template', async () => {
    await expect(renderEmailTemplate('UnknownTemplate' as any, {})).rejects.toThrow(
      'Unknown email component',
    );
  });

  // ... 5 tests similaires pour les autres templates
});
```

Cible : 12-15 tests templates.

---

## 5. CONSUMER EDGE FUNCTION

### 5.1 Architecture

`supabase/functions/notifications-consumer/index.ts` :

Le consumer est appelé par cron toutes les 30s-1min. Il :

1. Lock une batch de N notifications PENDING (FOR UPDATE SKIP LOCKED)
2. Pour chaque : load template → render → Resend send
3. Update status SENT ou FAILED

### 5.2 Pseudo-code

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
const FROM = `${Deno.env.get('RESEND_FROM_NAME') ?? 'Capiwise'} <${Deno.env.get('RESEND_FROM_EMAIL')}>`;
const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  const startTime = Date.now();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // 1. Lock + fetch batch
    const { data: batch, error: lockError } = await supabase.rpc('lock_pending_notifications', {
      p_batch_size: BATCH_SIZE,
    });

    if (lockError) throw lockError;
    if (!batch || batch.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Process each in parallel (with concurrency limit)
    const results = await Promise.allSettled(
      batch.map(async (notif: any) => {
        processed++;
        try {
          // Render template
          const { html, text, subject } = await renderNotification(notif);

          // Resend send
          const result = await resend.emails.send({
            from: FROM,
            to: notif.recipient_email,
            subject,
            html,
            text,
            tags: [
              { name: 'template', value: notif.template_code },
              { name: 'org_id', value: notif.org_id },
            ],
          });

          if (result.error) throw new Error(result.error.message);

          // Update SENT
          await supabase
            .from('notifications')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
              resend_email_id: result.data!.id,
              resend_response: result.data,
              subject,
              body: html, // snapshot pour audit
            })
            .eq('id', notif.id);

          succeeded++;
          return { id: notif.id, success: true };
        } catch (err: any) {
          // Update FAILED
          failed++;
          await supabase
            .from('notifications')
            .update({
              status: 'FAILED',
              failed_at: new Date().toISOString(),
              failure_reason: err.message,
              retry_count: (notif.retry_count ?? 0) + 1,
              last_retry_at: new Date().toISOString(),
            })
            .eq('id', notif.id);

          return { id: notif.id, success: false, error: err.message };
        }
      }),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        succeeded,
        failed,
        duration_ms: Date.now() - startTime,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err: any) {
    console.error('Consumer error:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function renderNotification(notif: any) {
  // Load template
  const { data: template } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('code', notif.template_code)
    .eq('channel', 'EMAIL')
    .eq('locale', 'fr-FR')
    .eq('is_active', true)
    .single();

  if (!template) {
    throw new Error(`Template not found: ${notif.template_code}`);
  }

  // Render via inline templates (Deno can import the same react-email components if
  // we deploy them to deno-compatible URL OR we re-implement minimal HTML inline
  // here — see §5.3)

  // Subject substitution
  const subject = renderSubjectInline(template.subject, notif.variables_used);
  const html = renderHtmlInline(template.react_email_component, notif.variables_used);
  const text = renderTextInline(template.react_email_component, notif.variables_used);

  return { html, text, subject };
}
```

### 5.3 Décision : où rendre les emails ?

**Problème** : react-email tourne en Node, pas en Deno. Deux options :

**Option A — Render côté Next.js, stocker le HTML dans la notif row**
Quand Module 5 insère une notif, il pré-render le HTML via Server Action et le stocke dans `notifications.body`. Le consumer lit juste `body` et `subject` et envoie.

- Avantage : utilise le code react-email proprement
- Inconvénient : décorrèle template_code et rendu (si template change, anciens HTML obsolètes)

**Option B — Render côté Deno avec implémentation minimaliste HTML inline**
Le consumer a son propre rendering minimaliste (template strings HTML inline) qui dupplique partiellement react-email.

- Avantage : seul lieu de vérité
- Inconvénient : 2 rendering paths à maintenir

**Décision recommandée : Option A.**

Pratiquement :

- Module 5/6 inserent notif PENDING avec `subject=NULL`, `body=NULL`, `variables_used=...`
- Une Server Action `renderPendingNotifications()` est appelée par Module 5/6 juste après insertion (ou par un trigger côté Module 5/6) pour pré-render et fill subject/body
- Le consumer lit subject/body et envoie

Migration nécessaire : trigger `before_insert_notifications` qui appelle un RPC `render_notification(template_code, variables)` qui appelle le rendering Node via... hmm, ça ne marche pas en Deno trigger.

**Décision finale : Option A modifiée — render côté Next.js Server Action au moment d'insertion**.

Module 5/6 doivent appeler `insertNotificationWithRender()` qui :

1. Render via react-email
2. INSERT notification avec subject + body filled
3. Status='PENDING'

Le consumer lit juste subject + body, pas besoin de re-rendre.

### 5.4 Server Action `insertNotificationWithRender`

`apps/web/src/server/actions/notifications.ts` :

```typescript
'use server';

import { renderEmailTemplate } from '@/lib/resend/render';
import { renderSubject } from '@/lib/resend/subject';
import { createServerSupabase } from '@/lib/supabase/server';

export async function insertNotificationWithRender(input: {
  orgId: string;
  userId?: string;
  beneficiaryId?: string;
  recipientEmail: string;
  templateCode: string;
  variables: Record<string, any>;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<{ ok: true; notificationId: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabase();

  // Load template metadata
  const { data: template } = await supabase
    .from('notification_templates')
    .select('subject, react_email_component')
    .eq('code', input.templateCode)
    .eq('channel', 'EMAIL')
    .eq('locale', 'fr-FR')
    .eq('is_active', true)
    .single();

  if (!template) {
    return { ok: false, error: `Template not found: ${input.templateCode}` };
  }

  // Render
  const subject = renderSubject(template.subject, input.variables);
  const { html, text } = await renderEmailTemplate(
    template.react_email_component as any,
    input.variables,
  );

  // Insert
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      beneficiary_id: input.beneficiaryId,
      recipient_email: input.recipientEmail,
      template_code: input.templateCode,
      channel: 'EMAIL',
      subject,
      body: html,
      variables_used: input.variables,
      status: 'PENDING',
      related_entity_type: input.relatedEntityType,
      related_entity_id: input.relatedEntityId,
      provider: 'RESEND',
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, notificationId: data.id };
}
```

### 5.5 RPC `lock_pending_notifications`

```sql
CREATE OR REPLACE FUNCTION lock_pending_notifications(
  p_batch_size INTEGER DEFAULT 50
)
RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    UPDATE notifications
       SET status = 'SENDING',
           last_retry_at = now()
     WHERE id IN (
       SELECT id FROM notifications
        WHERE status = 'PENDING'
          AND channel = 'EMAIL'
          AND recipient_email IS NOT NULL
          AND subject IS NOT NULL  -- exclu les non-rendered
          AND body IS NOT NULL
          AND retry_count < 5  -- max 5 retries
        ORDER BY created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
END $$;

GRANT EXECUTE ON FUNCTION lock_pending_notifications(INTEGER) TO service_role;
```

> **⚠️ Note** : ajout d'un état intermédiaire `SENDING` pour éviter qu'une exécution simultanée du consumer pickup les mêmes rows. Migration nécessaire pour ajouter `SENDING` dans le check constraint si présent.

---

## 6. WEBHOOK RESEND

### 6.1 Edge Function

`supabase/functions/resend-webhook/index.ts` :

Pattern v6 Module 6 yousign-webhook adapté :

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/svix@1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  // 1. Get raw body for HMAC
  const body = await req.text();
  const headers = Object.fromEntries(req.headers);

  // 2. Verify svix signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let payload;
  try {
    payload = wh.verify(body, headers) as any;
  } catch (err) {
    console.warn('Resend webhook HMAC verification failed:', err);
    return new Response('Invalid signature', { status: 401 });
  }

  // 3. Pre-check idempotency
  const eventType = payload.type; // 'email.delivered', 'email.bounced', etc.
  const emailId = payload.data?.email_id;

  if (!emailId) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no email_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Check current status (idempotent)
  const { data: notif } = await supabase
    .from('notifications')
    .select('id, status')
    .eq('resend_email_id', emailId)
    .single();

  if (!notif) {
    console.warn(`Notification not found for resend_email_id ${emailId}`);
    return new Response(JSON.stringify({ ok: true, skipped: 'not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Ack 200 immédiat + process en background
  EdgeRuntime.waitUntil(processWebhook(payload, notif.id));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function processWebhook(payload: any, notificationId: string) {
  const eventType = payload.type;
  const eventData = payload.data;

  let updates: Record<string, any> = {};

  if (eventType === 'email.delivered') {
    updates = {
      status: 'DELIVERED',
      delivered_at: eventData.created_at ?? new Date().toISOString(),
    };
  } else if (eventType === 'email.bounced') {
    updates = {
      status: 'BOUNCED',
      failure_reason: `Bounced: ${eventData.bounce?.message ?? 'unknown'}`,
    };
  } else if (eventType === 'email.complained') {
    updates = {
      status: 'COMPLAINED',
      failure_reason: 'Spam complaint received',
    };
  } else if (eventType === 'email.opened') {
    // V2 — pour l'instant on ignore
    return;
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('notifications').update(updates).eq('id', notificationId);
  }
}
```

### 6.2 Configuration Resend Dashboard

```
1. Resend Dashboard → Webhooks → Add Endpoint
2. URL : https://YOUR_PROJECT_REF.supabase.co/functions/v1/resend-webhook
3. Events à écouter :
   - email.delivered
   - email.bounced
   - email.complained
   - (V2 : email.opened)
4. Save → Resend génère un signing secret
5. Note ce secret → set en supabase secrets :
   supabase secrets set RESEND_WEBHOOK_SECRET="whsec_..." --linked
```

---

## 7. HOOKS DANS MODULES 5 ET 6

### 7.1 Module 5 — `start_approval_workflow`

Le RPC actuel insère déjà des notifications PENDING (cf Module 5 B2). Mais avec subject=NULL et body=NULL — il faut les filler via Server Action TypeScript après l'insert.

**Adaptation Module 5** :

Dans `recordDecisionInternal` (Module 5 + B5 hook M6 déjà), juste après le `start_approval_workflow` RPC :

```typescript
// Charger les notifications fraîchement insérées (status=PENDING, subject=NULL)
const { data: pendingNotifs } = await supabase
  .from('notifications')
  .select('id, recipient_email, template_code, variables_used')
  .eq('related_entity_id', requestId)
  .eq('related_entity_type', 'approval_request')
  .is('subject', null);

// Render et update chaque notif
for (const notif of pendingNotifs ?? []) {
  await renderAndFillNotification(notif.id);
}
```

Ou mieux : faire ça dans un trigger côté Module 5 avant insert.

**Décision pratique** : ajouter un nouveau Server Action `renderAndFillNotification(id)` qui charge la notif, render via react-email, et fait l'UPDATE.

### 7.2 Module 6 — Hook signature complete

Dans le RPC `complete_signature_request` (Module 6 B1), insérer une notif `award_granted` :

```sql
INSERT INTO notifications (
  org_id, beneficiary_id, recipient_email,
  template_code, channel, status, variables_used,
  related_entity_type, related_entity_id, provider
)
SELECT
  v_request.org_id,
  a.beneficiary_id,
  b.email,
  'award_granted',
  'EMAIL',
  'PENDING',
  jsonb_build_object(
    'beneficiary_name', b.full_name,
    'org_name', o.name,
    'award_number', a.award_number,
    'plan_type', p.plan_type,
    'units', a.units_granted,
    'exercise_price', a.exercise_price,
    'grant_date', a.grant_date,
    'portal_url', 'https://capiwise.com/portal/awards/' || a.id
  ),
  'award',
  a.id,
  'RESEND'
FROM awards a
  JOIN beneficiaries b ON b.id = a.beneficiary_id
  JOIN plans p ON p.id = a.plan_id
  JOIN organizations o ON o.id = a.org_id
WHERE a.id = v_award_id;
```

Le subject/body seront rendered juste après par la même Server Action `renderAndFillNotification` appelée par l'EF webhook Yousign après transition GRANTED.

### 7.3 Hook — Module 2 invitations

Module 2 a probablement déjà `createInvitation` Server Action qui insère une notif `team_member_invite` ou `beneficiary_first_invite`. Adapter pour que ça utilise `insertNotificationWithRender`.

---

## 8. UI — PAGES

### 8.1 Sandbox `/dev/notifications`

Pour tester en local :

- Liste des derniers 50 notifs
- Bouton "Test send" : sélectionne template + entre email + envoie
- Status badges
- Lien vers Resend Dashboard external pour drill-down

### 8.2 Page admin `/dashboard/settings/notifications`

- Stats globales : sent (J-7), delivered, bounced, failed
- Filtres : template, status, date
- Tableau dernières notifs avec actions (resend, cancel)
- Lien vers les templates seedés (read-only V1)

### 8.3 Inbox in-app (placeholder V1)

Badge dans la sidebar indiquant le nombre de notifs in-app non lues. Pas d'inbox UI complet V1 — juste compteur. Module 8 fera l'inbox complet.

---

## 9. PLAN DE LIVRAISON — 5 SOUS-MODULES

### B1 — DB & Templates seed (1 jour)

- Recon Module 1 + Module 5 état notifications
- 4 migrations : extend tables (00043), seed 6 templates (00044), permissions (00045), cron (00046)
- 1 RPC `lock_pending_notifications`
- 8 tests SQL purs
- **Livrable** : DB prête, 6 templates seedés, cron jobs schedulés

### B2 — Templates react-email (1 jour)

- Install resend + react-email
- 6 composants templates + 4 composants partagés (EmailLayout, etc.)
- Helper render.tsx + subject.ts
- Server Action insertNotificationWithRender
- 12-15 tests Vitest
- **Livrable** : tous templates render proprement avec variables

### B3 — Consumer Edge Function + cron (1 jour)

- Edge Function notifications-consumer
- Test E2E manuel : insert notif PENDING → consumer → email reçu
- Logs Edge Function pour debugging
- **Livrable** : flow PENDING → SENT fonctionnel

### B4 — Webhook Resend Edge Function (0.5 jour)

- Edge Function resend-webhook (pattern v6)
- HMAC svix verification
- Update notifications status DELIVERED/BOUNCED
- Test E2E manuel : email envoyé → webhook reçu → status DELIVERED
- **Livrable** : tracking delivery complet

### B5 — Hooks Module 5/6 + UI sandbox + closure (0.5 jour)

- Vérifier hooks Module 5/6 fonctionnent (Module 5 doit appeler render après insert)
- Sandbox /dev/notifications
- Page admin /dashboard/settings/notifications (read-only)
- Tests E2E manuels complets
- Memory closure + merge PR #10
- **Livrable** : Module 7 mergé sur master

**Total estimé : 4 jours**

---

## 10. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_6_complete.md` + `memory/module_7_resend_webhook_pattern.md` pour réutiliser le pattern v6
2. Branche `feat/module-7-notifications` from master à jour (post PR #9)
3. Pre-checks :
   - Tests workspace 233/233 verts
   - Drift cloud 42/42
   - Resend SMTP custom déjà configuré dans Supabase Auth (pas à toucher)

### Phase 2 — Recon (B1)

- Pattern obligatoire (Module 4/5/6 B1) :
  - État `notifications` columns
  - État `notification_templates` columns
  - Templates déjà seedés (peut-être 1-2 par Module 5)
  - Permissions existantes
  - pg_cron extension
  - Notifications PENDING orphelines (legacy Module 5 jamais consommées)

### Phase 3 — Migrations B1

- Suivre §2.3 à §2.7
- Cron pg_cron : substituer `YOUR_PROJECT_REF` par le vrai project_ref Supabase
- Si pg_cron + http_post ne marche pas : fallback documenté
- 8 tests SQL purs après chaque migration

### Phase 4 — Templates B2

- Install + Composants + 6 templates V1
- Cible 12-15 tests Vitest
- Valider visuellement avec react-email preview server (`pnpm react-email dev`) si possible

### Phase 5 — Consumer B3

- EF deploy via supabase CLI
- Configurer secrets (RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME)
- Test E2E : insert manuel d'une notif PENDING → cron tick → email reçu

### Phase 6 — Webhook B4

- Pattern v6 yousign-webhook adapté (svix au lieu de HMAC SHA256)
- Configurer webhook côté Resend Dashboard
- Test E2E : envoyer email → webhook reçu → notif=DELIVERED

### Phase 7 — Hooks + UI B5

- Adapter Module 5 recordDecisionInternal pour appeler renderAndFillNotification
  après insert
- Adapter Module 6 RPCs pour insert notif `award_granted` post-signature
- Sandbox + page admin
- Tests E2E flows complets
- Memory closure + merge

### Conventions strictes (rappel)

- 'use server' = uniquement async
- Pattern Result strict
- Validation Zod
- Audit log systématique
- HMAC sur webhooks
- Pattern v6 Edge Function (waitUntil + idempotency check)

### Points de vigilance

- **Resend SMTP custom Supabase Auth** : ne pas toucher, c'est déjà configuré
- **Domaine Resend vérifié** : confirmer côté ops avant B3
- **Webhook Resend secret** : différent du Supabase Auth SMTP cred. À set via
  supabase secrets après config Dashboard
- **Limite Resend free** : 100 emails/jour. Surveiller si besoin upgrade
- **Idempotence consumer** : status='SENDING' intermédiaire évite double-send
- **Retry strategy** : retry_count max 5 puis status='FAILED' permanent
- **Pas de spam** : V1 envoie 1 email par event. Pas de digest. Pas de batching
  par destinataire

---

**FIN DU MODULE 7 — NOTIFICATIONS RESEND**

_Quand le Module 7 est mergé sur master, reviens vers Claude (chat) pour "go module 8" (Beneficiary Portal)._
