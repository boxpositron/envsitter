import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../cli.js', import.meta.url));

type CliResult = { code: number; stdout: string; stderr: string };

function runCli(args: string[], input?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, ENVSITTER_PEPPER: 'cli-test-pepper' } }, (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : 0;
      resolve({ code, stdout, stderr });
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

async function makeTempFile(fileName: string, contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'envsitter-cli-'));
  const filePath = join(dir, fileName);
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}

test('cli validate --json reports file, ok, and issues', async () => {
  const file = await makeTempFile('.env', 'GOOD=secret-value\nBAD-KEY=x\n');

  const result = await runCli(['validate', '--file', file, '--json']);
  assert.equal(result.code, 2);
  assert.ok(!result.stdout.includes('secret-value'));

  const parsed = JSON.parse(result.stdout) as { file: string; ok: boolean; issues: Array<{ line: number; column: number }> };
  assert.equal(parsed.file, file);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.issues[0]?.line, 2);
});

test('cli set is a dry run until --write and never prints the value', async () => {
  const file = await makeTempFile('.env', 'A=1\n');

  const dryRun = await runCli(['set', '--file', file, '--key', 'TOKEN', '--value', 'super-secret', '--json']);
  assert.equal(dryRun.code, 0);
  assert.ok(!dryRun.stdout.includes('super-secret'));
  const planned = JSON.parse(dryRun.stdout) as { willWrite: boolean; wrote: boolean; plan: { action: string } };
  assert.equal(planned.wrote, false);
  assert.equal(planned.plan.action, 'added');
  assert.equal(await readFile(file, 'utf8'), 'A=1\n');

  const written = await runCli(['set', '--file', file, '--key', 'TOKEN', '--value', 'super-secret', '--write', '--json']);
  assert.equal(written.code, 0);
  assert.equal((JSON.parse(written.stdout) as { wrote: boolean }).wrote, true);
  assert.equal(await readFile(file, 'utf8'), 'A=1\nTOKEN=super-secret\n');
});

test('cli delete exits 2 when no key was found', async () => {
  const file = await makeTempFile('.env', 'A=1\n');

  const result = await runCli(['delete', '--file', file, '--key', 'MISSING', '--json']);
  assert.equal(result.code, 2);
  const parsed = JSON.parse(result.stdout) as { keys: string[]; plan: Array<{ action: string }> };
  assert.deepEqual(parsed.keys, ['MISSING']);
  assert.equal(parsed.plan[0]?.action, 'not_found');
});

test('cli redact replaces secret values in stdin and reports counts', async () => {
  const file = await makeTempFile('.env', 'API_TOKEN=tok_live_9f8a7b6c5d4e\nNODE_ENV=development\n');
  const log = 'start development\ncalling with tok_live_9f8a7b6c5d4e\n';

  const plain = await runCli(['redact', '--file', file], log);
  assert.equal(plain.code, 0);
  assert.equal(plain.stdout, 'start development\ncalling with [envsitter: API_TOKEN redacted]\n');
  assert.match(plain.stderr, /redacted 1 occurrence\(s\) of API_TOKEN/);

  const json = await runCli(['redact', '--file', file, '--json'], log);
  assert.equal(json.code, 0);
  assert.ok(!json.stdout.includes('tok_live_9f8a7b6c5d4e'));
  assert.deepEqual((JSON.parse(json.stdout) as { redactions: unknown }).redactions, [{ key: 'API_TOKEN', count: 1 }]);

  const bad = await runCli(['redact', '--file', file, '--min-length', '0'], log);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--min-length must be a positive integer/);
});

test('cli match-by-key rejects non-string candidates', async () => {
  const file = await makeTempFile('.env', 'A=1\n');

  const result = await runCli(['match-by-key', '--file', file, '--candidates-json', '{"A":1}']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Candidate for A must be a string/);
});
