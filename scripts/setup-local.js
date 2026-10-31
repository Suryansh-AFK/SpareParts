import { randomBytes } from 'node:crypto';
import { copyFile, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
try {
  await access(envPath);
  console.log('.env already exists. Kept it unchanged.');
  console.log('Open it in VS Code if you need to update the local data or database settings.');
} catch {
  const example = await readFile(examplePath, 'utf8');
  const adminPassword = randomBytes(24).toString('base64url');
  const sessionSecret = randomBytes(48).toString('base64url');
  const configured = example
    .replace('ADMIN_PASSWORD=configure-with-npm-run-setup', `ADMIN_PASSWORD=${adminPassword}`)
    .replace('SESSION_SECRET=configure-with-npm-run-setup', `SESSION_SECRET=${sessionSecret}`);
  await writeFile(envPath, configured, { encoding:'utf8', flag:'wx' });
  console.log('Created a private .env file and a strong admin password.');
  console.log(`Admin password (save it somewhere safe): ${adminPassword}`);
  console.log('The desktop app stores its data in data/gearhouse.json by default.');
}
