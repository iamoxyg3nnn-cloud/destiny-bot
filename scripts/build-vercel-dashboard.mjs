import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const app = process.env.DASHBOARD_APP || 'server';
if (!['server', 'owner'].includes(app)) throw new Error('DASHBOARD_APP must be "server" or "owner".');

const publicRoot = path.resolve('public');
await rm(publicRoot, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });
await copyFile(path.resolve(`apps/${app}-dashboard/public/index.html`), path.join(publicRoot, 'index.html'));
await copyFile(path.resolve('apps/shared/dashboard.css'), path.join(publicRoot, 'dashboard.css'));
await copyFile(path.resolve('apps/shared/dashboard.js'), path.join(publicRoot, 'dashboard.js'));
const sharedAssets = path.resolve('apps/shared/assets');
const publicAssets = path.join(publicRoot, 'assets');
await mkdir(publicAssets, { recursive: true });
for (const asset of await readdir(sharedAssets)) {
  await copyFile(path.join(sharedAssets, asset), path.join(publicAssets, asset));
}
