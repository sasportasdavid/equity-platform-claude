import { renderEmailTemplate } from '@/lib/resend/render';
import { MODULE_7_TEMPLATE_CODES } from '@/lib/resend/templates';
import { Sandbox } from './sandbox';
import { SAMPLE_VARS } from './sample-vars';

export const metadata = { title: 'Dev — Notifications' };

/**
 * Sandbox /dev/notifications — Module 7 B2.
 *
 * Pré-render les 6 templates Module 7 en parallèle côté Server Component
 * (avec SAMPLE_VARS factices), passe les HTML au Client Component pour
 * affichage iframe + extracts visuels (subject, plain text).
 *
 * Pas de send réel — c'est l'EF consumer (B3) qui le fera.
 */
export default async function Page() {
  const renders = await Promise.all(
    MODULE_7_TEMPLATE_CODES.map(async (code) => {
      try {
        const r = await renderEmailTemplate(code, SAMPLE_VARS[code] as never);
        return { code, ok: true as const, ...r };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        return { code, ok: false as const, error: msg };
      }
    }),
  );

  return <Sandbox renders={renders} />;
}
