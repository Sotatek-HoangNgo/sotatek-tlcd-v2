import { dir, isDev } from './scripts/utils';
import { defineConfig, type UserConfig } from 'vite';
import { sharedConfig } from './vite.config.shared';
import packageJson from './package.json';

export default defineConfig(() => {
  const sourcemap = isDev ? 'inline' : false;
  const entryName = process.env.ENTRY_FILE || 'background';

  return {
    ...sharedConfig,
    build: {
      watch: isDev ? {} : undefined,
      assetsDir: 'styles',
      outDir: dir('dist/extension/dist'),
      cssCodeSplit: false,
      emptyOutDir: false,
      sourcemap,
      lib: {
        entry: { [entryName]: dir(`src/templates/${entryName}/index.ts`) },
        name: packageJson.name,
        formats: ['iife'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'scripts/[name].js',
          assetFileNames: 'assets/[name].[ext]',
          extend: true,
        },
      },
    },
  } as UserConfig;
});
