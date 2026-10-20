export type RedactOptions = {
  /** Shortest value that is redacted. Shorter values match ordinary text too often. Default 8. */
  minLength?: number;
  /** Redact every value at least `minLength` long, not only values that look secret. Default false. */
  all?: boolean;
};

export type RedactionCount = {
  key: string;
  count: number;
};

export type RedactResult = {
  text: string;
  redactions: RedactionCount[];
};

export type EnvSitterRedactor = {
  /** Keys whose values this redactor replaces (never the values themselves). */
  readonly keys: readonly string[];
  redact(text: string): RedactResult;
};

const defaultMinLength = 8;
const randomTokenMinLength = 16;
const secretKeyName =
  /SECRET|TOKEN|PASSW(?:OR)?D|PASSPHRASE|PRIVATE_?KEY|CREDENTIAL|API_?KEY|ACCESS_?KEY|SIGNING_?KEY|WEBHOOK|DSN|(?:^|_)(?:KEY|PASS|PWD|SALT|PEPPER)$/i;

export function redactionPlaceholder(key: string): string {
  return `[envsitter: ${key} redacted]`;
}

function isPlainScalar(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return true;
  return ['true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none'].includes(trimmed);
}

function bitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// Random-looking tokens: long, letters and digits, no whitespace, and no ':' (which rules out URLs, ARNs, host:port).
function looksLikeRandomToken(value: string): boolean {
  if (value.length < randomTokenMinLength || /[\s:]/.test(value)) return false;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return false;
  return bitsPerChar(value) >= 3;
}

function urlPasswords(value: string): string[] {
  if (!value.includes('://')) return [];

  let password: string;
  try {
    password = new URL(value).password;
  } catch {
    return [];
  }

  if (!password) return [];
  const decoded = decodeURIComponent(password);
  return decoded === password ? [password] : [password, decoded];
}

function redactionTerms(key: string, value: string, options: RedactOptions): string[] {
  const minLength = options.minLength ?? defaultMinLength;
  if (value.length < minLength || isPlainScalar(value)) return [];

  const passwords = urlPasswords(value);
  const isPem = value.includes('-----BEGIN');
  const isSecret = options.all === true || secretKeyName.test(key) || looksLikeRandomToken(value) || passwords.length > 0 || isPem;
  if (!isSecret) return [];

  const terms = [value, ...passwords.filter((password) => password.length >= minLength)];
  if (value.includes('\n')) {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (looksLikeRandomToken(trimmed)) terms.push(trimmed);
    }
  }
  return terms;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createRedactor(values: ReadonlyMap<string, string>, options: RedactOptions = {}): EnvSitterRedactor {
  const keyByTerm = new Map<string, string>();
  for (const [key, value] of values) {
    for (const term of redactionTerms(key, value, options)) {
      if (!keyByTerm.has(term)) keyByTerm.set(term, key);
    }
  }

  const terms = [...keyByTerm.keys()].sort((a, b) => b.length - a.length);
  const pattern = terms.length > 0 ? new RegExp(terms.map(escapeRegExp).join('|'), 'g') : undefined;
  const keys = [...new Set(keyByTerm.values())].sort((a, b) => a.localeCompare(b));

  return {
    keys,
    redact(text: string): RedactResult {
      if (!pattern || text.length === 0) return { text, redactions: [] };

      const counts = new Map<string, number>();
      const redacted = text.replace(pattern, (match) => {
        const key = keyByTerm.get(match);
        if (key === undefined) return match;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return redactionPlaceholder(key);
      });

      const redactions = [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => a.key.localeCompare(b.key));
      return { text: redacted, redactions };
    }
  };
}
