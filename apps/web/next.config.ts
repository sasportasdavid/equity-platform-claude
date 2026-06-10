import type { NextConfig } from 'next';
import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes was promoted out of experimental in Next 16.
  typedRoutes: true,
  // Pin Turbopack to the monorepo root so it doesn't pick up an unrelated
  // lockfile from a parent directory. process.cwd() is `apps/web` when next
  // runs, so the monorepo root is two levels up.
  turbopack: {
    root: path.resolve(process.cwd(), '../..'),
  },
  // Allow Playwright (which uses 127.0.0.1) and other local hosts to reach
  // dev assets without the cross-origin block introduced in Next 15+.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // En-têtes de sécurité (audit 2026-06-10 P1). HSTS est ignoré par les
  // navigateurs sur http/localhost → sans effet en dev, actif en https
  // (Vercel preview/prod). Pas de CSP ici : une CSP correcte pour Next 16
  // nécessite une intégration nonce (sinon casse Sentry + styles inline) →
  // chantier dédié séparé.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

// Sentry — wrap pour upload automatique des source maps (release tracking).
// Skip si pas de DSN configuré (build local sans Sentry, CI sans secrets).
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Sentry v10 supprime les source maps du build après upload (default true)
      // → pas exposées publiquement sous .next/static/**.
      disableLogger: true,
      tunnelRoute: '/monitoring/tunnel',
      automaticVercelMonitors: false,
    })
  : nextConfig;
