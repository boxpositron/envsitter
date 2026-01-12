export type DotenvParseError = {
  line: number;
  message: string;
};

export type DotenvParseResult = {
  values: Map<string, string>;
  errors: DotenvParseError[];
};

function isValidKeyChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function parseKey(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  for (let i = 0; i < trimmed.length; i++) {
    if (!isValidKeyChar(trimmed[i] ?? '')) return undefined;
  }
  return trimmed;
}

function stripInlineComment(unquotedValue: string): string {
  for (let i = 0; i < unquotedValue.length; i++) {
    const c = unquotedValue[i];
    if (c === '#') {
      const prev = i > 0 ? (unquotedValue[i - 1] ?? '') : '';
      if (prev === '' || /\s/.test(prev)) {
        return unquotedValue.slice(0, i);
      }
    }
  }
  return unquotedValue;
}

function unescapeDoubleQuoted(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) {
      out += '\\';
      continue;
    }
    i++;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else out += next;
  }
  return out;
}

function parseValue(raw: string, line: number, errors: DotenvParseError[]): string {
  const trimmed = raw.trimStart();
  if (!trimmed) return '';

  const first = trimmed[0];
  if (first === "'") {
    const end = trimmed.indexOf("'", 1);
    if (end === -1) {
      errors.push({ line, message: 'Unterminated single-quoted value' });
      return trimmed.slice(1);
    }
    return trimmed.slice(1, end);
  }

  if (first === '"') {
    let end = 1;
    for (; end < trimmed.length; end++) {
      const c = trimmed[end];
      if (c === '"' && trimmed[end - 1] !== '\\') break;
    }
    if (end >= trimmed.length || trimmed[end] !== '"') {
      errors.push({ line, message: 'Unterminated double-quoted value' });
      return unescapeDoubleQuoted(trimmed.slice(1));
    }

    return unescapeDoubleQuoted(trimmed.slice(1, end));
  }

  return stripInlineComment(trimmed).trimEnd();
}

export function parseDotenv(contents: string): DotenvParseResult {
  const values = new Map<string, string>();
  const errors: DotenvParseError[] = [];

  const lines = contents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) {
      errors.push({ line: lineNumber, message: 'Missing = in assignment' });
      continue;
    }

    const key = parseKey(withoutExport.slice(0, eq));
    if (!key) {
      errors.push({ line: lineNumber, message: 'Invalid key name' });
      continue;
    }

    const rawValue = withoutExport.slice(eq + 1);
    const value = parseValue(rawValue, lineNumber, errors);
    values.set(key, value);
  }

  return { values, errors };
}
