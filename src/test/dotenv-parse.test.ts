import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDotenv } from '../dotenv/parse.js';

test('parseDotenv parses basic assignments and ignores comments', () => {
  const input = [
    '# comment',
    'FOO=bar',
    'export BAZ=qux',
    'EMPTY=',
    'TRAILING=ok # inline',
    ''
  ].join('\n');

  const parsed = parseDotenv(input);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.values.get('FOO'), 'bar');
  assert.equal(parsed.values.get('BAZ'), 'qux');
  assert.equal(parsed.values.get('EMPTY'), '');
  assert.equal(parsed.values.get('TRAILING'), 'ok');
});

test('parseDotenv supports quoted values', () => {
  const input = [
    "SINGLE='a b c'",
    'DOUBLE="a\\n\\t\\r\\\\b"'
  ].join('\n');

  const parsed = parseDotenv(input);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.values.get('SINGLE'), 'a b c');
  assert.equal(parsed.values.get('DOUBLE'), 'a\n\t\r\\b');
});

test('parseDotenv reports invalid keys', () => {
  const input = 'NOT-OK=value\nOK=value2';
  const parsed = parseDotenv(input);
  assert.ok(parsed.errors.length >= 1);
  assert.equal(parsed.values.get('OK'), 'value2');
});
