import type { MetadataRoute } from 'next';

/**
 * robots.txt généré par Next.js App Router.
 * Site public V1 — autorise les pages marketing, bloque le dashboard et l'API.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.capiwise.fr';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/portal/',
          '/api/',
          '/dev/',
          '/onboarding/',
          '/select-org/',
          '/auth/',
          '/login',
          '/signup',
          '/accept-invite',
          '/unauthorized',
          '/no-access',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
