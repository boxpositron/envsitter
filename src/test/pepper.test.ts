import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
  } finally {
    if (prevEnvSitterPepper === undefined) delete process.env.ENVSITTER_PEPPER;
    else process.env.ENVSITTER_PEPPER = prevEnvSitterPepper;

    if (prevEnvSitterPepperAlt === undefined) delete process.env.ENV_SITTER_PEPPER;
    else process.env.ENV_SITTER_PEPPER = prevEnvSitterPepperAlt;
  }
});
