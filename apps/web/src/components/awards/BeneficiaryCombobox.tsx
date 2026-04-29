'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchBeneficiariesAction } from './beneficiary-search-action';

export type SelectedBeneficiary = {
  id: string;
  fullName: string;
  email: string;
};

/**
 * Combobox autocomplete bénéficiaire — Module 3b B3.
 *
 * 2 modes :
 *  - Tape > 2 chars → searchBeneficiariesAction (Server Action) →
 *    affiche jusqu'à 10 résultats. Click → onSelect(beneficiary).
 *  - L'email tapé n'existe pas → bouton "+ Créer un nouveau bénéficiaire"
 *    appelle onCreateNew(email) (le parent ouvre alors le sub-form).
 *
 * Navigation clavier : ArrowUp/Down + Enter pour sélectionner.
 */
export function BeneficiaryCombobox({
  value,
  onSelect,
  onCreateNew,
}: {
  value: SelectedBeneficiary | null;
  onSelect: (b: SelectedBeneficiary | null) => void;
  onCreateNew: (email: string) => void;
}) {
  const [query, setQuery] = useState(value?.email ?? '');
  const [results, setResults] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; email: string }>
  >([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search — set synchrone justifié : on doit clear les résultats
  // si le query passe sous le seuil. Le check fonctionnel évite le re-render
  // si déjà vide.
  useEffect(() => {
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchBeneficiariesAction(query);
        setResults(res);
        setHighlight(0);
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(idx: number) {
    const b = results[idx];
    if (!b) return;
    const full = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || b.email;
    onSelect({ id: b.id, fullName: full, email: b.email });
    setQuery(b.email);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(highlight);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
  const noMatch = !pending && query.length >= 2 && results.length === 0;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value && e.target.value !== value.email) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder="email ou nom du bénéficiaire…"
        autoComplete="off"
        data-testid="beneficiary-combobox"
      />
      {open && query.length >= 2 ? (
        <div className="bg-popover absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border shadow-md">
          {pending ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 p-3 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Recherche…
            </div>
          ) : results.length > 0 ? (
            <ul role="listbox">
              {results.map((b, i) => {
                const fullName = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || '—';
                return (
                  <li
                    key={b.id}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(i);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={[
                      'cursor-pointer px-3 py-2 text-sm',
                      i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                    ].join(' ')}
                  >
                    <div className="font-medium">{fullName}</div>
                    <div className="text-muted-foreground text-xs">{b.email}</div>
                  </li>
                );
              })}
            </ul>
          ) : noMatch ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">Aucun résultat pour « {query} ».</p>
              {isEmail ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onCreateNew(query);
                    setOpen(false);
                  }}
                  className="text-primary hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm"
                  data-testid="beneficiary-create-new"
                >
                  <UserPlus className="size-4" />
                  Créer un nouveau bénéficiaire avec cet email
                </button>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Tapez un email valide pour créer un nouveau bénéficiaire.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
