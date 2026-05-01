import { describe, expect, it } from 'vitest';
import { renderSubject } from '../subject';

describe('renderSubject', () => {
  it('substitue une variable simple', () => {
    expect(renderSubject('Hello {{name}}', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('substitue plusieurs variables', () => {
    expect(
      renderSubject('Action requise : approbation d{{quote}}attribution {{award_number}}', {
        quote: "'",
        award_number: 'AWD-2026-0042',
      }),
    ).toBe("Action requise : approbation d'attribution AWD-2026-0042");
  });

  it('coerce les number en string', () => {
    expect(renderSubject('Award {{n}}', { n: 1500 })).toBe('Award 1500');
  });

  it('garde {{var}} si variable absente (debug visuel)', () => {
    expect(renderSubject('Missing {{x}}', {})).toBe('Missing {{x}}');
  });

  it('garde {{var}} si variable null/undefined', () => {
    expect(renderSubject('Null {{x}}', { x: null })).toBe('Null {{x}}');
    expect(renderSubject('Undef {{x}}', { x: undefined })).toBe('Undef {{x}}');
  });

  it('tolère les espaces autour du nom de variable', () => {
    expect(renderSubject('Trim {{ name }}', { name: 'Alice' })).toBe('Trim Alice');
  });

  it('aucune substitution si pas de placeholder', () => {
    expect(renderSubject('Hello world', { name: 'Alice' })).toBe('Hello world');
  });
});
