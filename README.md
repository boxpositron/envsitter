# envsitter

Safely inspect and match `.env` secrets **without ever printing values**.

`envsitter` is designed for LLM/agent workflows where you want to:

- List keys present in an env source (`.env` file or external provider)
- Compare a key’s value to a candidate value you provide at runtime ("outside-in")
- Do bulk matching (one candidate against many keys, or candidates-by-key)
- Produce deterministic fingerprints for comparisons/auditing
- Ask boolean questions about values (empty/prefix/suffix/regex/type-ish checks) without ever returning the value

Related: https://github.com/boxpositron/envsitter-guard — an OpenCode plugin that blocks agents/tools from reading or editing sensitive `.env*` files (preventing accidental secret leaks), while still allowing safe inspection via EnvSitter-style tools (keys + deterministic fingerprints; never values).

## Security model (what this tool does and does not do)

- Values are read in-process for comparisons, but **never returned** by the library API and **never printed** by the CLI.
- Deterministic matching uses **HMAC-SHA-256** with a local pepper.
  - This avoids publishing raw SHA-256 hashes that are easy to dictionary-guess.
- Candidate secrets should be passed via stdin (`--candidate-stdin`) to avoid shell history.

Non-goals:

- This tool is not a secret manager.
- This tool does not encrypt or relocate `.env` values; it operates on sources in-place.

## Install

```bash
npm install envsitter
```

Or run the CLI without installing globally:

```bash
npx envsitter keys --file .env
```

## Pepper (required for deterministic fingerprints)

`envsitter` uses a local "pepper" as the HMAC key.

Resolution order:

1. `process.env.ENVSITTER_PEPPER` (or `ENV_SITTER_PEPPER`)
2. Pepper file at `.envsitter/pepper` (auto-created if missing)

The pepper file is created with mode `0600` when possible, and `.envsitter/` is gitignored.

## CLI usage

Commands:

- `keys --file <path> [--filter-regex <re>]`
- `fingerprint --file <path> --key <KEY>`
- `match --file <path> (--key <KEY> | --keys <K1,K2> | --all-keys) [--op <op>] [--candidate <value> | --candidate-stdin]`
- `match-by-key --file <path> (--candidates-json <json> | --candidates-stdin)`
- `scan --file <path> [--keys-regex <re>] [--detect jwt,url,base64]`
- `validate --file <path>`
- `copy --from <path> --to <path> [--keys <K1,K2>] [--include-regex <re>] [--exclude-regex <re>] [--rename <A=B,C=D>] [--on-conflict error|skip|overwrite] [--write]`
- `format --file <path> [--mode sections|global] [--sort alpha|none] [--write]`
- `reorder --file <path> [--mode sections|global] [--sort alpha|none] [--write]`
- `annotate --file <path> --key <KEY> --comment <text> [--line <n>] [--write]`
- `add --file <path> --key <KEY> [--value <v> | --value-stdin] [--write]`
- `set --file <path> --key <KEY> [--value <v> | --value-stdin] [--write]`
- `unset --file <path> --key <KEY> [--write]`
- `delete --file <path> (--key <KEY> | --keys <K1,K2>) [--write]`

Notes for file operations:

- Commands that modify files (`copy`, `format`/`reorder`, `annotate`, `add`, `set`, `unset`, `delete`) are dry-run unless `--write` is provided.
- These commands never print secret values; output includes keys, booleans, and line numbers only.
- When targeting example files (`.env.example`, `.env.sample`, `.env.template`), a warning is emitted. Use `--no-example-warning` to suppress.

### List keys

```bash
envsitter keys --file .env
```

Filter by key name (regex):

```bash
envsitter keys --file .env --filter-regex "/(KEY|TOKEN|SECRET)/i"
```

### Fingerprint a single key

```bash
envsitter fingerprint --file .env --key OPENAI_API_KEY
```

Outputs JSON containing the key’s fingerprint and metadata (never the value).

### Match a candidate against a single key (recommended via stdin)

```bash
node -e "process.stdout.write('candidate-secret')" \
  | envsitter match --file .env --key OPENAI_API_KEY --candidate-stdin --json
```

Exit codes:

- `0` match found
- `1` no match
- `2` error/usage

### Match operators (for humans)

`envsitter match` supports an `--op` flag.

- Default: `--op is_equal`
- When `--op is_equal` is used, EnvSitter hashes both the candidate and stored value with the local pepper (HMAC-SHA-256) and compares digests using constant-time equality.
- Other operators evaluate against the raw value in-process, but still only return booleans/match results (no values are returned or printed).

Operators:

- `exists`: key is present in the source (no candidate required)
- `is_empty`: value is exactly empty string (no candidate required)
- `is_equal`: deterministic match against a candidate value (candidate required)
- `partial_match_prefix`: `value.startsWith(candidate)` (candidate required)
- `partial_match_suffix`: `value.endsWith(candidate)` (candidate required)
- `partial_match_regex`: regex test against value (candidate required; candidate is a regex like `"/^sk-/"` or a raw regex body)
- `is_number`: value parses as a finite number (no candidate required)
- `is_boolean`: value is `true`/`false` (case-insensitive, whitespace-trimmed) (no candidate required)
- `is_string`: value is neither `is_number` nor `is_boolean` (no candidate required)

Examples:

```bash
# Prefix match
node -e "process.stdout.write('sk-')" \
  | envsitter match --file .env --key OPENAI_API_KEY --op partial_match_prefix --candidate-stdin

# Regex match (regex literal syntax)
node -e "process.stdout.write('/^sk-[a-z]+-/i')" \
  | envsitter match --file .env --key OPENAI_API_KEY --op partial_match_regex --candidate-stdin

# Exists (no candidate)
envsitter match --file .env --key OPENAI_API_KEY --op exists --json
```

### Match one candidate against multiple keys

```bash
node -e "process.stdout.write('candidate-secret')" \
  | envsitter match --file .env --keys OPENAI_API_KEY,ANTHROPIC_API_KEY --candidate-stdin --json
```

### Match one candidate against all keys

```bash
node -e "process.stdout.write('candidate-secret')" \
  | envsitter match --file .env --all-keys --candidate-stdin --json
```

### Match candidates-by-key (bulk assignment)

Provide a JSON object mapping key -> candidate value.

```bash
envsitter match-by-key --file .env \
  --candidates-json '{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-..."}'
```

For safer input, pass the JSON via stdin:

```bash
cat candidates.json | envsitter match-by-key --file .env --candidates-stdin
```

### Scan for value shapes (no values returned)

```bash
envsitter scan --file .env --detect jwt,url,base64
```

Optionally restrict which keys to scan:

```bash
envsitter scan --file .env --keys-regex "/(JWT|URL)/" --detect jwt,url
```

### Validate dotenv syntax

```bash
envsitter validate --file .env
envsitter validate --file .env --json
```

### Copy keys between env files (production → staging)

Dry-run (no file is modified):

```bash
envsitter copy --from .env.production --to .env.staging --keys API_URL,REDIS_URL --json
```

Apply changes:

```bash
envsitter copy --from .env.production --to .env.staging --keys API_URL,REDIS_URL --on-conflict overwrite --write --json
```

Rename while copying:

```bash
envsitter copy --from .env.production --to .env.staging --keys DATABASE_URL --rename DATABASE_URL=STAGING_DATABASE_URL --write
```

### Annotate keys with comments

```bash
envsitter annotate --file .env --key DATABASE_URL --comment "prod only" --write
```

### Reorder/format env files

```bash
envsitter format --file .env --mode sections --sort alpha --write
# alias:
envsitter reorder --file .env --mode sections --sort alpha --write
```

### Add a new key (fails if key exists)

```bash
envsitter add --file .env --key NEW_API_KEY --value "sk-xxx" --write
# or via stdin (recommended to avoid shell history):
node -e "process.stdout.write('sk-xxx')" | envsitter add --file .env --key NEW_API_KEY --value-stdin --write
```

### Set a key (creates or updates)

```bash
envsitter set --file .env --key API_KEY --value "new-value" --write
# or via stdin:
node -e "process.stdout.write('new-value')" | envsitter set --file .env --key API_KEY --value-stdin --write
```

### Unset a key (set to empty value)

```bash
envsitter unset --file .env --key OLD_KEY --write
```

### Delete keys

```bash
# Single key:
envsitter delete --file .env --key DEPRECATED_KEY --write

# Multiple keys:
envsitter delete --file .env --keys OLD_KEY,UNUSED_KEY,LEGACY_KEY --write
```

## Output contract (for LLMs)

General rules:

- Never output secret values; treat all values as sensitive.
- Prefer `--candidate-stdin` over `--candidate` to avoid shell history.
- Exit codes: `0` match found, `1` no match, `2` error/usage.

JSON outputs:

- `keys --json` -> `{ "keys": string[] }`
- `fingerprint` -> `{ "key": string, "algorithm": "hmac-sha256", "fingerprint": string, "length": number, "pepperSource": "env"|"file", "pepperFilePath"?: string }`
- `match --json` (single key) ->
  - default op (not provided): `{ "key": string, "match": boolean }`
  - with `--op`: `{ "key": string, "op": string, "match": boolean }`
- `match --json` (bulk keys / all keys) ->
  - default op (not provided): `{ "matches": Array<{ "key": string, "match": boolean }> }`
  - with `--op`: `{ "op": string, "matches": Array<{ "key": string, "match": boolean }> }`
- `match-by-key --json` -> `{ "matches": Array<{ "key": string, "match": boolean }> }`
- `scan --json` -> `{ "findings": Array<{ "key": string, "detections": Array<"jwt"|"url"|"base64"> }> }`
- `validate --json` -> `{ "ok": boolean, "issues": Array<{ "line": number, "column": number, "message": string }> }`
- `copy --json` -> `{ "from": string, "to": string, "onConflict": string, "willWrite": boolean, "wrote": boolean, "hasChanges": boolean, "issues": Array<...>, "plan": Array<...> }`
- `format --json` / `reorder --json` -> `{ "file": string, "mode": string, "sort": string, "willWrite": boolean, "wrote": boolean, "hasChanges": boolean, "issues": Array<...> }`
- `annotate --json` -> `{ "file": string, "willWrite": boolean, "wrote": boolean, "hasChanges": boolean, "issues": Array<...>, "plan": { ... } }`
- `add --json` / `set --json` / `unset --json` -> `{ "file": string, "key": string, "willWrite": boolean, "wrote": boolean, "hasChanges": boolean, "issues": Array<...>, "plan": { "key": string, "action": "added"|"updated"|"unset"|"key_exists"|"not_found"|"no_change", "line"?: number } }`
- `delete --json` -> `{ "file": string, "keys": string[], "willWrite": boolean, "wrote": boolean, "hasChanges": boolean, "issues": Array<...>, "plan": Array<{ "key": string, "action": "deleted"|"not_found", "line"?: number }> }`

## Library API

### Basic usage

```ts
import { EnvSitter } from 'envsitter';

const es = EnvSitter.fromDotenvFile('.env');

const keys = await es.listKeys();
const fp = await es.fingerprintKey('OPENAI_API_KEY');
const match = await es.matchCandidate('OPENAI_API_KEY', 'candidate-secret');
```

### File operations via the library

```ts
import {
  addEnvFileKey,
  annotateEnvFile,
  copyEnvFileKeys,
  deleteEnvFileKeys,
  formatEnvFile,
  setEnvFileKey,
  unsetEnvFileKey,
  validateEnvFile
} from 'envsitter';

await validateEnvFile('.env');

await copyEnvFileKeys({
  from: '.env.production',
  to: '.env.staging',
  keys: ['API_URL', 'REDIS_URL'],
  onConflict: 'overwrite',
  write: true
});

await annotateEnvFile({ file: '.env', key: 'DATABASE_URL', comment: 'prod only', write: true });
await formatEnvFile({ file: '.env', mode: 'sections', sort: 'alpha', write: true });

// Add a new key (fails if exists)
await addEnvFileKey({ file: '.env', key: 'NEW_KEY', value: 'new_value', write: true });

// Set a key (creates or updates)
await setEnvFileKey({ file: '.env', key: 'API_KEY', value: 'updated_value', write: true });

// Unset a key (set to empty)
await unsetEnvFileKey({ file: '.env', key: 'OLD_KEY', write: true });

// Delete keys
await deleteEnvFileKeys({ file: '.env', keys: ['DEPRECATED', 'UNUSED'], write: true });
```

### Match operators via the library

```ts
import { EnvSitter } from 'envsitter';
import type { EnvSitterMatcher } from 'envsitter';

const es = EnvSitter.fromDotenvFile('.env');

const matcher: EnvSitterMatcher = { op: 'partial_match_prefix', prefix: 'sk-' };
const ok = await es.matchKey('OPENAI_API_KEY', matcher);
```

### Bulk matching

```ts
import { EnvSitter } from 'envsitter';

const es = EnvSitter.fromDotenvFile('.env');

// One candidate tested against a set of keys
const matches = await es.matchCandidateBulk(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], 'candidate-secret');

// One matcher tested against a set of keys
const prefixMatches = await es.matchKeyBulk(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], { op: 'partial_match_prefix', prefix: 'sk-' });

// Candidates-by-key
const byKey = await es.matchCandidatesByKey({
  OPENAI_API_KEY: 'sk-...',
  ANTHROPIC_API_KEY: 'sk-...'
});
```

### External sources (hooks)

You can load dotenv-formatted output from another tool/secret provider:

```ts
import { EnvSitter } from 'envsitter';

const es = EnvSitter.fromExternalCommand('my-secret-provider', ['export', '--format=dotenv']);
const keys = await es.listKeys();
```

## Development

```bash
npm install
npm run typecheck
npm test
```

Run a single test file:

```bash
npm run build
node --test dist/test/envsitter.test.js
```

Run a single test by name:

```bash
npm run build
node --test --test-name-pattern "outside-in" dist/test/envsitter.test.js
```

## License

MIT. See `LICENSE`.
