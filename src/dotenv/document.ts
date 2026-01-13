export type DotenvIssue = {
  line: number;
  column: number;
  message: string;
};

export type DotenvParsedAssignment = {
  line: number;
  raw: string;
  leadingWhitespace: string;
  exported: boolean;
  key: string;
  keyColumn: number;
  beforeEqWhitespace: string;
  afterEqRaw: string;
  quote: 'none' | 'single' | 'double';
  value: string;
};

export type DotenvLine =
  | { kind: 'blank'; line: number; raw: string }
  | { kind: 'comment'; line: number; raw: string }
  | ({ kind: 'assignment' } & DotenvParsedAssignment)
  | { kind: 'unknown'; line: number; raw: string };

export type DotenvDocument = {
  lines: DotenvLine[];
  issues: DotenvIssue[];
  endsWithNewline: boolean;
};

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function isValidKeyChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function stripInlineComment(unquotedValue: string): string {
  for (let i = 0; i < unquotedValue.length; i++) {
    const c = unquotedValue[i];
    if (c === '#') {
      const prev = i > 0 ? (unquotedValue[i - 1] ?? '') : '';
      if (prev === '' || /\s/.test(prev)) return unquotedValue.slice(0, i);
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

function parseValueDetailed(afterEqRaw: string, line: number, issues: DotenvIssue[]): { value: string; quote: 'none' | 'single' | 'double' } {
  const trimmed = afterEqRaw.trimStart();
  if (!trimmed) return { value: '', quote: 'none' };

  const first = trimmed[0];
  if (first === "'") {
    const end = trimmed.indexOf("'", 1);
    if (end === -1) {
      issues.push({ line, column: 1, message: 'Unterminated single-quoted value' });
      return { value: trimmed.slice(1), quote: 'single' };
    }
    return { value: trimmed.slice(1, end), quote: 'single' };
  }

  if (first === '"') {
    let end = 1;
    for (; end < trimmed.length; end++) {
      const c = trimmed[end];
      if (c === '"' && trimmed[end - 1] !== '\\') break;
    }
    if (end >= trimmed.length || trimmed[end] !== '"') {
      issues.push({ line, column: 1, message: 'Unterminated double-quoted value' });
      return { value: unescapeDoubleQuoted(trimmed.slice(1)), quote: 'double' };
    }
    return { value: unescapeDoubleQuoted(trimmed.slice(1, end)), quote: 'double' };
  }

  return { value: stripInlineComment(trimmed).trimEnd(), quote: 'none' };
}

function parseAssignmentLine(raw: string, line: number, issues: DotenvIssue[]): DotenvParsedAssignment | undefined {
  let cursor = 0;
  while (cursor < raw.length && isWhitespace(raw[cursor] ?? '')) cursor++;
  const leadingWhitespace = raw.slice(0, cursor);

  let exported = false;
  const exportStart = cursor;
  if (raw.slice(cursor).startsWith('export')) {
    const afterExport = raw[cursor + 'export'.length] ?? '';
    if (isWhitespace(afterExport)) {
      exported = true;
      cursor += 'export'.length;
      while (cursor < raw.length && isWhitespace(raw[cursor] ?? '')) cursor++;
    } else {
      cursor = exportStart;
    }
  }

  const keyStart = cursor;
  while (cursor < raw.length && isValidKeyChar(raw[cursor] ?? '')) cursor++;
  const key = raw.slice(keyStart, cursor);
  if (!key) {
    issues.push({ line, column: keyStart + 1, message: 'Invalid key name' });
    return undefined;
  }

  const next = raw[cursor] ?? '';
  if (next && !isWhitespace(next) && next !== '=') {
    issues.push({ line, column: cursor + 1, message: 'Invalid key name' });
    return undefined;
  }

  const wsStart = cursor;
  while (cursor < raw.length && isWhitespace(raw[cursor] ?? '')) cursor++;
  const beforeEqWhitespace = raw.slice(wsStart, cursor);

  if ((raw[cursor] ?? '') !== '=') {
    issues.push({ line, column: cursor + 1, message: 'Missing = in assignment' });
    return undefined;
  }

  const afterEqRaw = raw.slice(cursor + 1);
  const { value, quote } = parseValueDetailed(afterEqRaw, line, issues);

  return {
    line,
    raw,
    leadingWhitespace,
    exported,
    key,
    keyColumn: keyStart + 1,
    beforeEqWhitespace,
    afterEqRaw,
    value,
    quote
  };
}

export function parseDotenvDocument(contents: string): DotenvDocument {
  const issues: DotenvIssue[] = [];
  const endsWithNewline = contents.endsWith('\n');

  const split = contents.split(/\r?\n/);
  if (endsWithNewline) split.pop();

  const lines: DotenvLine[] = [];
  for (let i = 0; i < split.length; i++) {
    const lineNumber = i + 1;
    const raw = split[i] ?? '';

    const trimmed = raw.trim();
    if (!trimmed) {
      lines.push({ kind: 'blank', line: lineNumber, raw });
      continue;
    }

    if (raw.trimStart().startsWith('#')) {
      lines.push({ kind: 'comment', line: lineNumber, raw });
      continue;
    }

    const parsed = parseAssignmentLine(raw, lineNumber, issues);
    if (parsed) lines.push({ kind: 'assignment', ...parsed });
    else lines.push({ kind: 'unknown', line: lineNumber, raw });
  }

  return { lines, issues, endsWithNewline };
}

export function stringifyDotenvDocument(doc: DotenvDocument): string {
  const out = doc.lines.map((l) => l.raw).join('\n');
  return doc.endsWithNewline ? `${out}\n` : out;
}
