'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * MODULE_03A_PLANS Step 4.5 — composant de recherche d'indice boursier.
 *
 * Mock auto-fetch : la liste des indices est codée en dur (top 10
 * indices internationaux courants utilisés en pratique IFRS 2). Sera
 * remplacée par un vrai appel à l'API Yahoo Finance ou une table
 * Supabase quand la Server Action sera connectée. La recherche est
 * locale (filtre `includes` sur ticker + displayName + region).
 *
 * Contrat externe :
 *  - `value` : ticker Yahoo courant (ex : `^FCHI`) — string, ou ''
 *  - `displayName` : nom affichable (ex : `CAC 40`) — string, ou ''
 *  - `onChange(ticker, displayName)` : appelé à chaque sélection ou
 *    saisie libre. Si l'utilisateur tape un ticker non listé,
 *    `displayName` reste celui qu'il a tapé OU vide.
 *
 * Pattern UX :
 *  - L'utilisateur peut tapper un ticker libre OU sélectionner depuis la
 *    dropdown qui apparaît au focus / à la saisie.
 *  - Un "chip" récap s'affiche en bas quand un ticker est sélectionné
 *    avec un displayName, pour confirmer visuellement le mapping.
 */

export type YahooIndexEntry = {
  ticker: string;
  displayName: string;
  region: string;
};

const TOP_INDICES: ReadonlyArray<YahooIndexEntry> = [
  { ticker: '^FCHI', displayName: 'CAC 40', region: 'France' },
  { ticker: '^STOXX50E', displayName: 'EURO STOXX 50', region: 'Europe' },
  { ticker: '^GDAXI', displayName: 'DAX', region: 'Allemagne' },
  { ticker: '^FTSE', displayName: 'FTSE 100', region: 'Royaume-Uni' },
  { ticker: '^GSPC', displayName: 'S&P 500', region: 'États-Unis' },
  { ticker: '^IXIC', displayName: 'NASDAQ Composite', region: 'États-Unis' },
  { ticker: '^NDX', displayName: 'NASDAQ-100', region: 'États-Unis' },
  { ticker: '^DJI', displayName: 'Dow Jones Industrial', region: 'États-Unis' },
  { ticker: '^N225', displayName: 'Nikkei 225', region: 'Japon' },
  { ticker: 'URTH', displayName: 'iShares MSCI World ETF', region: 'Monde' },
];

export function YahooIndexSearch({
  id,
  value,
  displayName,
  onChange,
  ariaInvalid,
}: {
  id?: string;
  value: string;
  displayName: string;
  onChange: (ticker: string, displayName: string) => void;
  ariaInvalid?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  // Pattern "derived state" : on laisse l'utilisateur taper librement
  // (état local `query`), mais quand la prop `value` change de l'extérieur
  // (préset RHF qui reset le ticker, ou autre composant qui modifie le
  // form state), on resynchronise pendant le render. Évite l'erreur lint
  // `react-hooks/set-state-in-effect` qu'imposerait un useEffect.
  const [query, setQuery] = useState(value);
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setQuery(value);
  }
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ferme la dropdown quand on clique ailleurs.
  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const normalized = query.trim().toUpperCase();
  const filtered = normalized
    ? TOP_INDICES.filter((entry) => {
        const haystack = `${entry.ticker} ${entry.displayName} ${entry.region}`.toUpperCase();
        return haystack.includes(normalized);
      })
    : TOP_INDICES;

  function handleSelect(entry: YahooIndexEntry) {
    onChange(entry.ticker, entry.displayName);
    setQuery(entry.ticker);
    setOpen(false);
  }

  function handleClear() {
    onChange('', '');
    setQuery('');
  }

  function handleManualChange(next: string) {
    setQuery(next);
    // Si la saisie correspond exactement à un ticker connu, on remplit
    // aussi le displayName ; sinon on garde le ticker brut + on vide le
    // display (l'utilisateur peut le re-taper dans le champ dédié).
    const match = TOP_INDICES.find((e) => e.ticker.toUpperCase() === next.trim().toUpperCase());
    if (match) {
      onChange(match.ticker, match.displayName);
    } else {
      onChange(next.trim(), '');
    }
  }

  const matchedEntry = TOP_INDICES.find((e) => e.ticker === value);

  return (
    <div ref={containerRef} className="space-y-1.5" data-testid="yahoo-index-search">
      <Label htmlFor={inputId}>Indice de référence *</Label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          id={inputId}
          type="text"
          placeholder="Ex : ^FCHI, S&P 500, CAC..."
          className="pl-8 pr-8 font-mono"
          value={query}
          onChange={(e) => handleManualChange(e.target.value)}
          onFocus={() => setOpen(true)}
          aria-invalid={ariaInvalid}
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Effacer la sélection"
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {open && filtered.length > 0 ? (
        <ul
          role="listbox"
          className="bg-popover text-popover-foreground max-h-56 overflow-auto rounded-md border shadow-md"
          data-testid="yahoo-index-results"
        >
          {filtered.map((entry) => {
            const selected = entry.ticker === value;
            return (
              <li key={entry.ticker} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className={cn(
                    'hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                    selected && 'bg-muted',
                  )}
                >
                  {selected ? (
                    <Check className="text-primary size-3.5" />
                  ) : (
                    <span className="size-3.5" aria-hidden />
                  )}
                  <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">
                    {entry.ticker}
                  </span>
                  <span className="truncate font-medium">{entry.displayName}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{entry.region}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : open && filtered.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Aucun indice connu — la saisie sera enregistrée comme ticker libre.
        </p>
      ) : null}

      {value && matchedEntry ? (
        <p className="text-muted-foreground text-xs" data-testid="yahoo-index-pick">
          Sélectionné : <span className="text-foreground font-mono">{matchedEntry.ticker}</span> —{' '}
          <strong className="text-foreground">{matchedEntry.displayName}</strong> (
          {matchedEntry.region})
        </p>
      ) : value && !matchedEntry ? (
        <p className="text-muted-foreground text-xs">
          Ticker libre : <span className="text-foreground font-mono">{value}</span>
          {displayName ? (
            <>
              {' '}
              — <strong className="text-foreground">{displayName}</strong>
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Saisissez un ticker Yahoo (^FCHI, ^GSPC...) ou choisissez dans la liste.
        </p>
      )}
    </div>
  );
}
