import fs from 'fs/promises';
import { dir } from './utils';

export async function writeManifest() {
  await fs.writeFile(dir('extension/manifest.json'), await fs.readFile(dir('src/assets/manifest.json'), 'utf-8'));
}
