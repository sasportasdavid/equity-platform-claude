/**
 * Liste minimale ISO 3166-1 alpha-2 pour le portail bénéficiaire.
 *
 * Couverture : pays UE 27 + UK + CH + NO + IS + 6 grandes destinations
 * tech (US, CA, IL, AU, NZ, JP) = 38 pays.
 *
 * Pour V2, remplacer par une liste exhaustive (~250 pays) ou un combobox
 * autocomplete.
 */
export const PORTAL_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'CH', name: 'Suisse' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'IE', name: 'Irlande' },
  { code: 'AT', name: 'Autriche' },
  { code: 'DK', name: 'Danemark' },
  { code: 'SE', name: 'Suède' },
  { code: 'FI', name: 'Finlande' },
  { code: 'NO', name: 'Norvège' },
  { code: 'IS', name: 'Islande' },
  { code: 'PL', name: 'Pologne' },
  { code: 'CZ', name: 'Tchéquie' },
  { code: 'SK', name: 'Slovaquie' },
  { code: 'HU', name: 'Hongrie' },
  { code: 'RO', name: 'Roumanie' },
  { code: 'BG', name: 'Bulgarie' },
  { code: 'GR', name: 'Grèce' },
  { code: 'HR', name: 'Croatie' },
  { code: 'SI', name: 'Slovénie' },
  { code: 'EE', name: 'Estonie' },
  { code: 'LV', name: 'Lettonie' },
  { code: 'LT', name: 'Lituanie' },
  { code: 'CY', name: 'Chypre' },
  { code: 'MT', name: 'Malte' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'US', name: 'États-Unis' },
  { code: 'CA', name: 'Canada' },
  { code: 'IL', name: 'Israël' },
  { code: 'AU', name: 'Australie' },
  { code: 'NZ', name: 'Nouvelle-Zélande' },
  { code: 'JP', name: 'Japon' },
  { code: 'SG', name: 'Singapour' },
];

/**
 * Vrai si le code donné existe dans la liste portail.
 */
export function isKnownPortalCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return PORTAL_COUNTRIES.some((c) => c.code === code.toUpperCase());
}

/**
 * Retourne le nom français du pays, ou le code si inconnu.
 */
export function getPortalCountryName(code: string | null | undefined): string {
  if (!code) return '—';
  const found = PORTAL_COUNTRIES.find((c) => c.code === code.toUpperCase());
  return found?.name ?? code;
}
