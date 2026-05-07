'use client';

import { useState } from 'react';

/**
 * Newsletter form V1 — pas de backend.
 * V1.X : intégration Resend Audiences.
 */
export function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p className="bg-bond-50 text-bond-700 mx-auto mt-6 max-w-md rounded-md px-4 py-3 text-sm">
        Merci ! Vous serez ajouté à la liste très bientôt (V1.X — backend en cours).
      </p>
    );
  }

  return (
    <form
      className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
    >
      <input
        type="email"
        required
        placeholder="email@societe.com"
        className="border-paper-300 bg-paper-50 focus:ring-brass-500 flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
      />
      <button
        type="submit"
        className="bg-brass-500 hover:bg-brass-700 text-paper-50 rounded-md px-4 py-2 text-sm font-medium"
      >
        S’inscrire
      </button>
    </form>
  );
}
