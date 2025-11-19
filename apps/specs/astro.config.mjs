// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

const WORKSPACE_ROOT = fileURLToPath(new URL('../..', import.meta.url)); // adjust as needed

const SPEC_DIR = fileURLToPath(new URL('../../spec', import.meta.url)); // monorepo /spec


// https://astro.build/config
export default defineConfig({
  vite: {
    server: {
      // let Vite dev server read from /spec (outside project root)
      fs: { 
          allow: [WORKSPACE_ROOT, SPEC_DIR],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve('./src'),
        '#spec': SPEC_DIR
      }
    },
    ssr: {
      external: ['linkedom'], // let Node require() it so exports is defined
    },
    optimizeDeps: {
      exclude: ['linkedom'], // prevent pre-bundling
    },
    // inject absolute path so you can read it from server code
    define: { 'import.meta.env.SPEC_DIR': JSON.stringify(SPEC_DIR) },
    plugins: [tailwindcss()],
  
},

  integrations: [react()]
});