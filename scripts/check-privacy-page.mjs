// Fails the build when the privacy page is missing from the web build, no longer says what
// leaves the device, or the app stops linking to it. Google's consent screen points at this
// page, so it must ship with every build. Run after `npm run build`.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'apps/web/dist');
const problems = [];

const page = await readFile(path.join(dist, 'privacy.html'), 'utf8').catch(() => null);
if (page === null) {
  problems.push('privacy.html is not in the build');
} else {
  const required = {
    'the English heading': /<h1>Privacy<\/h1>/,
    'the Hebrew section': /<section id="he" lang="he" dir="rtl">/,
    'the drive.appdata permission': /drive\.appdata/,
    'the drive.file permission': /drive\.file/,
    "Google's Limited Use statement": /Limited Use/,
    'what group members see': /last 60 days/,
    'a contact address': /mailto:/,
  };
  for (const [what, pattern] of Object.entries(required)) {
    if (!pattern.test(page)) problems.push(`privacy.html no longer mentions ${what}`);
  }
}

const scripts = (await readdir(path.join(dist, 'assets'))).filter((f) => f.endsWith('.js'));
const bundles = await Promise.all(scripts.map((f) => readFile(path.join(dist, 'assets', f), 'utf8')));
if (!bundles.some((code) => code.includes('./privacy.html'))) problems.push('the app no longer links to ./privacy.html');

if (problems.length) {
  for (const p of problems) console.error(`privacy page check: ${p}`);
  process.exit(1);
}
console.log('privacy page check: ok');
