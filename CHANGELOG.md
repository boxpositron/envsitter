# Changelog

All notable changes to this project are documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

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
