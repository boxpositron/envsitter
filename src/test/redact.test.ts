import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EnvSitter } from '../index.js';
import { createRedactor } from '../redact.js';

const envContents = [
  'API_TOKEN=tok_live_9f8a7b6c5d4e',
  'NODE_ENV=development',
  'PORT=3000',
  'DEBUG=true',
  'NEXTAUTH_URL=http://localhost:3000',
  'DATABASE_URL=postgres://app:s3cretPassw0rd@db:5432/app',
  'SESSION_SIGNING=Zq8xV2mN4pL7rT1y'
].join('\n');

async function makeEnvFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'envsitter-redact-'));
  const file = join(dir, '.env');
  await writeFile(file, contents, 'utf8');
  return file;
}

test('redactor replaces secret-looking values and leaves ordinary config alone', async () => {
  const redactor = await EnvSitter.fromDotenvFile(await makeEnvFile(envContents)).redactor();
  assert.deepEqual(redactor.keys, ['API_TOKEN', 'DATABASE_URL', 'SESSION_SIGNING']);

  const text = [
    'auth: Bearer tok_live_9f8a7b6c5d4e',
    'env=development port=3000 debug=true url=http://localhost:3000',
    'db: postgres://app:s3cretPassw0rd@db:5432/app (password s3cretPassw0rd)',
    'signing: Zq8xV2mN4pL7rT1y'
  ].join('\n');
  const result = redactor.redact(text);

  for (const secret of ['tok_live_9f8a7b6c5d4e', 's3cretPassw0rd', 'Zq8xV2mN4pL7rT1y']) {
    assert.ok(!result.text.includes(secret), `${secret} should be redacted`);
  }
  assert.ok(result.text.includes('Bearer [envsitter: API_TOKEN redacted]'));
  assert.ok(result.text.includes('env=development port=3000 debug=true url=http://localhost:3000'));
  assert.deepEqual(result.redactions, [
    { key: 'API_TOKEN', count: 1 },
    { key: 'DATABASE_URL', count: 2 },
    { key: 'SESSION_SIGNING', count: 1 }
  ]);
});

test('redactor options widen or narrow what is redacted', async () => {
  const sitter = EnvSitter.fromDotenvFile(await makeEnvFile(envContents));

  const all = await sitter.redactor({ all: true });
  assert.ok(all.keys.includes('NODE_ENV'));
  assert.ok(!all.keys.includes('PORT'), 'plain numbers are never redacted');
  assert.equal(all.redact('mode development').text, 'mode [envsitter: NODE_ENV redacted]');

  const strict = await sitter.redactor({ all: true, minLength: 12 });
  assert.ok(!strict.keys.includes('NODE_ENV'));
  assert.equal(strict.redact('mode development').text, 'mode development');
});

test('redactor covers each random-looking line of a multi-line key', () => {
  const pemBody = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7';
  const pem = ['-----BEGIN PRIVATE KEY-----', pemBody, '-----END PRIVATE KEY-----'].join('\n');
  const redactor = createRedactor(new Map([['TLS_CERT_DATA', pem]]));

  const result = redactor.redact(`partial dump: ${pemBody}\nheader: -----BEGIN PRIVATE KEY-----`);
  assert.ok(!result.text.includes(pemBody));
  assert.ok(result.text.includes('header: -----BEGIN PRIVATE KEY-----'));
  assert.deepEqual(result.redactions, [{ key: 'TLS_CERT_DATA', count: 1 }]);
});

test('redactor uses the valid lines of a file that has invalid lines', async () => {
  const file = await makeEnvFile(['export NODE_BINARY=$(command -v node)', 'if [ -f .xcode.env.local ]; then', 'API_TOKEN=tok_live_9f8a7b6c5d4e', 'fi'].join('\n'));
  const sitter = EnvSitter.fromDotenvFile(file);

  await assert.rejects(() => sitter.listKeys(), /Invalid dotenv file/);
  const redactor = await sitter.redactor();
  assert.deepEqual(redactor.keys, ['API_TOKEN']);
  assert.equal(redactor.redact('token tok_live_9f8a7b6c5d4e').text, 'token [envsitter: API_TOKEN redacted]');
});

test('redactor returns text unchanged when nothing looks secret', () => {
  const redactor = createRedactor(new Map([['NODE_ENV', 'production'], ['PORT', '8080']]));
  assert.deepEqual(redactor.keys, []);
  assert.deepEqual(redactor.redact('production on 8080'), { text: 'production on 8080', redactions: [] });
});
