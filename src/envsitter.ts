import { timingSafeEqual } from 'node:crypto';
import { base64UrlEncode } from './encoding.js';
import { fingerprintValueHmacSha256 } from './fingerprint.js';
import { resolvePepper, type PepperOptions } from './pepper.js';
import { DotenvFileSource } from './sources/dotenvFile.js';
import { ExternalCommandSource } from './sources/externalCommand.js';

type Snapshot = {
  values: ReadonlyMap<string, string>;
};

type Source = {
  load(): Promise<Snapshot>;
};

export type EnvSitterFingerprint = {
  key: string;
  algorithm: 'hmac-sha256';
  fingerprint: string;
  length: number;
  pepperSource: 'env' | 'file';
  pepperFilePath?: string;
};

export type EnvSitterKeyMatch = {
  key: string;
  match: boolean;
};

export type EnvSitterMatcher =
  | { op: 'exists' }
  | { op: 'is_empty' }
  | { op: 'is_equal'; candidate: string }
  | { op: 'partial_match_regex'; regex: RegExp }
  | { op: 'partial_match_prefix'; prefix: string }
  | { op: 'partial_match_suffix'; suffix: string }
  | { op: 'is_number' }
  | { op: 'is_string' }
  | { op: 'is_boolean' };

export type Detection = 'jwt' | 'url' | 'base64';

export type ScanFinding = {
  key: string;
  detections: Detection[];
};

export type ScanOptions = {
  keysFilter?: RegExp;
  detect?: readonly Detection[];
};

export type ListKeysOptions = {
  filter?: RegExp;
};

export type MatchOptions = {
  pepper?: PepperOptions;
};

export class EnvSitter {
  private readonly source: Source;

  private constructor(source: Source) {
    this.source = source;
  }

  static fromDotenvFile(filePath: string): EnvSitter {
    return new EnvSitter(new DotenvFileSource(filePath));
  }

  static fromExternalCommand(command: string, args: readonly string[] = []): EnvSitter {
    return new EnvSitter(new ExternalCommandSource(command, args));
  }

  async listKeys(options: ListKeysOptions = {}): Promise<string[]> {
    const snapshot = await this.source.load();
    const keys = [...snapshot.values.keys()].sort((a, b) => a.localeCompare(b));
    if (!options.filter) return keys;
    return keys.filter((k) => options.filter?.test(k));
  }

  async fingerprintKey(key: string, options: MatchOptions = {}): Promise<EnvSitterFingerprint> {
    const snapshot = await this.source.load();
    const value = snapshot.values.get(key);
    if (value === undefined) throw new Error(`Key not found: ${key}`);

    const pepper = await resolvePepper(options.pepper);
    const fp = fingerprintValueHmacSha256(value, pepper.pepperBytes);

    return {
      key,
      algorithm: fp.algorithm,
      fingerprint: base64UrlEncode(fp.digestBytes),
      length: value.length,
      pepperSource: pepper.source,
      ...(pepper.pepperFilePath ? { pepperFilePath: pepper.pepperFilePath } : {})
    };
  }

  async matchKey(key: string, matcher: EnvSitterMatcher, options: MatchOptions = {}): Promise<boolean> {
    const snapshot = await this.source.load();

    if (matcher.op === 'exists') return snapshot.values.has(key);

    const value = snapshot.values.get(key);
    if (value === undefined) return false;

    if (matcher.op === 'is_equal') {
      const pepper = await resolvePepper(options.pepper);
      const candidateFp = fingerprintValueHmacSha256(matcher.candidate, pepper.pepperBytes);
      const valueFp = fingerprintValueHmacSha256(value, pepper.pepperBytes);

      const a = Buffer.from(candidateFp.digestBytes);
      const b = Buffer.from(valueFp.digestBytes);

      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    }

    return matchValue(value, matcher);
  }

  async matchKeyBulk(
    keys: readonly string[],
    matcher: EnvSitterMatcher,
    options: MatchOptions = {}
  ): Promise<EnvSitterKeyMatch[]> {
    const snapshot = await this.source.load();

    if (matcher.op === 'is_equal') {
      const pepper = await resolvePepper(options.pepper);
      const candidateFp = fingerprintValueHmacSha256(matcher.candidate, pepper.pepperBytes);
      const candidateBuf = Buffer.from(candidateFp.digestBytes);

      const results: EnvSitterKeyMatch[] = [];
      for (const key of keys) {
        const value = snapshot.values.get(key);
        if (value === undefined) {
          results.push({ key, match: false });
          continue;
        }

        const valueFp = fingerprintValueHmacSha256(value, pepper.pepperBytes);
        const valueBuf = Buffer.from(valueFp.digestBytes);
        const match = valueBuf.length === candidateBuf.length && timingSafeEqual(valueBuf, candidateBuf);
        results.push({ key, match });
      }

      return results;
    }

    const results: EnvSitterKeyMatch[] = [];
    for (const key of keys) {
      if (matcher.op === 'exists') {
        results.push({ key, match: snapshot.values.has(key) });
        continue;
      }

      const value = snapshot.values.get(key);
      if (value === undefined) {
        results.push({ key, match: false });
        continue;
      }

      results.push({ key, match: matchValue(value, matcher) });
    }

    return results;
  }

  async matchKeyAll(matcher: EnvSitterMatcher, options: MatchOptions = {}): Promise<EnvSitterKeyMatch[]> {
    const keys = await this.listKeys();
    return this.matchKeyBulk(keys, matcher, options);
  }

  async matchCandidate(key: string, candidate: string, options: MatchOptions = {}): Promise<boolean> {
    return this.matchKey(key, { op: 'is_equal', candidate }, options);
  }

  async matchCandidateBulk(keys: readonly string[], candidate: string, options: MatchOptions = {}): Promise<EnvSitterKeyMatch[]> {
    return this.matchKeyBulk(keys, { op: 'is_equal', candidate }, options);
  }

  async matchCandidateAll(candidate: string, options: MatchOptions = {}): Promise<EnvSitterKeyMatch[]> {
    return this.matchKeyAll({ op: 'is_equal', candidate }, options);
  }

  async matchCandidatesByKey(candidatesByKey: Record<string, string>, options: MatchOptions = {}): Promise<EnvSitterKeyMatch[]> {
    const snapshot = await this.source.load();
    const pepper = await resolvePepper(options.pepper);

    const results: EnvSitterKeyMatch[] = [];
    for (const [key, candidate] of Object.entries(candidatesByKey)) {
      const value = snapshot.values.get(key);
      if (value === undefined) {
        results.push({ key, match: false });
        continue;
      }

      const candidateFp = fingerprintValueHmacSha256(candidate, pepper.pepperBytes);
      const valueFp = fingerprintValueHmacSha256(value, pepper.pepperBytes);
      const a = Buffer.from(candidateFp.digestBytes);
      const b = Buffer.from(valueFp.digestBytes);
      const match = a.length === b.length && timingSafeEqual(a, b);
      results.push({ key, match });
    }

    return results;
  }

  async scan(options: ScanOptions = {}): Promise<ScanFinding[]> {
    const snapshot = await this.source.load();
    const detectionsToRun = options.detect ?? ['jwt', 'url', 'base64'];

    const findings: ScanFinding[] = [];
    for (const [key, value] of snapshot.values.entries()) {
      if (options.keysFilter && !options.keysFilter.test(key)) continue;

      const detections: Detection[] = [];
      for (const kind of detectionsToRun) {
        if (kind === 'jwt' && looksLikeJwt(value)) detections.push('jwt');
        else if (kind === 'url' && looksLikeUrl(value)) detections.push('url');
        else if (kind === 'base64' && looksLikeBase64(value)) detections.push('base64');
      }

      if (detections.length > 0) findings.push({ key, detections });
    }

    return findings;
  }
}

function matchValue(value: string, matcher: Exclude<EnvSitterMatcher, { op: 'exists' } | { op: 'is_equal'; candidate: string }>): boolean {
  if (matcher.op === 'is_empty') return value.length === 0;

  if (matcher.op === 'partial_match_prefix') return value.startsWith(matcher.prefix);
  if (matcher.op === 'partial_match_suffix') return value.endsWith(matcher.suffix);
  if (matcher.op === 'partial_match_regex') return matcher.regex.test(value);

  if (matcher.op === 'is_number') return isNumberLike(value);
  if (matcher.op === 'is_boolean') return isBooleanLike(value);
  if (matcher.op === 'is_string') return !isNumberLike(value) && !isBooleanLike(value);

  const neverMatcher: never = matcher;
  throw new Error(`Unhandled matcher: ${JSON.stringify(neverMatcher)}`);
}

function isNumberLike(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
}

function isBooleanLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed === 'true' || trimmed === 'false';
}

function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 0);
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return false;
  if (trimmed.length % 4 !== 0) return false;
  try {
    const decoded = Buffer.from(trimmed, 'base64');
    return decoded.length > 0;
  } catch {
    return false;
  }
}
