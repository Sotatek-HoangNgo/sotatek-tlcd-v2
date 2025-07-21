import { exec } from 'child_process';

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
