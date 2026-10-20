export function quoteValue(value: string): string {
  if (value === '') return '';

  const hasWhitespace = /\s/.test(value);
  const hasSpecialChars = /[#"'\\$`]/.test(value);
  const hasControlChars = /[\n\r\t]/.test(value);
  const hasEdgeSpaces = value.startsWith(' ') || value.endsWith(' ');

  const needsQuoting = hasWhitespace || hasSpecialChars || hasControlChars || hasEdgeSpaces;

  if (!needsQuoting) return value;

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  return `"${escaped}"`;
}

export function buildAssignmentLine(key: string, value: string): string {
  return `${key}=${quoteValue(value)}`;
}
