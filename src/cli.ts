#!/usr/bin/env node
import { EnvSitter } from './envsitter.js';

type PepperCliOptions = {
  pepperFile?: string;
};

type CommonCliOptions = {
  file?: string;
  pepper?: PepperCliOptions;
  json?: boolean;
};

function parseRegex(input: string): RegExp {
  const trimmed = input.trim();
  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    const lastSlash = trimmed.lastIndexOf('/');
    const body = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    return new RegExp(body, flags);
  }
  return new RegExp(trimmed);
}

function parseList(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function parseArgs(argv: string[]): { cmd: string; args: string[]; flags: Record<string, string | boolean> } {
  const [cmd = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token) continue;

    if (token.startsWith('--')) {
      const [name, inlineValue] = token.slice(2).split('=', 2);
      if (!name) continue;

      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
        continue;
      }

      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i++;
        continue;
      }

      flags[name] = true;
      continue;
    }

    args.push(token);
  }

  return { cmd, args, flags };
}

function jsonOut(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(
    [
      'envsitter: safely inspect and match .env secrets without exposing values',
      '',
      'Commands:',
      '  keys --file <path> [--filter-regex <re>]',
      '  fingerprint --file <path> --key <KEY>',
      '  match --file <path> (--key <KEY> | --keys <K1,K2> | --all-keys) (--candidate <value> | --candidate-stdin)',
      '  match-by-key --file <path> (--candidates-json <json> | --candidates-stdin)',
      '  scan --file <path> [--keys-regex <re>] [--detect jwt,url,base64]',
      '',
      'Pepper options:',
      '  --pepper-file <path>   Defaults to .envsitter/pepper (auto-created)',
      '',
      'Notes:',
      '  Candidate values passed via argv may end up in shell history. Prefer --candidate-stdin.',
      ''
    ].join('\n')
  );
}

function getPepperOptions(flags: Record<string, string | boolean>): { pepperFilePath?: string } | undefined {
  const pepperFile = flags['pepper-file'];
  if (typeof pepperFile === 'string' && pepperFile.length > 0) {
    return { pepperFilePath: pepperFile };
  }
  return undefined;
}

function pepperMatchOptions(pepperFilePath: string | undefined): { pepper?: { pepperFilePath: string } } {
  if (pepperFilePath) return { pepper: { pepperFilePath } };
  return {};
}

async function run(): Promise<number> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return 0;
  }

  const file = requireValue(typeof flags['file'] === 'string' ? flags['file'] : undefined, '--file is required');
  const pepper = getPepperOptions(flags);
  const envsitter = EnvSitter.fromDotenvFile(file);

  if (cmd === 'keys') {
    const filterRegexRaw = typeof flags['filter-regex'] === 'string' ? flags['filter-regex'] : undefined;
    const filter = filterRegexRaw ? parseRegex(filterRegexRaw) : undefined;

    const keys = await envsitter.listKeys(filter ? { filter } : {});
    if (flags['json'] === true) jsonOut({ keys });
    else process.stdout.write(`${keys.join('\n')}\n`);
    return 0;
  }

  if (cmd === 'fingerprint') {
    const key = requireValue(typeof flags['key'] === 'string' ? flags['key'] : undefined, '--key is required');
    const fp = await envsitter.fingerprintKey(key, pepperMatchOptions(pepper?.pepperFilePath));
    jsonOut(fp);
    return 0;
  }

  if (cmd === 'match') {
    const candidateArg = typeof flags['candidate'] === 'string' ? flags['candidate'] : undefined;
    const candidate = flags['candidate-stdin'] === true ? (await readStdinText()).trimEnd() : candidateArg;
    const candidateValue = requireValue(candidate, 'Provide --candidate or --candidate-stdin');

    const pepperOptions = pepperMatchOptions(pepper?.pepperFilePath);

    const key = typeof flags['key'] === 'string' ? flags['key'] : undefined;
    const keysCsv = typeof flags['keys'] === 'string' ? flags['keys'] : undefined;
    const allKeys = flags['all-keys'] === true;

    if (key) {
      const match = await envsitter.matchCandidate(key, candidateValue, pepperOptions);
      if (flags['json'] === true) jsonOut({ key, match });
      return match ? 0 : 1;
    }

    if (keysCsv) {
      const keys = parseList(keysCsv);
      const results = await envsitter.matchCandidateBulk(keys, candidateValue, pepperOptions);
      if (flags['json'] === true) jsonOut({ matches: results });
      return results.some((r) => r.match) ? 0 : 1;
    }

    if (allKeys) {
      const results = await envsitter.matchCandidateAll(candidateValue, pepperOptions);
      if (flags['json'] === true) jsonOut({ matches: results });
      return results.some((r) => r.match) ? 0 : 1;
    }

    throw new Error('Provide --key, --keys, or --all-keys');
  }

  if (cmd === 'match-by-key') {
    const candidatesJson = typeof flags['candidates-json'] === 'string' ? flags['candidates-json'] : undefined;
    const candidatesStdin = flags['candidates-stdin'] === true ? (await readStdinText()).trim() : undefined;

    const raw = candidatesJson ?? candidatesStdin;
    const parsed = requireValue(raw, 'Provide --candidates-json or --candidates-stdin');

    let candidates: Record<string, string>;
    try {
      candidates = JSON.parse(parsed) as Record<string, string>;
    } catch {
      throw new Error('Candidates JSON must be an object: {"KEY":"candidate"}');
    }

    const matches = await envsitter.matchCandidatesByKey(candidates, pepperMatchOptions(pepper?.pepperFilePath));
    jsonOut({ matches });
    return matches.some((m) => m.match) ? 0 : 1;
  }

  if (cmd === 'scan') {
    const keysRegexRaw = typeof flags['keys-regex'] === 'string' ? flags['keys-regex'] : undefined;
    const detectRaw = typeof flags['detect'] === 'string' ? flags['detect'] : undefined;

    const keysFilter = keysRegexRaw ? parseRegex(keysRegexRaw) : undefined;
    const detect = detectRaw ? (parseList(detectRaw) as Array<'jwt' | 'url' | 'base64'>) : undefined;

    const findings = await envsitter.scan({
      ...(keysFilter ? { keysFilter } : {}),
      ...(detect ? { detect } : {})
    });
    jsonOut({ findings });
    return 0;
  }

  printHelp();
  return 2;
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  });
