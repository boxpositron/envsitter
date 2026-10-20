const EXAMPLE_FILE_PATTERN = /\.env\.(example|sample|template|dist|defaults?)$/i;
const PEPPER_FILE_PATTERN = /(^|\/)\.envsitter\/pepper$/;

// `<name>.env.<ext>` with one of these extensions is source code (e.g. `app.env.ts`), not a dotenv file.
const SOURCE_EXTENSIONS = new Set([
  'js',
  'cjs',
  'mjs',
  'jsx',
  'ts',
  'cts',
  'mts',
  'tsx',
  'md',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'php',
  'cs',
  'lua',
  'dart',
  'ex',
  'exs'
]);

function normalizePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function baseName(filePath: string): string {
  const normalized = normalizePath(filePath);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

/**
 * True for dotenv-style file names: `.env`, `.env.local`, `api.env`, `config.env.local`, `.env.example`.
 * Matches on the file name only, so it works for relative, absolute, and Windows paths.
 */
export function isEnvFile(filePath: string): boolean {
  const parts = baseName(filePath).toLowerCase().split('.');
  const envIndex = parts.indexOf('env', 1);
  if (envIndex === -1) return false;

  const last = parts[parts.length - 1] ?? '';
  return !(parts.length - 1 > envIndex && SOURCE_EXTENSIONS.has(last));
}

/** True for committed template files (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.default(s)`). */
export function isExampleEnvFile(filePath: string): boolean {
  return EXAMPLE_FILE_PATTERN.test(normalizePath(filePath));
}

/** True for dotenv files that may hold real values: every env file except example/template files. */
export function isSensitiveEnvFile(filePath: string): boolean {
  return isEnvFile(filePath) && !isExampleEnvFile(filePath);
}

/** True for the default pepper location (`.envsitter/pepper`). Custom `--pepper-file` paths are not detectable. */
export function isEnvSitterPepperFile(filePath: string): boolean {
  return PEPPER_FILE_PATTERN.test(normalizePath(filePath));
}
