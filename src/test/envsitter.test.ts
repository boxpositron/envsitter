import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvSitter } from '../envsitter.js';

async function makeTempDotenv(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'envsitter-'));
  const filePath = join(dir, '.env');
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}

test('EnvSitter lists keys and fingerprints without returning values', async () => {
  const filePath = await makeTempDotenv('A=1\nB=two\n');
  const es = EnvSitter.fromDotenvFile(filePath);

  const keys = await es.listKeys();
  assert.deepEqual(keys, ['A', 'B']);

  const fp = await es.fingerprintKey('B');
  assert.equal(fp.key, 'B');
  assert.equal(fp.algorithm, 'hmac-sha256');
  assert.equal(fp.length, 3);
  assert.ok(fp.fingerprint.length > 10);
});

test('EnvSitter matches a candidate for a key (outside-in)', async () => {
  const filePath = await makeTempDotenv('OPENAI_API_KEY=sk-test-123\n');
  const es = EnvSitter.fromDotenvFile(filePath);

  assert.equal(await es.matchCandidate('OPENAI_API_KEY', 'sk-test-123'), true);
  assert.equal(await es.matchCandidate('OPENAI_API_KEY', 'nope'), false);
  assert.equal(await es.matchCandidate('MISSING', 'sk-test-123'), false);
});

test('EnvSitter bulk matching works across keys and by-key candidates', async () => {
  const filePath = await makeTempDotenv('K1=V1\nK2=V2\n');
  const es = EnvSitter.fromDotenvFile(filePath);

  const bulk = await es.matchCandidateBulk(['K1', 'K2'], 'V2');
  assert.deepEqual(bulk, [
    { key: 'K1', match: false },
    { key: 'K2', match: true }
  ]);

  const byKey = await es.matchCandidatesByKey({ K1: 'V1', K2: 'nope' });
  assert.deepEqual(byKey, [
    { key: 'K1', match: true },
    { key: 'K2', match: false }
  ]);
});

test('EnvSitter scan detects JWT-like and URL values without exposing them', async () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sgn';
  const filePath = await makeTempDotenv(`JWT=${jwt}\nURL=https://example.com\nNOISE=hello\n`);
  const es = EnvSitter.fromDotenvFile(filePath);

  const findings = await es.scan({ detect: ['jwt', 'url', 'base64'] });
  assert.deepEqual(findings, [
    { key: 'JWT', detections: ['jwt'] },
    { key: 'URL', detections: ['url'] }
  ]);
});
