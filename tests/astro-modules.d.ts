// tsc alone cannot type a .astro module — that is `astro check`'s job, and the
// Astro compiler's. This declaration is the minimum a test needs to import a
// component and hand it to the container renderer. It is deliberately narrow, so
// it cannot become a way to assert anything else about a component's props.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

  const component: AstroComponentFactory;
  export default component;
}
