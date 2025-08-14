import { defineConfig } from 'vite';
import { sharedConfig } from './vite.config.shared';
import { dir, port, isDev } from './scripts/utils';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const sourcemap = isDev ? ('inline' as const) : false;

  return {
    ...sharedConfig,
    base: command === 'serve' ? `http://localhost:${port}/` : '/dist/',
    server: {
      port,
      hmr: {
        host: 'localhost',
      },
    },
    build: {
      outDir: dir('dist/extension/dist'),
      emptyOutDir: false,
      sourcemap,
      rollupOptions: {
        input: {
          popup: dir('src/templates/popup/index.html'),
        },
        output: [
          {
            entryFileNames: 'scripts/[name].js',
            format: 'iife',
            inlineDynamicImports: false,
          },
        ],
      },
      terserOptions: {
        mangle: false,
      },
    },
  };
});
