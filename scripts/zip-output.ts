import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { dir } from './utils';

const zipSource = 'dist/extension';
const zipOutputDir = 'dist/release';

zipExtensionFiles();

async function retrieveOutputDir() {
  const chromeExtOutputFileName = 'chrome-ext.zip';
  const outputFolder = dir(zipOutputDir);
  let canUseOutputDir = false;

  try {
    await fs.access(outputFolder, fs.constants.W_OK | fs.constants.R_OK);
    canUseOutputDir = true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(outputFolder, { recursive: true });
      canUseOutputDir = true;
    }
  }

  if (canUseOutputDir) {
    return outputFolder.concat('/', chromeExtOutputFileName);
  }

  return undefined;
}

async function zipExtensionFiles() {
  const outputDirPath = await retrieveOutputDir();

  if (!outputDirPath) {
    console.log('Cannot create zip file inside output directory');

    return;
  }

  const outputStream = createWriteStream(outputDirPath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  archive.pipe(outputStream);
  archive.directory(zipSource, false);
  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  outputStream.on('close', function () {
    console.log('Zipping done.');
    console.log('Total unzip bytes: ', archive.pointer());
  });

  outputStream.on('end', function () {
    console.log('No more data to zip');
  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function (err) {
    console.log('Encountered issue while packing: ', err);
  });

  // good practice to catch this error explicitly
  archive.on('error', function (err) {
    console.log('Encountered error: ', err);

    throw err;
  });

  archive.finalize();
}
