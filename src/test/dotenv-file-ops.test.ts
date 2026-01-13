import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { annotateEnvFile, copyEnvFileKeys, formatEnvFile, validateEnvFile } from '../index.js';

async function makeTempFile(fileName: string, contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'envsitter-ops-'));
  const filePath = join(dir, fileName);
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}

test('validateEnvFile reports syntax errors with line/column', async () => {
  const file = await makeTempFile('.env', ['OK=value', 'BAD-KEY=value', 'NOEQ', "SINGLE='unterminated"].join('\n'));

  const result = await validateEnvFile(file);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.line === 2));
  assert.ok(result.issues.some((i) => i.line === 3));
  assert.ok(result.issues.some((i) => i.line === 4));
});

test('copyEnvFileKeys copies selected keys and supports rename', async () => {
  const from = await makeTempFile('.env.prod', ['A=1', 'B=two', 'C=three'].join('\n') + '\n');
  const to = await makeTempFile('.env.staging', ['B=old', 'D=keep'].join('\n') + '\n');

  const res = await copyEnvFileKeys({
    from,
    to,
    keys: ['A', 'B'],
    rename: 'A=A_RENAMED',
    onConflict: 'overwrite',
    write: true
  });

  assert.equal(res.wrote, true);
  assert.equal(res.plan.some((p) => p.fromKey === 'A' && p.toKey === 'A_RENAMED' && p.action === 'copy'), true);
  assert.equal(res.plan.some((p) => p.fromKey === 'B' && p.toKey === 'B' && p.action === 'overwrite'), true);

  const out = await readFile(to, 'utf8');
  assert.ok(out.includes('A_RENAMED=1'));
  assert.ok(out.includes('B=two'));
  assert.ok(out.includes('D=keep'));
});

test('annotateEnvFile inserts and updates envsitter comment', async () => {
  const file = await makeTempFile('.env', 'A=1\n');

  const first = await annotateEnvFile({ file, key: 'A', comment: 'first', write: true });
  assert.equal(first.wrote, true);

  const afterFirst = await readFile(file, 'utf8');
  assert.ok(afterFirst.startsWith('# envsitter: first\nA=1\n'));

  const second = await annotateEnvFile({ file, key: 'A', comment: 'second', write: true });
  assert.equal(second.wrote, true);

  const afterSecond = await readFile(file, 'utf8');
  assert.ok(afterSecond.startsWith('# envsitter: second\nA=1\n'));
});

test('formatEnvFile sorts assignments within sections', async () => {
  const file = await makeTempFile(
    '.env',
    ['# section one', 'B=2', 'A=1', '', '# section two', 'Z=9', 'Y=8', ''].join('\n')
  );

  const res = await formatEnvFile({ file, mode: 'sections', sort: 'alpha', write: true });
  assert.equal(res.wrote, true);

  const out = await readFile(file, 'utf8');
  const expected = ['# section one', 'A=1', 'B=2', '', '# section two', 'Y=8', 'Z=9', ''].join('\n');
  assert.equal(out, expected);
});
