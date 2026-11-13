import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

await mkdir('cloudflare/dist', { recursive: true });
const result = await build({
  entryPoints: ['cloudflare/worker.ts'],
  outfile: 'cloudflare/dist/worker.js',
  bundle: true,
  minify: true,
  metafile: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.CLOUDFLARE_WORKER': '"1"' },
  external: ['node:*'],
  loader: { '.html': 'text', '.css': 'text' },
  legalComments: 'none',
  plugins: [{
    name: 'raw-dashboard-assets',
    setup(buildApi) {
      const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, '')]));
      buildApi.onResolve({ filter: /^cloudflare:workers$/ }, (args) => ({ path: args.path, external: true }));
      buildApi.onResolve({ filter: /^[A-Za-z][A-Za-z0-9_./-]*$/ }, (args) => {
        if (!nodeBuiltins.has(args.path)) return null;
        const specifier = args.path.startsWith('node:') ? args.path : `node:${args.path}`;
        return { path: specifier, external: true };
      });
      buildApi.onResolve({ filter: /^dotenv$/ }, () => ({ path: 'dotenv', namespace: 'cloudflare-runtime' }));
      buildApi.onResolve({ filter: /bot\/index\.js$/ }, (args) => args.importer.replaceAll('\\', '/').includes('/core/moderation/verification.ts') ? ({
        path: 'bot-client',
        namespace: 'cloudflare-runtime',
      }) : null);
      buildApi.onResolve({ filter: /^discord\.js$/ }, (args) => args.importer.replaceAll('\\', '/').includes('/core/moderation/verification.ts') ? ({
        path: 'discord-stub',
        namespace: 'cloudflare-runtime',
      }) : null);
      buildApi.onResolve({ filter: /bot\/embeds\/index\.js$/ }, (args) => args.importer.replaceAll('\\', '/').includes('/core/moderation/verification.ts') ? ({
        path: 'bot-embeds',
        namespace: 'cloudflare-runtime',
      }) : null);
      buildApi.onResolve({ filter: /^@napi-rs\/canvas$/ }, () => ({ path: 'canvas-stub', namespace: 'cloudflare-runtime' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'cloudflare-runtime' }, (args) => {
        const modules = {
          'bot-client': `export const bot={client:null};`,
          'discord-stub': `export const MessageFlags={};export class ContainerBuilder{};export class TextDisplayBuilder{};`,
          'bot-embeds': `export const embedService={};export const COLORS={};`,
          'canvas-stub': `export const createCanvas=()=>{throw new Error('Canvas rendering is unavailable in the dashboard Worker.')};export const GlobalFonts={registerFromPath:()=>false};`,
          'dotenv': `export default {config:()=>({parsed:{}})};`,
        };
        return { contents: modules[args.path], loader: 'js' };
      });
      buildApi.onResolve({ filter: /\?raw$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
        namespace: 'raw-dashboard-asset',
      }));
      buildApi.onResolve({ filter: /\?base64$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.slice(0, -7)),
        namespace: 'base64-dashboard-asset',
      }));
      buildApi.onLoad({ filter: /.*/, namespace: 'raw-dashboard-asset' }, async (args) => ({
        contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))};`,
        loader: 'js',
      }));
      buildApi.onLoad({ filter: /.*/, namespace: 'base64-dashboard-asset' }, async (args) => ({
        contents: `export default ${JSON.stringify((await readFile(args.path)).toString('base64'))};`,
        loader: 'js',
      }));
    },
  }],
});
await writeFile('cloudflare/dist/metafile.json', JSON.stringify(result.metafile));
