import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assetsDirectory = resolve(process.cwd(), 'dist/web/assets');
const forbidden = [/\/api\/admin\/(?:login|documents|listings)/i, /AdminDocumentReview/i, /AdminListingReview/i, /ADMIN_SESSION_COOKIE/];
const scripts = readdirSync(assetsDirectory).filter((file) => file.endsWith('.js'));
const matches = [];
for (const file of scripts) {
  const bundle = readFileSync(resolve(assetsDirectory, file), 'utf8');
  for (const pattern of forbidden) if (pattern.test(bundle)) matches.push(`${file}: ${pattern}`);
}
if (matches.length) {
  console.error('Admin code leaked into the student bundle:', matches.join('\n'));
  process.exit(1);
}
console.log(`Student bundle check passed (${scripts.length} JavaScript chunks scanned).`);
