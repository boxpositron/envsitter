import { parseDotenvDocument, stringifyDotenvDocument, type DotenvParsedAssignment, type DotenvIssue } from './document.js';

export type DotenvWriteMode = 'dry-run' | 'write';

export type CopyConflictPolicy = 'error' | 'skip' | 'overwrite';

export type CopyPlanItem = {
  fromKey: string;
  toKey: string;
  action: 'copy' | 'skip' | 'overwrite' | 'missing_source' | 'conflict';
  fromLine?: number;
  toLine?: number;
};

export type CopyDotenvResult = {
  output: string;
  issues: DotenvIssue[];
  plan: CopyPlanItem[];
  hasChanges: boolean;
};

function lastAssignmentForKey(lines: readonly DotenvParsedAssignment[], key: string): DotenvParsedAssignment | undefined {
  let last: DotenvParsedAssignment | undefined;
  for (const l of lines) {
    if (l.key === key) last = l;
  }
  return last;
}

function listAssignments(docLines: ReturnType<typeof parseDotenvDocument>['lines']): DotenvParsedAssignment[] {
  const out: DotenvParsedAssignment[] = [];
  for (const l of docLines) {
    if (l.kind === 'assignment') out.push(l);
  }
  return out;
}

function parseRenameMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;

  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [from, to] = trimmed.split('=', 2);
    const fromKey = from?.trim();
    const toKey = to?.trim();
    if (!fromKey || !toKey) continue;
    map.set(fromKey, toKey);
  }

  return map;
}

function withNewKey(source: DotenvParsedAssignment, newKey: string): string {
  const exportPrefix = source.exported ? 'export ' : '';
  return `${source.leadingWhitespace}${exportPrefix}${newKey}${source.beforeEqWhitespace}=${source.afterEqRaw}`;
}

export function copyDotenvKeys(options: {
  sourceContents: string;
  targetContents: string;
  keys?: readonly string[];
  include?: RegExp;
  exclude?: RegExp;
  rename?: string;
  onConflict: CopyConflictPolicy;
}): CopyDotenvResult {
  const sourceDoc = parseDotenvDocument(options.sourceContents);
  const targetDoc = parseDotenvDocument(options.targetContents);

  const issues: DotenvIssue[] = [...sourceDoc.issues.map((i) => ({ ...i, message: `source: ${i.message}` })), ...targetDoc.issues.map((i) => ({ ...i, message: `target: ${i.message}` }))];

  const sourceAssignments = listAssignments(sourceDoc.lines);
  const targetAssignments = listAssignments(targetDoc.lines);

  const renameMap = parseRenameMap(options.rename);

  const requestedKeys = new Set<string>();
  if (options.keys) {
    for (const k of options.keys) {
      const trimmed = k.trim();
      if (trimmed) requestedKeys.add(trimmed);
    }
  } else {
    for (const a of sourceAssignments) requestedKeys.add(a.key);
  }

  const plan: CopyPlanItem[] = [];
  let hasChanges = false;

  for (const fromKey of [...requestedKeys].sort((a, b) => a.localeCompare(b))) {
    if (options.include && !options.include.test(fromKey)) continue;
    if (options.exclude && options.exclude.test(fromKey)) continue;

    const toKey = renameMap.get(fromKey) ?? fromKey;

    const sourceLine = lastAssignmentForKey(sourceAssignments, fromKey);
    if (!sourceLine) {
      plan.push({ fromKey, toKey, action: 'missing_source' });
      continue;
    }

    const targetLine = lastAssignmentForKey(targetAssignments, toKey);
    if (!targetLine) {
      const newRaw = toKey === fromKey ? sourceLine.raw : withNewKey(sourceLine, toKey);
      targetDoc.lines.push({ kind: 'assignment', ...sourceLine, key: toKey, raw: newRaw });
      plan.push({ fromKey, toKey, action: 'copy', fromLine: sourceLine.line });
      hasChanges = true;
      continue;
    }

    if (options.onConflict === 'skip') {
      plan.push({ fromKey, toKey, action: 'skip', fromLine: sourceLine.line, toLine: targetLine.line });
      continue;
    }

    if (options.onConflict === 'error') {
      plan.push({ fromKey, toKey, action: 'conflict', fromLine: sourceLine.line, toLine: targetLine.line });
      continue;
    }

    for (let i = targetDoc.lines.length - 1; i >= 0; i--) {
      const l = targetDoc.lines[i];
      if (l?.kind === 'assignment' && l.key === toKey) {
        const newRaw = toKey === fromKey ? sourceLine.raw : withNewKey(sourceLine, toKey);
        targetDoc.lines[i] = { kind: 'assignment', ...sourceLine, key: toKey, raw: newRaw };
        plan.push({ fromKey, toKey, action: 'overwrite', fromLine: sourceLine.line, toLine: l.line });
        hasChanges = true;
        break;
      }
    }
  }

  return { output: stringifyDotenvDocument(targetDoc), issues, plan, hasChanges };
}

export type AnnotatePlan = {
  key: string;
  action: 'inserted' | 'updated' | 'not_found' | 'ambiguous';
  keyLines?: number[];
  line?: number;
};

export type AnnotateDotenvResult = {
  output: string;
  issues: DotenvIssue[];
  plan: AnnotatePlan;
  hasChanges: boolean;
};

export function annotateDotenvKey(options: { contents: string; key: string; comment: string; line?: number }): AnnotateDotenvResult {
  const doc = parseDotenvDocument(options.contents);
  const issues: DotenvIssue[] = [...doc.issues];

  const assignments = listAssignments(doc.lines).filter((a) => a.key === options.key);
  const lines = assignments.map((a) => a.line);

  if (assignments.length === 0) {
    return {
      output: options.contents,
      issues,
      plan: { key: options.key, action: 'not_found' },
      hasChanges: false
    };
  }

  const first = assignments.at(0);
  if (!first) {
    return {
      output: options.contents,
      issues,
      plan: { key: options.key, action: 'not_found' },
      hasChanges: false
    };
  }

  let target = first;
  if (options.line !== undefined) {
    const matched = assignments.find((a) => a.line === options.line);
    if (!matched) {
      return {
        output: options.contents,
        issues,
        plan: { key: options.key, action: 'ambiguous', keyLines: lines },
        hasChanges: false
      };
    }
    target = matched;
  } else if (assignments.length > 1) {
    return {
      output: options.contents,
      issues,
      plan: { key: options.key, action: 'ambiguous', keyLines: lines },
      hasChanges: false
    };
  }

  const targetIndex = doc.lines.findIndex((l) => l.kind === 'assignment' && l.line === target.line);
  if (targetIndex === -1) {
    return {
      output: options.contents,
      issues,
      plan: { key: options.key, action: 'not_found' },
      hasChanges: false
    };
  }

  const desiredRaw = `${target.leadingWhitespace}# envsitter: ${options.comment}`;
  const prev = targetIndex > 0 ? doc.lines[targetIndex - 1] : undefined;
  if (prev && prev.kind === 'comment' && prev.raw.trimStart().startsWith('# envsitter:')) {
    doc.lines[targetIndex - 1] = { ...prev, raw: desiredRaw };
    return { output: stringifyDotenvDocument(doc), issues, plan: { key: options.key, action: 'updated', line: target.line }, hasChanges: true };
  }

  doc.lines.splice(targetIndex, 0, { kind: 'comment', line: target.line, raw: desiredRaw });
  return { output: stringifyDotenvDocument(doc), issues, plan: { key: options.key, action: 'inserted', line: target.line }, hasChanges: true };
}

export type FormatMode = 'sections' | 'global';
export type FormatSort = 'alpha' | 'none';

export type FormatDotenvResult = {
  output: string;
  issues: DotenvIssue[];
  hasChanges: boolean;
};

function splitIntoSections(docLines: ReturnType<typeof parseDotenvDocument>['lines']): Array<{ lines: ReturnType<typeof parseDotenvDocument>['lines'] }> {
  const sections: Array<{ lines: ReturnType<typeof parseDotenvDocument>['lines'] }> = [];
  let current: ReturnType<typeof parseDotenvDocument>['lines'] = [];
  for (const l of docLines) {
    if (l.kind === 'blank') {
      current.push(l);
      sections.push({ lines: current });
      current = [];
      continue;
    }
    current.push(l);
  }
  sections.push({ lines: current });
  return sections;
}

function formatSection(sectionLines: ReturnType<typeof parseDotenvDocument>['lines'], sort: FormatSort): ReturnType<typeof parseDotenvDocument>['lines'] {
  if (sort === 'none') return sectionLines;

  const header: typeof sectionLines = [];
  const rest: typeof sectionLines = [];

  let sawAssignment = false;
  for (const l of sectionLines) {
    if (!sawAssignment && l.kind === 'comment') {
      header.push(l);
      continue;
    }
    if (l.kind === 'assignment') sawAssignment = true;
    rest.push(l);
  }

  type Block = { key: string; lines: typeof sectionLines };
  const blocks: Block[] = [];
  const trailing: typeof sectionLines = [];

  let pendingComments: typeof sectionLines = [];
  for (const l of rest) {
    if (l.kind === 'comment') {
      pendingComments.push(l);
      continue;
    }
    if (l.kind === 'assignment') {
      blocks.push({ key: l.key, lines: [...pendingComments, l] });
      pendingComments = [];
      continue;
    }
    trailing.push(...pendingComments);
    pendingComments = [];
    trailing.push(l);
  }
  trailing.push(...pendingComments);

  blocks.sort((a, b) => a.key.localeCompare(b.key));
  return [...header, ...blocks.flatMap((b) => b.lines), ...trailing];
}

export function formatDotenv(options: { contents: string; mode: FormatMode; sort: FormatSort }): FormatDotenvResult {
  const doc = parseDotenvDocument(options.contents);
  const issues: DotenvIssue[] = [...doc.issues];

  if (options.sort === 'none') return { output: options.contents, issues, hasChanges: false };

  let nextLines: ReturnType<typeof parseDotenvDocument>['lines'];

  if (options.mode === 'global') {
    nextLines = formatSection(doc.lines, options.sort);
  } else {
    const sections = splitIntoSections(doc.lines);
    nextLines = sections.flatMap((s) => formatSection(s.lines, options.sort));
  }

  const nextDoc = { ...doc, lines: nextLines };
  const output = stringifyDotenvDocument(nextDoc);
  return { output, issues, hasChanges: output !== options.contents };
}

export type ValidateDotenvResult = {
  issues: DotenvIssue[];
  ok: boolean;
};

export function validateDotenv(contents: string): ValidateDotenvResult {
  const doc = parseDotenvDocument(contents);
  return { issues: doc.issues, ok: doc.issues.length === 0 };
}
