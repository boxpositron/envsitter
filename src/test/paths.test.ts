import test from 'node:test';
import assert from 'node:assert/strict';

import { isEnvFile, isEnvSitterPepperFile, isExampleEnvFile, isSensitiveEnvFile } from '../index.js';

test('isEnvFile recognizes dotenv file names in any directory', () => {
  for (const name of ['.env', '.env.local', '.env.production.local', 'api.env', 'config.env.local', 'nested/dir/.env', 'C:\\app\\.env.keys', '.ENV']) {
    assert.equal(isEnvFile(name), true, name);
  }

  for (const name of ['env', '.envrc', 'environment.ts', 'src/env.ts', 'app.env.ts', '.env.d.ts', 'vite-env.d.ts', 'README.md', '.envsitter/pepper']) {
    assert.equal(isEnvFile(name), false, name);
  }
});

test('isSensitiveEnvFile excludes example and template files', () => {
  for (const name of ['.env', '.env.local', 'api.env', '.env.example.local', 'deploy/.env.production']) {
    assert.equal(isSensitiveEnvFile(name), true, name);
  }

  for (const name of ['.env.example', '.env.sample', '.env.template', '.env.dist', '.env.default', '.env.defaults', 'api.env.example', 'src/index.ts']) {
    assert.equal(isSensitiveEnvFile(name), false, name);
  }

  assert.equal(isExampleEnvFile('api.env.sample'), true);
});

test('isEnvSitterPepperFile matches the default pepper location only', () => {
  assert.equal(isEnvSitterPepperFile('.envsitter/pepper'), true);
  assert.equal(isEnvSitterPepperFile('/repo/.envsitter/pepper'), true);
  assert.equal(isEnvSitterPepperFile('C:\\repo\\.envsitter\\pepper'), true);
  assert.equal(isEnvSitterPepperFile('.envsitter/pepper.bak'), false);
  assert.equal(isEnvSitterPepperFile('pepper'), false);
});
