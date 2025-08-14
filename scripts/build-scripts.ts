import { exec } from 'child_process';
import chokidar from 'chokidar';
import { dir, isDev } from './utils';

const entriesFile = ['injector', 'content-scripts', 'background'];

function buildEntries() {
  for (const entry of entriesFile) {
    exec(`cross-env ENTRY_FILE=${entry} vite build --config vite.config.script.ts`, {}, (error) => {
      if (error) {
        console.log('Encountered error while building file: ', entry);
        console.log('Error: ', error);
      } else {
        console.log('Successfully build file: ', entry);
      }
    });
  }
}

buildEntries();

if (isDev) {
  const watchPaths = entriesFile.map((view) => dir(`src/templates/${view}/index.ts`));

  chokidar.watch(watchPaths).on('change', () => {
    buildEntries();
  });
}
