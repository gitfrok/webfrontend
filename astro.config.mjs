// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// SSR baseline (ADR-0015 GitHub-clean shell). The SSR layer is a thin proxy — all data
// comes from the BFF; no business logic lives here (invariant 18/22).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
});
