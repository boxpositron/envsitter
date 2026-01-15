import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addEnvFileKey, annotateEnvFile, copyEnvFileKeys, deleteEnvFileKeys, formatEnvFile, isExampleEnvFile, setEnvFileKey, unsetEnvFileKey, validateEnvFile } from '../index.js';

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

test('addEnvFileKey adds new key and fails if key exists', async () => {
  const file = await makeTempFile('.env', 'EXISTING=value\n');

  const addNew = await addEnvFileKey({ file, key: 'NEW_KEY', value: 'new_value', write: true });
  assert.equal(addNew.wrote, true);
  assert.equal(addNew.plan.action, 'added');

  const contents = await readFile(file, 'utf8');
  assert.ok(contents.includes('NEW_KEY=new_value'));

  const addExisting = await addEnvFileKey({ file, key: 'EXISTING', value: 'other', write: true });
  assert.equal(addExisting.wrote, false);
  assert.equal(addExisting.plan.action, 'key_exists');
});

test('addEnvFileKey auto-quotes values with special characters', async () => {
  const file = await makeTempFile('.env', '');

  await addEnvFileKey({ file, key: 'SIMPLE', value: 'simple', write: true });
  await addEnvFileKey({ file, key: 'WITH_SPACE', value: 'has space', write: true });
  await addEnvFileKey({ file, key: 'WITH_HASH', value: 'before#after', write: true });
  await addEnvFileKey({ file, key: 'WITH_NEWLINE', value: 'line1\nline2', write: true });

  const contents = await readFile(file, 'utf8');
  assert.ok(contents.includes('SIMPLE=simple'));
  assert.ok(contents.includes('WITH_SPACE="has space"'));
  assert.ok(contents.includes('WITH_HASH="before#after"'));
  assert.ok(contents.includes('WITH_NEWLINE="line1\\nline2"'));
});

test('setEnvFileKey creates or updates key', async () => {
  const file = await makeTempFile('.env', 'A=1\n');

  const setNew = await setEnvFileKey({ file, key: 'B', value: '2', write: true });
  assert.equal(setNew.wrote, true);
  assert.equal(setNew.plan.action, 'added');

  const setExisting = await setEnvFileKey({ file, key: 'A', value: 'updated', write: true });
  assert.equal(setExisting.wrote, true);
  assert.equal(setExisting.plan.action, 'updated');

  const contents = await readFile(file, 'utf8');
  assert.ok(contents.includes('A=updated'));
  assert.ok(contents.includes('B=2'));

  const setSame = await setEnvFileKey({ file, key: 'A', value: 'updated', write: true });
  assert.equal(setSame.wrote, false);
  assert.equal(setSame.plan.action, 'no_change');
});

test('unsetEnvFileKey sets key to empty value', async () => {
  const file = await makeTempFile('.env', 'A=value\nB=\n');

  const unsetA = await unsetEnvFileKey({ file, key: 'A', write: true });
  assert.equal(unsetA.wrote, true);
  assert.equal(unsetA.plan.action, 'unset');

  const contents = await readFile(file, 'utf8');
  assert.ok(contents.includes('A=\n') || contents.includes('A='));
  assert.ok(!contents.includes('A=value'));

  const unsetB = await unsetEnvFileKey({ file, key: 'B', write: true });
  assert.equal(unsetB.wrote, false);
  assert.equal(unsetB.plan.action, 'no_change');

  const unsetMissing = await unsetEnvFileKey({ file, key: 'MISSING', write: true });
  assert.equal(unsetMissing.wrote, false);
  assert.equal(unsetMissing.plan.action, 'not_found');
});

test('deleteEnvFileKeys removes keys from file', async () => {
  const file = await makeTempFile('.env', 'A=1\nB=2\nC=3\n');

  const deleteSingle = await deleteEnvFileKeys({ file, keys: ['B'], write: true });
  assert.equal(deleteSingle.wrote, true);
  assert.equal(deleteSingle.plan.length, 1);
  assert.equal(deleteSingle.plan[0]?.action, 'deleted');

  let contents = await readFile(file, 'utf8');
  assert.ok(!contents.includes('B='));
  assert.ok(contents.includes('A=1'));
  assert.ok(contents.includes('C=3'));

  const deleteMultiple = await deleteEnvFileKeys({ file, keys: ['A', 'C', 'MISSING'], write: true });
  assert.equal(deleteMultiple.wrote, true);
  assert.equal(deleteMultiple.plan.filter((p) => p.action === 'deleted').length, 2);
  assert.equal(deleteMultiple.plan.filter((p) => p.action === 'not_found').length, 1);

  contents = await readFile(file, 'utf8');
  assert.ok(!contents.includes('A='));
  assert.ok(!contents.includes('C='));
});

test('isExampleEnvFile detects example/template files', () => {
  assert.equal(isExampleEnvFile('.env'), false);
  assert.equal(isExampleEnvFile('.env.local'), false);
  assert.equal(isExampleEnvFile('.env.production'), false);
  assert.equal(isExampleEnvFile('.env.example'), true);
  assert.equal(isExampleEnvFile('.env.sample'), true);
  assert.equal(isExampleEnvFile('.env.template'), true);
  assert.equal(isExampleEnvFile('.env.dist'), true);
  assert.equal(isExampleEnvFile('.env.default'), true);
  assert.equal(isExampleEnvFile('.env.defaults'), true);
  assert.equal(isExampleEnvFile('/path/to/.env.example'), true);
  assert.equal(isExampleEnvFile('.env.EXAMPLE'), true);

  assert.equal(isExampleEnvFile('api.env'), false);
  assert.equal(isExampleEnvFile('database.env'), false);
  assert.equal(isExampleEnvFile('api.env.local'), false);
  assert.equal(isExampleEnvFile('api.env.example'), true);
  assert.equal(isExampleEnvFile('database.env.sample'), true);
  assert.equal(isExampleEnvFile('config.env.template'), true);
  assert.equal(isExampleEnvFile('/path/to/api.env.example'), true);
});
