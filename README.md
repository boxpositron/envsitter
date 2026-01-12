# envsitter

Safely inspect and match `.env` secrets **without ever printing values**.

`envsitter` is designed for LLM/agent workflows where you want to:

- List keys present in an env source (`.env` file or external provider)
- Check whether a key’s value matches a candidate value you provide at runtime ("outside-in")
- Do bulk matching (one candidate against many keys, or candidates-by-key)
- Produce deterministic fingerprints for comparisons/auditing

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

## Library API

### Basic usage

```ts
import { EnvSitter } from 'envsitter';

const es = EnvSitter.fromDotenvFile('.env');

const keys = await es.listKeys();
const fp = await es.fingerprintKey('OPENAI_API_KEY');
const match = await es.matchCandidate('OPENAI_API_KEY', 'candidate-secret');
```

### Bulk matching

```ts
import { EnvSitter } from 'envsitter';

const es = EnvSitter.fromDotenvFile('.env');

// One candidate tested against a set of keys
const matches = await es.matchCandidateBulk(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'], 'candidate-secret');

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
