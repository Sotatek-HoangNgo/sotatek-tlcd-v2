import { dirname, relative } from 'path';
import { UserConfig } from 'vite';
import Vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import { dir, isDev } from './scripts/utils';
import tailwindcss from '@tailwindcss/vite';

export const sharedConfig: UserConfig = {
  root: dir('src'),
  define: {
    __DEV__: isDev,
    'process.env': { NODE_ENV: process.env.NODE_ENV },
  },
  resolve: {
    alias: {
      '@/': `${dir('src')}/`,
    },
  },
  plugins: [
    tailwindcss(),
    Vue(),
    AutoImport({
      imports: [
        'vue',
        {
          'webextension-polyfill': [['default', 'browser']],
        },
      ],
      dts: dir('src/auto-imports.d.ts'),
    }),
    // rewrite assets to use relative path
    {
      name: 'assets-rewrite',
      enforce: 'post',
      apply: 'build',
      transformIndexHtml(html, { path }) {
        return html.replace(/"\/scripts\//g, `"${relative(dirname(path), '/scripts')}/`);
      },
    },
  ],
  optimizeDeps: {
    include: ['vue', 'webextension-polyfill'],
  },
};
