import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin Turbopack to the monorepo root so it doesn't pick up an unrelated
  // lockfile from a parent directory.
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
