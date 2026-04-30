import 'server-only';
import crypto from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { BspceGrantLetterTemplate } from './templates/BspceGrantLetterTemplate';
import { AgaGrantLetterTemplate } from './templates/AgaGrantLetterTemplate';
import { StockOptionGrantLetterTemplate } from './templates/StockOptionGrantLetterTemplate';
import type { TemplateCode } from './template-resolver';
import type { DocumentContext } from './types';

export {
  resolveTemplateCodeFromPlanType,
  SUPPORTED_TEMPLATE_CODES,
  type TemplateCode,
} from './template-resolver';

/**
 * Module 6 B2 — Render serveur PDF.
 *
 * `renderToBuffer` doit être appelé UNIQUEMENT côté Server Action / Edge
 * Function (pas Client Component). Le `'server-only'` ci-dessus garantit
 * la build error si import dans un client component.
 *
 * Le helper pur `resolveTemplateCodeFromPlanType` est dans `./template-resolver.ts`
 * pour être testable en Vitest sans plugin React.
 */

const TEMPLATE_MAP = {
  BSPCE_GRANT_LETTER: BspceGrantLetterTemplate,
  AGA_GRANT_LETTER: AgaGrantLetterTemplate,
  SO_GRANT_LETTER: StockOptionGrantLetterTemplate,
} as const;

export type RenderResult = {
  buffer: Buffer;
  hash: string;
  size: number;
};

export async function renderPdfFromTemplate(
  templateCode: TemplateCode,
  data: DocumentContext,
): Promise<RenderResult> {
  const Template = TEMPLATE_MAP[templateCode];
  if (!Template) {
    throw new Error(`Unknown template code: ${templateCode}`);
  }

  const buffer = await renderToBuffer(<Template data={data} />);
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const hash = crypto.createHash('sha256').update(nodeBuffer).digest('hex');

  return { buffer: nodeBuffer, hash, size: nodeBuffer.length };
}
