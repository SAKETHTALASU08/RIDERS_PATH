import { execSync } from 'node:child_process';
import { rmSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const isTargetAdmin = process.env.VERCEL_PROJECT === 'admin' || process.env.APP_TARGET === 'admin';

console.log(`Building for target: ${isTargetAdmin ? 'ADMIN PORTAL' : 'STUDENT PORTAL'}`);

if (isTargetAdmin) {
  // Build admin app
  execSync('npm run build:admin', { stdio: 'inherit' });

  // Clean dist/web and copy dist/admin content into dist/web so Vercel can publish it seamlessly
  const distWeb = resolve(process.cwd(), 'dist/web');
  const distAdmin = resolve(process.cwd(), 'dist/admin');

  if (existsSync(distWeb)) {
    rmSync(distWeb, { recursive: true, force: true });
  }
  cpSync(distAdmin, distWeb, { recursive: true });
  console.log('Successfully prepared dist/web with admin portal assets.');
} else {
  // Build student web app and run prerendering
  execSync('npm run build:web', { stdio: 'inherit' });
  execSync('npm run prerender:landing', { stdio: 'inherit' });
  console.log('Successfully built student portal.');
}
