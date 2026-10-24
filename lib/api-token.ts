import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDirectory } from './data-path';

export function getApiToken() {
  const directory = dataDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, '.api-access-token');
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const token = fs.readFileSync(file, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('The local API token file is invalid.');
  return token;
}
