#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { EnvSitter, type EnvSitterMatcher } from './envsitter.js';
import { annotateDotenvKey, copyDotenvKeys, formatDotenv, validateDotenv } from './dotenv/edit.js';
import { readTextFileOrEmpty, writeTextFileAtomic } from './dotenv/io.js';


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

function parseMatcher(op: string, candidate: string | undefined): EnvSitterMatcher {
  if (op === 'exists') return { op: 'exists' };
  if (op === 'is_empty') return { op: 'is_empty' };
  if (op === 'is_number') return { op: 'is_number' };
  if (op === 'is_string') return { op: 'is_string' };
  if (op === 'is_boolean') return { op: 'is_boolean' };

  if (op === 'is_equal') {
    return { op: 'is_equal', candidate: requireValue(candidate, 'Provide --candidate or --candidate-stdin') };
  }

  if (op === 'partial_match_prefix') {
    return { op: 'partial_match_prefix', prefix: requireValue(candidate, 'Provide --candidate or --candidate-stdin') };
  }

  if (op === 'partial_match_suffix') {
    return { op: 'partial_match_suffix', suffix: requireValue(candidate, 'Provide --candidate or --candidate-stdin') };
  }

  if (op === 'partial_match_regex') {
    const raw = requireValue(candidate, 'Provide --candidate or --candidate-stdin');
    return { op: 'partial_match_regex', regex: parseRegex(raw) };
  }

  throw new Error(
    `Unknown --op: ${op}. Expected one of: exists,is_empty,is_equal,partial_match_regex,partial_match_prefix,partial_match_suffix,is_number,is_string,is_boolean`
  );
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
      '  match --file <path> (--key <KEY> | --keys <K1,K2> | --all-keys) [--op <op>] [--candidate <value> | --candidate-stdin]',
      '  match-by-key --file <path> (--candidates-json <json> | --candidates-stdin)',
      '  scan --file <path> [--keys-regex <re>] [--detect jwt,url,base64]',
      '  validate --file <path>',
      '  copy --from <path> --to <path> [--keys <K1,K2>] [--include-regex <re>] [--exclude-regex <re>] [--rename <A=B,C=D>] [--on-conflict error|skip|overwrite] [--write]',
      '  format --file <path> [--mode sections|global] [--sort alpha|none] [--write]',
      '  reorder --file <path> [--mode sections|global] [--sort alpha|none] [--write]',
      '  annotate --file <path> --key <KEY> --comment <text> [--line <n>] [--write]',
      '',
      'Pepper options:',
      '  --pepper-file <path>   Defaults to .envsitter/pepper (auto-created)',
      '',
      'Notes:',
      '  match --op defaults to is_equal. Ops: exists,is_empty,is_equal,partial_match_regex,partial_match_prefix,partial_match_suffix,is_number,is_string,is_boolean',
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

  const json = flags['json'] === true;

  if (cmd === 'validate') {
    const file = requireValue(typeof flags['file'] === 'string' ? flags['file'] : undefined, '--file is required');
    const contents = await readFile(file, 'utf8');
    const result = validateDotenv(contents);

    if (json) jsonOut(result);
    else {
      if (result.ok) process.stdout.write('OK\n');
      else {
        for (const issue of result.issues) {
          process.stdout.write(`L${issue.line}:C${issue.column}: ${issue.message}\n`);
        }
      }
    }

    return result.ok ? 0 : 2;
  }

  if (cmd === 'copy') {
    const from = requireValue(typeof flags['from'] === 'string' ? flags['from'] : undefined, '--from is required');
    const to = requireValue(typeof flags['to'] === 'string' ? flags['to'] : undefined, '--to is required');

    const onConflictRaw = typeof flags['on-conflict'] === 'string' ? flags['on-conflict'] : 'error';
    const onConflict = onConflictRaw === 'skip' || onConflictRaw === 'overwrite' ? onConflictRaw : 'error';

    const keysRaw = typeof flags['keys'] === 'string' ? flags['keys'] : undefined;
    const includeRaw = typeof flags['include-regex'] === 'string' ? flags['include-regex'] : undefined;
    const excludeRaw = typeof flags['exclude-regex'] === 'string' ? flags['exclude-regex'] : undefined;
    const renameRaw = typeof flags['rename'] === 'string' ? flags['rename'] : undefined;

    const sourceContents = await readFile(from, 'utf8');
    const targetContents = await readTextFileOrEmpty(to);

    const result = copyDotenvKeys({
      sourceContents,
      targetContents,
      ...(keysRaw ? { keys: parseList(keysRaw) } : {}),
      ...(includeRaw ? { include: parseRegex(includeRaw) } : {}),
      ...(excludeRaw ? { exclude: parseRegex(excludeRaw) } : {}),
      ...(renameRaw ? { rename: renameRaw } : {}),
      onConflict
    });

    const conflicts = result.plan.filter((p) => p.action === 'conflict');
    const willWrite = flags['write'] === true;

    if (willWrite && conflicts.length === 0 && result.hasChanges) {
      await writeTextFileAtomic(to, result.output);
    }

    if (json) {
      jsonOut({
        from,
        to,
        onConflict,
        willWrite,
        wrote: willWrite && conflicts.length === 0 && result.hasChanges,
        hasChanges: result.hasChanges,
        issues: result.issues,
        plan: result.plan
      });
    } else {
      for (const p of result.plan) {
        const fromAt = p.fromLine ? ` L${p.fromLine}` : '';
        const toAt = p.toLine ? ` -> L${p.toLine}` : '';
        process.stdout.write(`${p.action}: ${p.fromKey} -> ${p.toKey}${fromAt}${toAt}\n`);
      }
      if (conflicts.length > 0) process.stdout.write('Conflicts found. Use --on-conflict overwrite|skip or resolve manually.\n');
    }

    return conflicts.length > 0 ? 2 : 0;
  }

  if (cmd === 'format' || cmd === 'reorder') {
    const file = requireValue(typeof flags['file'] === 'string' ? flags['file'] : undefined, '--file is required');
    const modeRaw = typeof flags['mode'] === 'string' ? flags['mode'] : 'sections';
    const sortRaw = typeof flags['sort'] === 'string' ? flags['sort'] : 'alpha';

    const mode = modeRaw === 'global' ? 'global' : 'sections';
    const sort = sortRaw === 'none' ? 'none' : 'alpha';

    const contents = await readFile(file, 'utf8');
    const result = formatDotenv({ contents, mode, sort });

    const willWrite = flags['write'] === true;
    if (willWrite && result.hasChanges) await writeTextFileAtomic(file, result.output);

    if (json) {
      jsonOut({ file, mode, sort, willWrite, wrote: willWrite && result.hasChanges, hasChanges: result.hasChanges, issues: result.issues });
    } else {
      process.stdout.write(result.hasChanges ? 'CHANGED\n' : 'NO_CHANGES\n');
    }

    return result.issues.length > 0 ? 2 : 0;
  }

  if (cmd === 'annotate') {
    const file = requireValue(typeof flags['file'] === 'string' ? flags['file'] : undefined, '--file is required');
    const key = requireValue(typeof flags['key'] === 'string' ? flags['key'] : undefined, '--key is required');
    const comment = requireValue(typeof flags['comment'] === 'string' ? flags['comment'] : undefined, '--comment is required');
    const lineRaw = typeof flags['line'] === 'string' ? flags['line'] : undefined;
    const line = lineRaw ? Number(lineRaw) : undefined;

    const contents = await readFile(file, 'utf8');
    const result = annotateDotenvKey({ contents, key, comment, ...(line ? { line } : {}) });

    const willWrite = flags['write'] === true;
    if (willWrite && result.hasChanges) await writeTextFileAtomic(file, result.output);

    if (json) {
      jsonOut({ file, willWrite, wrote: willWrite && result.hasChanges, hasChanges: result.hasChanges, issues: result.issues, plan: result.plan });
    } else {
      process.stdout.write(`${result.plan.action}: ${result.plan.key}\n`);
    }

    return result.issues.length > 0 ? 2 : 0;
  }

  const file = requireValue(typeof flags['file'] === 'string' ? flags['file'] : undefined, '--file is required');
  const pepper = getPepperOptions(flags);
  const envsitter = EnvSitter.fromDotenvFile(file);

  if (cmd === 'keys') {
    const filterRegexRaw = typeof flags['filter-regex'] === 'string' ? flags['filter-regex'] : undefined;
    const filter = filterRegexRaw ? parseRegex(filterRegexRaw) : undefined;

    const keys = await envsitter.listKeys(filter ? { filter } : {});
    if (json) jsonOut({ keys });
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
    const op = typeof flags['op'] === 'string' ? flags['op'] : 'is_equal';

    const candidateArg = typeof flags['candidate'] === 'string' ? flags['candidate'] : undefined;
    const candidateStdin = flags['candidate-stdin'] === true ? (await readStdinText()).trimEnd() : undefined;
    const candidate = candidateStdin ?? candidateArg;

    const matcher = parseMatcher(op, candidate);
    const pepperOptions = pepperMatchOptions(pepper?.pepperFilePath);

    const key = typeof flags['key'] === 'string' ? flags['key'] : undefined;
    const keysCsv = typeof flags['keys'] === 'string' ? flags['keys'] : undefined;
    const allKeys = flags['all-keys'] === true;

    const includeOp = typeof flags['op'] === 'string';

    if (key) {
      const match = await envsitter.matchKey(key, matcher, pepperOptions);
      if (json) jsonOut(includeOp ? { key, op: matcher.op, match } : { key, match });
      return match ? 0 : 1;
    }

    if (keysCsv) {
      const keys = parseList(keysCsv);
      const results = await envsitter.matchKeyBulk(keys, matcher, pepperOptions);
      if (json) jsonOut(includeOp ? { op: matcher.op, matches: results } : { matches: results });
      return results.some((r) => r.match) ? 0 : 1;
    }

    if (allKeys) {
      const results = await envsitter.matchKeyAll(matcher, pepperOptions);
      if (json) jsonOut(includeOp ? { op: matcher.op, matches: results } : { matches: results });
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
