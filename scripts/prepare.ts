import { writeManifest } from './manifest';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { dir, isDev, port } from './utils';
import chokidar from 'chokidar';
import * as vite from 'vite';
import { sharedConfig } from '../vite.config.shared';

writeManifest().then(() => {
  console.log('Manifest written');
  copyAssets();
});

async function copyAssets() {
  await fs.cp(dir('src/assets/images'), dir('extension/images'), { recursive: true });
}

/**
 * Generate index.html to use Vite in development
 */
async function generateIndexHtml() {
  const views = ['popup'];

  for (const view of views) {
    try {
      await fs.access(dir(`extension/dist/templates/${view}`), fs.constants.W_OK | fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(dir(`extension/dist/templates/${view}`), { recursive: true });
      }
    }

    let data = await fs.readFile(dir(`src/templates/${view}/index.html`), 'utf-8');
    data = data
      .replace('"./index.ts"', `"http://localhost:${port}/${view}/main.ts"`)
      .replace('<div id="app"></div>', '<div id="app">Vite server did not start</div>');
    await fs.writeFile(dir(`extension/dist/templates/${view}/index.html`), data, 'utf-8');
  }
}

if (isDev) {
  generateIndexHtml();
  //   chokidar.watch(dir('src/templates/popup/**/*.html')).on('change', () => {
  //     generateIndexHtml();
  //   });
  //   chokidar.watch([dir('src/manifest.ts'), dir('package.json')]).on('change', () => {
  //     writeManifest();
  //   });
}
