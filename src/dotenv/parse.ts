import { parseDotenvDocument, type DotenvIssue } from './document.js';

export type DotenvParseError = DotenvIssue;

export type DotenvParseResult = {
  values: Map<string, string>;
  errors: DotenvParseError[];
};

export function parseDotenv(contents: string): DotenvParseResult {
  const doc = parseDotenvDocument(contents);
  const values = new Map<string, string>();

  for (const line of doc.lines) {
    if (line.kind === 'assignment') values.set(line.key, line.value);
  }

  return { values, errors: doc.issues };
}
