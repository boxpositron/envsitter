# Changelog

All notable changes to this project are documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## 0.1.0 (Unreleased)

### Added

- Path policy helpers: `isEnvFile`, `isSensitiveEnvFile`, and `isEnvSitterPepperFile`, alongside `isExampleEnvFile`.
  - Env files are `.env`, `.env.<suffix>`, `<name>.env`, and `<name>.env.<suffix>`; source files such as `app.env.ts` are not.
  - Sensitive env files are every env file except example/template files.
  - `envsitter-guard` uses these helpers, so the library and the plugin agree on what is sensitive.
- Type exports: `AnnotatePlan`, `CopyConflictPolicy`, `CopyPlanItem`, `DotenvIssue`, `FormatMode`, `FormatSort`.
- Release automation: CI on every push and pull request (Node 22, 24, and 26), and tag-driven releases published with npm trusted publishing, so packages carry provenance attestations.
- Documentation site at https://boxpositron.github.io/envsitter/ (source in `site/`, deployed by GitHub Pages).
- `EnvSitter#redactor()` and the `envsitter redact` command replace secret-looking values in arbitrary text with `[envsitter: KEY redacted]` without returning the values. `envsitter-guard` uses it to scrub tool output.
- When envsitter creates `.envsitter/`, it also writes `.envsitter/.gitignore` (`*`), so the pepper stays out of git even if the project's `.gitignore` does not list it.
- CI also runs on macOS and Windows, and Dependabot proposes npm and GitHub Actions updates weekly (with a 7-day cooldown).

### Changed

- One dotenv grammar: `parseDotenv` (used by `EnvSitter` sources) now derives from the round-trip document parser used by `validate` and the file operations.
  - Read-path parse errors now carry a `column` and use the same messages as `validate`.
  - `export` followed by a tab is accepted on the read path.
- CLI file commands (`validate`, `copy`, `format`/`reorder`, `annotate`, `add`, `set`, `unset`, `delete`) now run through the library file operations, so the CLI and the library cannot drift.
  - `validate --json` output now includes `file`; `annotate --json` output now includes `key`.
- Package version bumped to `0.1.0`.
- `npm pack` and `npm publish` now build `dist/` first (`prepack`), so a publish can never ship stale or missing output.
- Requires Node.js 22 or later (`engines`).
- The npm package no longer ships the compiled test suite (`dist/test`).

### Fixed

- File writes no longer loosen permissions: a `0600` env file came back `0644` (world-readable) after any `--write` / `write: true` edit. Writes now keep the existing mode, and new files are created `0600`.
- Writing to a symlinked env file now updates the link's target instead of replacing the symlink with a regular file.
- An existing pepper file that is empty, too short, or unreadable is no longer silently replaced with a new pepper (which changed every fingerprint); envsitter now stops with an error naming the file. Two processes creating the pepper at the same time can no longer overwrite each other's.
- `set`, `add`, and `copy` into an empty or new env file write `KEY=value` plus a trailing newline instead of a leading blank line and no trailing newline, and report the key on line 1.
- Regexes with the `g` or `y` flag no longer skip every other key in `listKeys` filters, `scan` key filters, `partial_match_regex`, and `copy` include/exclude.
- `match-by-key` rejects non-object JSON and non-string candidates with a clear error instead of a `TypeError`.

## 0.0.4 (2026-01-15)

### Added

- Key mutation commands (CLI): `add`, `set`, `unset`, `delete`.
  - `add`: Add a new key-value pair (fails if key already exists).
  - `set`: Create or update a key-value pair (idempotent).
  - `unset`: Set a key's value to empty (`KEY=`).
  - `delete`: Remove key(s) from the file entirely (supports `--keys` for multiple).
- Value auto-quoting: Values with spaces, `#`, quotes, newlines, or other special characters are automatically double-quoted with proper escaping.
- Example file detection: Warns when targeting `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.default(s)` files. Suppressible with `--no-example-warning`.
- Library API exports for key mutations: `addEnvFileKey`, `setEnvFileKey`, `unsetEnvFileKey`, `deleteEnvFileKeys`.
- Utility export: `isExampleEnvFile` for detecting example/template env files.
- Test coverage for new mutation operations.

### Changed

- Package version bumped to `0.0.4`.
- Updated CLI help text to include new commands and notes about dry-run behavior.
- Updated README with documentation for new commands and library API.

## 0.0.3 (2026-01-13)

### Added

- Dotenv file operations (CLI): `validate`, `copy`, `format`/`reorder`, and `annotate`.
- Round-trippable dotenv parsing for file ops (preserves comments/blank lines) with issue reporting that includes line/column.
- Library API exports for file ops: `validateEnvFile`, `copyEnvFileKeys`, `formatEnvFile`, `annotateEnvFile`.
- Test coverage for file operations.

### Changed

- Package version bumped to `0.0.3`.

## 0.0.2 (2026-01-12)

### Added

- Match operators for boolean checks beyond strict equality:
  - `exists`, `is_empty`, `is_equal`, `partial_match_prefix`, `partial_match_suffix`, `partial_match_regex`, `is_number`, `is_boolean`, `is_string`.
- CLI support for `match --op <op>`.
- Library support for `EnvSitter.matchKey()` / `EnvSitter.matchKeyBulk()` with matcher operators.
- More tests for matcher operators.

### Changed

- Expanded CLI docs and output contract guidance in `README.md`.
- Added a reference to `envsitter-guard` in documentation.

## 0.0.1

### Added

- Initial public release.
- CLI commands: `keys`, `fingerprint`, `match`, `match-by-key`, `scan`.
- Library API: `EnvSitter` with safe key listing, deterministic fingerprints (HMAC-SHA-256 + pepper), and outside-in matching.
- Support for dotenv sources via local file and external command.
