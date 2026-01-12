# AGENTS.md (envsitter)

This repo contains `envsitter`: a TypeScript (ESM) library + CLI for safely inspecting and matching `.env` secrets without exposing values.

## Ground rules (security)

- Never print or log raw secret values from `.env` files or external providers.
- Do not add any API that returns a plaintext value (no `getValue()` style APIs).
- Prefer comparisons via deterministic fingerprints (HMAC) and boolean match results.
- Prefer passing candidate secrets via stdin (to avoid shell history): `--candidate-stdin`.
- Keep all generated peppers/secrets out of git (see `.gitignore`).

## Project layout

- `src/envsitter.ts`: main library surface (`EnvSitter`)
- `src/cli.ts`: CLI entrypoint
- `src/dotenv/parse.ts`: minimal dotenv parser
- `src/pepper.ts`: pepper resolution + auto-create
- `src/test/*.test.ts`: Node test suite (compiled to `dist/test/*.test.js`)

## Build / typecheck / test

There is no linter configured (no ESLint/Prettier). Use `tsc` + tests as quality gates.

### Install

- `npm install`

### Build

- `npm run build`
  - Runs `tsc -p tsconfig.json` and outputs to `dist/`

### Typecheck only

- `npm run typecheck`

### Run all tests

- `npm test`
  - Runs `npm run build` then `node scripts/run-tests.mjs`

### Run a single test file

Tests are written in TS but executed from compiled JS.

- `npm run build`
- `node --test dist/test/envsitter.test.js`

### Run a single test by name/pattern

- `npm run build`
- `node --test --test-name-pattern "outside-in" dist/test/envsitter.test.js`

(Use a substring/regex that matches the `test('name', ...)` title.)

### Bun

The CLI is runnable under Bun:

- `bun src/cli.ts keys --file .env`

Tests currently run under Node’s built-in test runner. If you add Bun tests, keep Node tests working.

## Code style and conventions

### TypeScript / module system

- This repo is ESM: `"type": "module"` in `package.json`.
- TS config is strict and includes:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true`
- Use ESM import specifiers with `.js` extensions when importing local TS modules.
  - Example: `import { parseDotenv } from '../dotenv/parse.js'`
- Prefer `node:` specifiers for built-ins:
  - `import { readFile } from 'node:fs/promises'`

### Formatting

- No formatter is enforced.
- Keep diffs small and consistent with existing file style.
- Prefer 2-space indentation and trailing commas where already used.

### Imports

- Group imports by origin:
  1) `node:` built-ins
  2) third-party (if any)
  3) local `./` and `../`
- Avoid unused imports; keep import lists minimal.

### Naming

- Types: `PascalCase` (`EnvSitterFingerprint`)
- Functions/vars: `camelCase` (`resolvePepper`, `candidateValue`)
- Constants: `camelCase` unless truly global constant.
- File names: `kebab-case.ts` for tests; otherwise match existing structure.

### Types and optional properties (important)

`exactOptionalPropertyTypes` is enabled.

- Do not pass `undefined` as a value for an optional property.
  - Prefer conditional spreads:
    - `...(maybe ? { prop: maybe } : {})`
- Prefer returning `undefined` by omitting optional properties rather than setting them.

### Error handling

- Prefer throwing `Error` with actionable messages.
- Avoid empty `catch` blocks.
- Avoid logging by default. If debugging output is needed:
  - Gate it behind `process.env.ENVSITTER_DEBUG === '1'`.

### Security-sensitive comparisons

- Use constant-time comparison for digests:
  - `timingSafeEqual` for fingerprint digest bytes.

### IO and side effects

- `.env` values should only exist in memory.
- Pepper auto-creation is allowed, but must write only to the gitignored location:
  - default: `.envsitter/pepper`
- Never write `.env` values elsewhere (no caches, no exports to new files).

## CLI behavior

- CLI should return useful exit codes:
  - `0` success / match found
  - `1` mismatch / no match found
  - `2` usage or runtime error
- Prefer JSON output for machine consumption when `--json` is provided.
- Never print secret values; only keys, booleans, metadata (length), and fingerprints.

## Editor/assistant rules

- No Cursor rules found in `.cursor/rules/` or `.cursorrules`.
- No Copilot instructions found in `.github/copilot-instructions.md`.

If you add any of the above rule files later, update this document to summarize the relevant constraints.
