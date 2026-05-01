/**
 * Module 7 B2 — Mustache-style subject substitution.
 *
 * Utilisé quand on a un template subject stocké en DB
 * (notification_templates.subject) avec des placeholders {{var}} et un
 * jsonb `variables_used` côté notification. Pure function, sans dépendance
 * React — peut tourner partout (Server Action, Edge Function, tests).
 *
 * Comportement :
 *   - Substitue chaque occurrence de {{var}} par variables[var]
 *   - Si var absent ou null/undefined, garde {{var}} pour debug visuel
 *   - Coerce les valeurs non-string via String() (number, date, etc.)
 *
 * Exemples :
 *   renderSubject('Hello {{name}}', { name: 'Alice' })       → 'Hello Alice'
 *   renderSubject('Award {{n}}', { n: 1500 })                 → 'Award 1500'
 *   renderSubject('Missing {{x}}', {})                        → 'Missing {{x}}'
 *   renderSubject('Trim {{ name }}', { name: 'Alice' })       → 'Trim Alice'
 */
export function renderSubject(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}
