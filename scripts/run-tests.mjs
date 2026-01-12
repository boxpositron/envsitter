import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const testDir = join(process.cwd(), 'dist', 'test');

const entries = await readdir(testDir, { withFileTypes: true });
const testFiles = entries
  .filter((e) => e.isFile() && e.name.endsWith('.test.js'))
  .map((e) => join(testDir, e.name))
  .sort((a, b) => a.localeCompare(b));

if (testFiles.length === 0) {
  process.stderr.write('envsitter: no test files found in dist/test\n');
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
