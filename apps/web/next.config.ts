import type { NextConfig } from 'next';
import path from 'node:path';

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
};

export default nextConfig;
