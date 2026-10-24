import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const privateNames = ['data', 'local-only', 'backups', 'exports', 'imports', 'uploads', 'creditcarddata'];
const privateRoots = privateNames.map((name) => path.resolve(root, name));
if (process.env.CREDIT_CARD_INSIGHTS_DATA_DIR) privateRoots.push(path.resolve(process.env.CREDIT_CARD_INSIGHTS_DATA_DIR));
const isPrivate = (file) => privateRoots.some((directory) => file === directory || file.startsWith(directory + path.sep)) || path.basename(file).startsWith('.env');
function checkTraces(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkTraces(file);
    else if (file.endsWith('.nft.json')) {
      const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (trace.files.some((relative) => isPrivate(path.resolve(directory, relative)))) throw new Error('Private files were included in server traces.');
    }
  }
}
checkTraces(path.join(root, '.next', 'server'));
for (const name of privateNames) {
  if (fs.existsSync(path.join(root, '.next', 'standalone', name))) throw new Error('Private data was included in standalone output.');
}
console.log('Release privacy check passed: private data is absent from server traces and standalone output.');
