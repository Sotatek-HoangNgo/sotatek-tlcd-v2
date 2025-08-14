import { writeManifest } from './manifest';
import fs from 'fs/promises';
import { dir, isDev, port } from './utils';
import chokidar from 'chokidar';

const views = ['popup'];

writeManifest().then(() => {
  console.log('Manifest written');
  copyAssets();
});

async function copyAssets() {
  await fs.cp(dir('src/assets/images'), dir('dist/extension/images'), { recursive: true });
}

/**
 * Generate index.html to use Vite in development
 */
async function generateHTMLMarkupWithHRM() {
  const cssAliasImportRegex = /(?<=href=\")@/g;

  for (const view of views) {
    try {
      await fs.access(dir(`dist/extension/dist/templates/${view}`), fs.constants.W_OK | fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(dir(`dist/extension/dist/templates/${view}`), { recursive: true });
      }
    }

    let data = await fs.readFile(dir(`src/templates/${view}/index.html`), 'utf-8');
    data = data
      .replace(cssAliasImportRegex, `http://localhost:${port}`)
      .replace('"./index.ts"', `"http://localhost:${port}/templates/${view}/index.ts"`)
      .replace('<div id="app"></div>', '<div id="app">Vite server did not start</div>');
    await fs.writeFile(dir(`dist/extension/dist/templates/${view}/index.html`), data, 'utf-8');
  }
}

if (isDev) {
  const watchPaths = views.map((view) => dir(`src/templates/${view}/index.html`));
  generateHTMLMarkupWithHRM();

  chokidar.watch(watchPaths).on('change', () => {
    generateHTMLMarkupWithHRM();
  });

  chokidar.watch([dir('src/assets/manifest.json')]).on('change', () => {
    writeManifest();
  });
}
