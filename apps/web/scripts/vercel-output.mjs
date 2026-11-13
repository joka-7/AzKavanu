// Vercel looks for the build output relative to the project's Root Directory
// setting. Depending on that setting it expects either apps/web/dist or a
// top-level dist, so on Vercel publish the same build in both places.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL) {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = resolve(web, 'dist');
  const target = resolve(web, '../../dist');
  if (existsSync(target)) rmSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`Copied ${source} -> ${target}`);
}
