import { chmod, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const newFileMode = 0o600;

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT';
}

export async function readTextFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isNotFound(error)) return '';
    throw error;
  }
}

async function resolveWriteTarget(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch (error: unknown) {
    if (isNotFound(error)) return filePath;
    throw error;
  }
}

async function existingFileMode(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mode & 0o7777;
  } catch (error: unknown) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

// Writes through symlinks to the real file and keeps its permission bits; new files are owner-only.
export async function writeTextFileAtomic(filePath: string, contents: string): Promise<void> {
  const target = await resolveWriteTarget(filePath);
  const mode = (await existingFileMode(target)) ?? newFileMode;
  const tmp = await mkdtemp(join(dirname(target), '.envsitter-tmp-'));
  const tmpFile = join(tmp, 'file');

  try {
    await writeFile(tmpFile, contents, { encoding: 'utf8', mode });
    await chmod(tmpFile, mode);
    await rename(tmpFile, target);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
