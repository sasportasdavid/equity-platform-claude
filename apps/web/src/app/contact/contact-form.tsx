'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const INSTRUMENTS = ['BSPCE', 'Stock Options', 'AGA', 'RSU', 'BSA'] as const;

type SizeOption = '<10' | '10-50' | '50-200' | '200+';

const SIZE_OPTIONS: Array<{ value: SizeOption; label: string }> = [
  { value: '<10', label: 'Moins de 10' },
  { value: '10-50', label: '10 à 50' },
  { value: '50-200', label: '50 à 200' },
  { value: '200+', label: 'Plus de 200' },
];

/**
 * Formulaire de contact public V1.
 *
 * V1 : ouvre un mailto: avec le contenu pré-rempli (pas de Server Action,
 * pas de Resend lead, pas de DB). Évolution V1.X = lead capture backend.
 *
 * NOTE ARCHITECTURE : pas de Server Action ici car David n'a pas encore
 * configuré Resend pour les leads (cf brief PR #50 §11 point 6).
 */
export function ContactForm() {
  const [size, setSize] = useState<SizeOption>('10-50');
  const [instruments, setInstruments] = useState<Set<string>>(new Set(['BSPCE']));
  const [consent, setConsent] = useState(false);

  function toggleInstrument(name: string) {
    setInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) return;
    const formData = new FormData(event.currentTarget);
    const lines = [
      `Nom : ${formData.get('name') ?? ''}`,
      `Email pro : ${formData.get('email') ?? ''}`,
      `Société : ${formData.get('company') ?? ''}`,
      `Nb bénéficiaires : ${size}`,
      `Instruments envisagés : ${Array.from(instruments).join(', ')}`,
      '',
      'Message :',
      String(formData.get('message') ?? ''),
    ];
    const subject = encodeURIComponent(
      `[Demande démo Capiwise] ${formData.get('company') ?? formData.get('name') ?? ''}`,
    );
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:contact@capiwise.fr?subject=${subject}&body=${body}`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-paper-300 bg-paper-50 flex flex-col gap-5 rounded-xl border p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-name">Nom *</Label>
          <Input id="contact-name" name="name" required autoComplete="name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-email">Email pro *</Label>
          <Input id="contact-email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-company">Société *</Label>
        <Input id="contact-company" name="company" required autoComplete="organization" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink-900 text-sm font-medium">
          Nombre de bénéficiaires concernés *
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSize(option.value)}
              className={
                size === option.value
                  ? 'border-brass-500 bg-brass-50 text-brass-900 rounded-lg border-2 px-3 py-2 text-sm font-medium'
                  : 'border-paper-300 hover:border-brass-300 text-ink-700 rounded-lg border px-3 py-2 text-sm transition-colors'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink-900 text-sm font-medium">Instruments envisagés</legend>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTS.map((name) => {
            const active = instruments.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleInstrument(name)}
                className={
                  active
                    ? 'border-brass-500 bg-brass-50 text-brass-900 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium'
                    : 'border-paper-300 hover:border-brass-300 text-ink-700 rounded-full border px-3.5 py-1.5 text-sm transition-colors'
                }
              >
                {name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-message">
          Votre projet en quelques mots <span className="text-ink-500">(optionnel)</span>
        </Label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          className="border-paper-300 bg-paper-50 focus:ring-brass-500 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          placeholder="Stade actuel, instruments en place, urgence (audit, levée…)"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={consent}
          onCheckedChange={(value) => setConsent(value === true)}
          required
          aria-label="Consentement RGPD"
        />
        <span className="text-ink-700 leading-snug">
          J’accepte que mes données soient traitées par Capiwise pour répondre à ma demande,
          conformément à notre{' '}
          <a href="/legal/privacy" className="text-brass-700 underline">
            politique de confidentialité
          </a>
          .
        </span>
      </label>

      <Button type="submit" size="lg" disabled={!consent} className="self-start">
        Demander une démo
      </Button>

      <p className="text-ink-500 text-xs">
        Le bouton ouvre votre client mail avec le contenu pré-rempli. V1.X : envoi direct via
        Resend.
      </p>
    </form>
  );
}
