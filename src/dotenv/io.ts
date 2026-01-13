import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function readTextFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT') return '';
    throw error;
  }
}

export async function writeTextFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = dirname(filePath);
  const tmp = await mkdtemp(join(dir, '.envsitter-tmp-'));
  const tmpFile = join(tmp, 'file');

  try {
    await writeFile(tmpFile, contents, 'utf8');
    await rename(tmpFile, filePath);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
