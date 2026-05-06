import 'server-only';
import crypto from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { BspceGrantLetterTemplate } from './templates/BspceGrantLetterTemplate';
import { AgaGrantLetterTemplate } from './templates/AgaGrantLetterTemplate';
import { StockOptionGrantLetterTemplate } from './templates/StockOptionGrantLetterTemplate';
import { ExerciseNotificationTemplate } from './templates/ExerciseNotificationTemplate';
import { SubscriptionBulletinTemplate } from './templates/SubscriptionBulletinTemplate';
import {
  isExerciseTemplateCode,
  type AwardTemplateCode,
  type ExerciseTemplateCode,
  type TemplateCode,
} from './template-resolver';
import type { DocumentContext, DocumentContextExercise } from './types';

export {
  resolveTemplateCodeFromPlanType,
  SUPPORTED_TEMPLATE_CODES,
  SUPPORTED_AWARD_TEMPLATE_CODES,
  SUPPORTED_EXERCISE_TEMPLATE_CODES,
  isExerciseTemplateCode,
  type TemplateCode,
  type AwardTemplateCode,
  type ExerciseTemplateCode,
} from './template-resolver';

/**
 * Module 6 B2 + Module 9 B5 — Render serveur PDF.
 *
 * `renderToBuffer` doit être appelé UNIQUEMENT côté Server Action / Edge
 * Function (pas Client Component). Le `'server-only'` ci-dessus garantit
 * la build error si import dans un client component.
 *
 * 2 maps : AWARD (Module 6, shape DocumentContext) et EXERCISE (Module 9 B5,
 * shape DocumentContextExercise). Dispatch via `isExerciseTemplateCode`.
 */

const AWARD_TEMPLATE_MAP = {
  BSPCE_GRANT_LETTER: BspceGrantLetterTemplate,
  AGA_GRANT_LETTER: AgaGrantLetterTemplate,
  SO_GRANT_LETTER: StockOptionGrantLetterTemplate,
  // V1.1 PR #49 : RSU et BSA réutilisent les composants existants côté React
  // PDF (mécanique métier identique : RSU≈AGA, BSA≈SO). Métadonnées DB
  // distinctes via templates GLOBAL (migration 00103). À splitter en
  // composants dédiés si la lettre légale doit diverger.
  RSU_GRANT_LETTER: AgaGrantLetterTemplate,
  BSA_GRANT_LETTER: StockOptionGrantLetterTemplate,
} as const;

const EXERCISE_TEMPLATE_MAP = {
  EXERCISE_NOTIFICATION: ExerciseNotificationTemplate,
  SUBSCRIPTION_BULLETIN: SubscriptionBulletinTemplate,
} as const;

export type RenderResult = {
  buffer: Buffer;
  hash: string;
  size: number;
};

export async function renderPdfFromTemplate(
  templateCode: AwardTemplateCode,
  data: DocumentContext,
): Promise<RenderResult>;
export async function renderPdfFromTemplate(
  templateCode: ExerciseTemplateCode,
  data: DocumentContextExercise,
): Promise<RenderResult>;
export async function renderPdfFromTemplate(
  templateCode: TemplateCode,
  data: DocumentContext | DocumentContextExercise,
): Promise<RenderResult> {
  let element;
  if (isExerciseTemplateCode(templateCode)) {
    const Template = EXERCISE_TEMPLATE_MAP[templateCode];
    element = <Template data={data as DocumentContextExercise} />;
  } else {
    const Template = AWARD_TEMPLATE_MAP[templateCode as AwardTemplateCode];
    if (!Template) {
      throw new Error(`Unknown template code: ${templateCode}`);
    }
    element = <Template data={data as DocumentContext} />;
  }

  const buffer = await renderToBuffer(element);
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const hash = crypto.createHash('sha256').update(nodeBuffer).digest('hex');

  return { buffer: nodeBuffer, hash, size: nodeBuffer.length };
}
