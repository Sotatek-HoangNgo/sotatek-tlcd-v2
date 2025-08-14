import fs from 'fs/promises';
import { dir } from './utils';

export async function writeManifest() {
  try {
    await fs.access(dir('dist/extension'), fs.constants.W_OK | fs.constants.R_OK);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dir('dist/extension'), { recursive: true });
    }
  }

  await fs.writeFile(dir('dist/extension/manifest.json'), await fs.readFile(dir('src/assets/manifest.json'), 'utf-8'));
}
