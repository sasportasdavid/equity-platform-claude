import 'server-only';
import { render } from '@react-email/render';
import { createElement, type ReactElement } from 'react';
import { TEMPLATES, type TemplateCode, type TemplateMap } from './templates';

/**
 * Module 7 B2 — render helper code-keyed.
 *
 * Lookup TEMPLATES[code], rend HTML + plain text via @react-email/render.
 *
 * Async (la lib React Email v2 retourne des Promises). Server-only car
 * react-dom server est nécessaire au rendu.
 */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export async function renderEmailTemplate<K extends TemplateCode>(
  code: K,
  variables: TemplateMap[K],
): Promise<RenderedEmail> {
  const tpl = TEMPLATES[code];
  if (!tpl) {
    throw new Error(`Unknown template code: ${code as string}`);
  }
  const node: ReactElement = createElement(
    tpl.Component as (p: TemplateMap[K]) => ReactElement,
    variables,
  );
  const [html, text] = await Promise.all([
    render(node, { pretty: false }),
    render(node, { plainText: true }),
  ]);
  return {
    subject: tpl.subject(variables),
    html,
    text,
  };
}
