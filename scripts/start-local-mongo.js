import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'mongodb');
await mkdir(dbPath, { recursive:true });
const child = spawn('mongod', ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', '27017'], { stdio:'inherit', cwd:root, windowsHide:true });
child.on('error', error => {
  console.error('Could not start mongod. Install MongoDB Community Server first, or keep using the local-folder JSON data store.');
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 0; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
