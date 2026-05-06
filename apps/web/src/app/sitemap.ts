import type { MetadataRoute } from 'next';

/**
 * Sitemap Next.js — Site public V1 (PR #50).
 *
 * Liste toutes les routes publiques accessibles sans authentification.
 * Les routes /dashboard/*, /portal/*, /api/*, /dev/* sont exclues
 * (cf robots.ts qui applique le disallow correspondant).
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.capiwise.fr';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const ROUTES: Array<{
    path: string;
    changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority?: number;
  }> = [
    // Top-level
    { path: '/', changeFrequency: 'weekly', priority: 1.0 },
    { path: '/tarifs', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/securite', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/comparatif', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/clients', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/a-propos', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/contact', changeFrequency: 'yearly', priority: 0.7 },

    // Produit
    { path: '/produit', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/produit/plans', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/produit/attribution', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/produit/portail-beneficiaire', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/produit/levee-options', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/produit/cap-table', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/produit/valorisation-ifrs2', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/produit/conformite-fr', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/produit/signature-electronique', changeFrequency: 'monthly', priority: 0.7 },

    // Ressources
    { path: '/ressources', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/ressources/guide-bspce', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/ressources/ifrs2-explique', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/ressources/aga-bspce-stock-options', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/ressources/faq', changeFrequency: 'monthly', priority: 0.6 },

    // Légal
    { path: '/legal/mentions-legales', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/cgv', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/dpa', changeFrequency: 'yearly', priority: 0.3 },
  ];

  return ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
