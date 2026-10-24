import fs from 'node:fs';
import path from 'node:path';

// Remove old generated copies before tracing, so newly excluded files cannot survive a rebuild.
const root = fs.realpathSync(process.cwd());
const output = path.join(root, '.next');
const standalone = path.join(output, 'standalone');
if (fs.existsSync(output) && fs.realpathSync(output) !== output) throw new Error('Refusing to clean a redirected build directory.');
if (fs.existsSync(standalone)) {
  if (fs.realpathSync(standalone) !== standalone) throw new Error('Refusing to clean a redirected standalone directory.');
  fs.rmSync(standalone, { recursive: true });
}
