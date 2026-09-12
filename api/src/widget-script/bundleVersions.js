import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const bundleDir = path.join(currentDir, 'dist');

const bundleFilePattern = /^widget\.v(\d+)\.js$/;

export function listBundleFileNames() {
  return fs.readdirSync(bundleDir).filter((fileName) => bundleFilePattern.test(fileName));
}

function parseBundleVersion(fileName) {
  return Number(fileName.match(bundleFilePattern)[1]);
}

const servedBundleFiles = listBundleFileNames();
if (servedBundleFiles.length === 0) {
  throw new Error('No widget bundle files found in dist/');
}

export function getLatestBundleVersion() {
  return Math.max(...servedBundleFiles.map(parseBundleVersion));
}

export { servedBundleFiles };
