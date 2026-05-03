import { describe, expect, it } from 'vitest';
import {
  LEAVER_TYPE_LABELS_FR,
  TREATMENT_LABELS_FR,
  getAvailableLeaverTypes,
  getLeaverTypeLabel,
  getTreatmentDescription,
  getTreatmentLabel,
  getTreatmentTone,
} from '../leavers';

describe('LEAVER_TYPE_LABELS_FR', () => {
  it('contient les 8 leaver_types observés en DB (recon B4)', () => {
    const expected = [
      'resignation',
      'retirement',
      'death',
      'company_sale',
      'mutual_agreement',
      'end_of_contract',
      'termination_cause',
      'termination_no_cause',
    ];
    for (const key of expected) {
      expect(LEAVER_TYPE_LABELS_FR[key]).toBeTruthy();
    }
  });
});

describe('TREATMENT_LABELS_FR', () => {
  it('contient les 5 treatments DB', () => {
    expect(Object.keys(TREATMENT_LABELS_FR).sort()).toEqual([
      'accelerate',
      'forfeit_all',
      'full_accelerate',
      'keep_vested',
      'pro_rata',
    ]);
  });
});

describe('getLeaverTypeLabel', () => {
  it('retourne le label FR pour un type connu', () => {
    expect(getLeaverTypeLabel('resignation')).toBe('Démission');
    expect(getLeaverTypeLabel('company_sale')).toBe('Cession de la société');
    expect(getLeaverTypeLabel('termination_no_cause')).toBe('Licenciement (sans faute)');
  });

  it('retourne le code brut pour un type inconnu (graceful fallback)', () => {
    expect(getLeaverTypeLabel('unknown_type')).toBe('unknown_type');
  });

  it('retourne em-dash pour null/undefined/empty', () => {
    expect(getLeaverTypeLabel(null)).toBe('—');
    expect(getLeaverTypeLabel(undefined)).toBe('—');
    expect(getLeaverTypeLabel('')).toBe('—');
  });
});

describe('getTreatmentLabel', () => {
  it('retourne le label FR pour un treatment connu', () => {
    expect(getTreatmentLabel('forfeit_all')).toMatch(/perdues/i);
    expect(getTreatmentLabel('keep_vested')).toMatch(/conservez/i);
    expect(getTreatmentLabel('full_accelerate')).toMatch(/accélérée totale/i);
  });

  it('retourne le code brut pour un treatment inconnu', () => {
    expect(getTreatmentLabel('mystery')).toBe('mystery');
  });
});

describe('getTreatmentDescription', () => {
  it('retourne une description pour chaque treatment connu', () => {
    expect(getTreatmentDescription('forfeit_all')).toMatch(/perdez/i);
    expect(getTreatmentDescription('full_accelerate')).toMatch(/immédiatement/i);
  });

  it('retourne une chaîne vide pour null/empty/unknown', () => {
    expect(getTreatmentDescription(null)).toBe('');
    expect(getTreatmentDescription('')).toBe('');
    expect(getTreatmentDescription('unknown')).toBe('');
  });
});

describe('getTreatmentTone', () => {
  it('forfeit_all → negative', () => {
    expect(getTreatmentTone('forfeit_all')).toBe('negative');
  });

  it('accelerate / full_accelerate → positive', () => {
    expect(getTreatmentTone('accelerate')).toBe('positive');
    expect(getTreatmentTone('full_accelerate')).toBe('positive');
  });

  it('keep_vested / pro_rata / unknown → neutral', () => {
    expect(getTreatmentTone('keep_vested')).toBe('neutral');
    expect(getTreatmentTone('pro_rata')).toBe('neutral');
    expect(getTreatmentTone('unknown')).toBe('neutral');
  });
});

describe('getAvailableLeaverTypes', () => {
  it('extrait les leaver_types depuis un snapshot valide', () => {
    const snap = [
      { leaver_type: 'resignation', treatment: 'keep_vested' },
      { leaver_type: 'death', treatment: 'full_accelerate' },
      { leaver_type: 'retirement', treatment: 'keep_vested' },
    ];
    expect(getAvailableLeaverTypes(snap)).toEqual(['resignation', 'death', 'retirement']);
  });

  it("dédoublonne en respectant l'ordre d'apparition", () => {
    const snap = [
      { leaver_type: 'resignation' },
      { leaver_type: 'death' },
      { leaver_type: 'resignation' },
    ];
    expect(getAvailableLeaverTypes(snap)).toEqual(['resignation', 'death']);
  });

  it('retourne un tableau vide si snapshot null/undefined/non-array', () => {
    expect(getAvailableLeaverTypes(null)).toEqual([]);
    expect(getAvailableLeaverTypes(undefined)).toEqual([]);
    expect(getAvailableLeaverTypes('garbage')).toEqual([]);
    expect(getAvailableLeaverTypes({})).toEqual([]);
  });

  it('ignore les rules sans leaver_type ou avec leaver_type non-string', () => {
    const snap = [
      { leaver_type: 'resignation' },
      { leaver_type: 42 }, // not a string
      { foo: 'bar' }, // missing leaver_type
      null,
      { leaver_type: 'death' },
    ];
    expect(getAvailableLeaverTypes(snap)).toEqual(['resignation', 'death']);
  });

  it('NE retourne PAS le treatment ni les acceleration_months (sécurité)', () => {
    const snap = [
      { leaver_type: 'resignation', treatment: 'forfeit_all', acceleration_months: 12 },
    ];
    const result = getAvailableLeaverTypes(snap);
    expect(result).toEqual(['resignation']);
    // result est un string[], pas d'objet — pas de leak possible
    expect(typeof result[0]).toBe('string');
  });
});
