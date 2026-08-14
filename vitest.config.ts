// Vitest runs through Astro's own Vite config so .astro components can be
// rendered in a test. AC23 is a rendering guarantee — imported history must read
// as unverified — and a guarantee that can only be checked by eye is not a
// guarantee. getViteConfig gives the test run the same transforms the SSR build
// uses, so what the test renders is what the server renders.
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
