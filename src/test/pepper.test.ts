import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePepper } from '../pepper.js';

test('resolvePepper reads from env when set', async () => {
  const prev = process.env.ENVSITTER_PEPPER;
  process.env.ENVSITTER_PEPPER = 'unit-test-pepper';

  try {
    const pepper = await resolvePepper({ createIfMissing: false });
    assert.equal(pepper.source, 'env');
    assert.equal(new TextDecoder().decode(pepper.pepperBytes), 'unit-test-pepper');
  } finally {
    if (prev === undefined) delete process.env.ENVSITTER_PEPPER;
    else process.env.ENVSITTER_PEPPER = prev;
  }
});

test('resolvePepper creates a pepper file when missing', async () => {
  const prevEnvSitterPepper = process.env.ENVSITTER_PEPPER;
  const prevEnvSitterPepperAlt = process.env.ENV_SITTER_PEPPER;
  delete process.env.ENVSITTER_PEPPER;
  delete process.env.ENV_SITTER_PEPPER;

  try {
    const dir = await mkdtemp(join(tmpdir(), 'envsitter-'));
    const pepperPath = join(dir, 'pepper');

    const pepper = await resolvePepper({ pepperFilePath: pepperPath });
    assert.equal(pepper.source, 'file');
    assert.equal(pepper.pepperFilePath, pepperPath);
    assert.ok(pepper.pepperBytes.length >= 16);

    const persisted = (await readFile(pepperPath, 'utf8')).trim();
    assert.ok(persisted.length > 0);

    const projectPepperPath = join(dir, 'project', '.envsitter', 'pepper');
    await resolvePepper({ pepperFilePath: projectPepperPath });
    assert.equal(await readFile(join(dir, 'project', '.envsitter', '.gitignore'), 'utf8'), '*\n');
  } finally {
    if (prevEnvSitterPepper === undefined) delete process.env.ENVSITTER_PEPPER;
    else process.env.ENVSITTER_PEPPER = prevEnvSitterPepper;

    if (prevEnvSitterPepperAlt === undefined) delete process.env.ENV_SITTER_PEPPER;
    else process.env.ENV_SITTER_PEPPER = prevEnvSitterPepperAlt;
  }
});

async function withoutEnvPepper(fn: () => Promise<void>): Promise<void> {
  const saved = [process.env.ENVSITTER_PEPPER, process.env.ENV_SITTER_PEPPER] as const;
  delete process.env.ENVSITTER_PEPPER;
  delete process.env.ENV_SITTER_PEPPER;
  try {
    await fn();
  } finally {
    if (saved[0] === undefined) delete process.env.ENVSITTER_PEPPER;
    else process.env.ENVSITTER_PEPPER = saved[0];
    if (saved[1] === undefined) delete process.env.ENV_SITTER_PEPPER;
    else process.env.ENV_SITTER_PEPPER = saved[1];
  }
}

test('resolvePepper refuses to replace a malformed pepper file', async () => {
  await withoutEnvPepper(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'envsitter-'));

    const empty = join(dir, 'empty-pepper');
    await writeFile(empty, '');
    await assert.rejects(() => resolvePepper({ pepperFilePath: empty }), /is empty/);
    assert.equal(await readFile(empty, 'utf8'), '');

    const short = join(dir, 'short-pepper');
    await writeFile(short, 'c2hvcnQ=');
    await assert.rejects(() => resolvePepper({ pepperFilePath: short }), /too short/);
    assert.equal(await readFile(short, 'utf8'), 'c2hvcnQ=');

    await assert.rejects(() => resolvePepper({ pepperFilePath: join(dir, 'missing'), createIfMissing: false }), /does not exist/);
  });
});

const canTestUnreadable = process.platform !== 'win32' && process.getuid?.() !== 0;

test('resolvePepper surfaces an unreadable pepper file instead of replacing it', { skip: canTestUnreadable ? false : 'needs POSIX permissions and a non-root user' }, async () => {
  await withoutEnvPepper(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'envsitter-'));
    const locked = join(dir, 'pepper');
    await writeFile(locked, 'original-pepper');
    await chmod(locked, 0o000);

    try {
      await assert.rejects(() => resolvePepper({ pepperFilePath: locked }), { code: 'EACCES' });
    } finally {
      await chmod(locked, 0o600);
    }
    assert.equal(await readFile(locked, 'utf8'), 'original-pepper');
  });
});
