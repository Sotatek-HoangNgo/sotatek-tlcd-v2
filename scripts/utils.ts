import { resolve, dirname } from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function dir(...path: string[]) {
  return resolve(__dirname, '..', ...path);
}

export const isDev = process.env.NODE_ENV !== 'production';
export const port = parseInt(process.env.PORT || '') || 3305;
