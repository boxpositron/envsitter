# AGENTS.md (envsitter)

This repo contains `envsitter`: a TypeScript (ESM) library + CLI for safely inspecting and matching `.env` secrets without exposing values.

## Ground rules (security)

- Never print or log raw secret values from `.env` files or external providers.
- Do not add any API that returns a plaintext value (no `getValue()` style APIs).
- Prefer comparisons via deterministic fingerprints (HMAC) and boolean match results.
- Prefer passing candidate secrets via stdin (to avoid shell history): `--candidate-stdin`.
- Keep all generated peppers/secrets out of git (see `.gitignore`).
- `envsitter-guard` (separate repo) exposes this package's exports to AI agents as tools, so every new export is agent-reachable.

## Project layout

- `src/index.ts`: public exports (the only surface npm users and `envsitter-guard` see)
- `src/envsitter.ts`: `EnvSitter` read-only facade (keys, fingerprints, matchers, scan, redactor)
- `src/cli.ts`: CLI entrypoint (`bin` -> `dist/cli.js`); one `if (cmd === ...)` block per command in `run()`
- `src/file-ops.ts`: file-level mutations for the library API (read, edit, atomic write only when `write: true`)
- `src/pepper.ts`: pepper resolution + auto-create; `src/fingerprint.ts`: HMAC-SHA-256
- `src/sources/`: `DotenvFileSource`, `ExternalCommandSource` (both parse with `dotenv/parse.ts`)
- `src/dotenv/document.ts`: the only dotenv grammar; round-trippable, keeps comments, blank lines, and line/column issues
- `src/dotenv/parse.ts`: values-only view of `document.ts` (read path)
- `src/dotenv/edit.ts`: pure string-in/string-out edits (copy, format, annotate, add/set/unset/delete); owns the edit types that `file-ops.ts` re-exports
- `src/dotenv/io.ts`: `readTextFileOrEmpty`, `writeTextFileAtomic` (keeps file mode, writes through symlinks, new files `0600`); `src/dotenv/utils.ts`: value quoting
- `src/paths.ts`: path policy (`isEnvFile`, `isExampleEnvFile`, `isSensitiveEnvFile`, `isEnvSitterPepperFile`)
- `src/regex.ts`: `regexTest`; use it for every user-supplied regex (resets `lastIndex` for `g`/`y` flags)
- `src/redact.ts`: `createRedactor` behind `EnvSitter#redactor()` and the `redact` command; decides which values look secret (key names, token shape, URL passwords, PEM)
- `src/test/*.test.ts`: Node test suite (compiled to `dist/test/*.test.js`); `cli.test.ts` spawns `dist/cli.js`
- `.github/workflows/`: `ci.yml` (push, PR, reusable), `release.yml` (tag `vX.Y.Z` -> CI -> npm trusted publishing -> GitHub Release), `pages.yml` (deploys `site/`); `.github/dependabot.yml` groups weekly npm and Actions updates
- `.github/scripts/changelog-section.mjs`: prints a version's CHANGELOG section; fails if missing or still `(Unreleased)`
- `site/`: static docs site for envsitter and envsitter-guard (no build step); `site/DESIGN.md` is its design contract and is not published

### Gotchas

- Grammar changes go in `dotenv/document.ts` only; `parseDotenv`, `validate`, and every edit follow automatically.
- CLI file commands are thin wrappers over `file-ops.ts`; change behavior there, then keep the CLI's text (non-JSON) output in step.
- `src/paths.ts` is the policy `envsitter-guard` enforces. Widening or narrowing `isSensitiveEnvFile` changes what agents are blocked from; add a case to `paths.test.ts` for every change.
- `src/test/envsitter.test.ts` resolves the default pepper (`<cwd>/.envsitter/pepper`) unless `ENVSITTER_PEPPER` is set, so `npm test` creates that file on first run.

## Build / typecheck / test

There is no linter configured (no ESLint/Prettier). Use `tsc` + tests as quality gates. Husky pre-commit runs `npm test`.

```bash
npm install
npm run build       # tsc -p tsconfig.json -> dist/
npm run typecheck   # tsc --noEmit
npm test            # build, then scripts/run-tests.mjs runs every dist/test/*.test.js
# tests execute from compiled JS, so build before running one file or one test
npm run build && node --test dist/test/envsitter.test.js
npm run build && node --test --test-name-pattern "outside-in" dist/test/envsitter.test.js
```

`--test-name-pattern` takes a substring/regex matching the `test('name', ...)` title.

### Releasing

- Bump `package.json`, date the CHANGELOG heading, commit, push tag `vX.Y.Z`. The Release workflow does the rest; never `npm publish` by hand.
- Push to `origin` (Gitea, `git.boxpositron.dev`); it mirrors to GitHub, where the workflows run. Jobs are guarded with `if: github.server_url == 'https://github.com'` so Gitea's runner skips them.
- npm trusted publishing (OIDC) authenticates the publish; no npm token exists in the repo. Keep `release.yml` as the publishing workflow name, because the npm trusted-publisher config pins it.

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
