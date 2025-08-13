// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@': path.resolve('./src')
      }
    },
     ssr: {
    external: ['linkedom'], // let Node require() it so exports is defined
  },
  optimizeDeps: {
    exclude: ['linkedom'], // prevent pre-bundling
  },
 
}
});
