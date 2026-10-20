import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type PepperOptions = {
  envVarNames?: string[];
  pepperFilePath?: string;
  createIfMissing?: boolean;
};

export type PepperResult = {
  pepperBytes: Uint8Array;
  source: 'env' | 'file';
  pepperFilePath?: string;
};

function defaultPepperFilePath(): string {
  return join(process.cwd(), '.envsitter', 'pepper');
}

function getPepperFromEnv(envVarNames: string[]): string | undefined {
  for (const name of envVarNames) {
    const value = process.env[name];
    if (value && value.length > 0) return value;
  }
  return undefined;
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : undefined;
}

function parsePepperFileContentToBytes(content: string, pepperFilePath: string): Uint8Array {
  const recovery = 'Restore it, or delete it to generate a new pepper (fingerprints made with the old pepper will stop matching).';
  const trimmed = content.trim();
  if (!trimmed) throw new Error(`Pepper file ${pepperFilePath} is empty. ${recovery}`);
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length < 16) throw new Error(`Pepper file ${pepperFilePath} is too short. ${recovery}`);
  return new Uint8Array(decoded);
}

async function readPepperFile(pepperFilePath: string): Promise<string | undefined> {
  try {
    return await readFile(pepperFilePath, 'utf8');
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

// Keeps a project's .envsitter/ out of git even when the project's own .gitignore does not list it.
async function ignorePepperDirectory(dir: string): Promise<void> {
  try {
    await writeFile(join(dir, '.gitignore'), '*\n', { encoding: 'utf8', flag: 'wx' });
  } catch (error: unknown) {
    if (errorCode(error) === 'EEXIST') return;
    throw error;
  }
}

export async function resolvePepper(options: PepperOptions = {}): Promise<PepperResult> {
  const envVarNames = options.envVarNames ?? ['ENVSITTER_PEPPER', 'ENV_SITTER_PEPPER'];
  const pepperFromEnv = getPepperFromEnv(envVarNames);
  if (pepperFromEnv !== undefined) {
    return {
      pepperBytes: new TextEncoder().encode(pepperFromEnv),
      source: 'env'
    };
  }

  const pepperFilePath = options.pepperFilePath ?? defaultPepperFilePath();
  const createIfMissing = options.createIfMissing ?? true;

  const existing = await readPepperFile(pepperFilePath);
  if (existing !== undefined) {
    return { pepperBytes: parsePepperFileContentToBytes(existing, pepperFilePath), source: 'file', pepperFilePath };
  }
  if (!createIfMissing) throw new Error(`Pepper file ${pepperFilePath} does not exist`);

  const dir = dirname(pepperFilePath);
  await mkdir(dir, { recursive: true });
  if (basename(dir) === '.envsitter') await ignorePepperDirectory(dir);

  const pepper = randomBytes(32);
  try {
    await writeFile(pepperFilePath, pepper.toString('base64'), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error: unknown) {
    if (errorCode(error) !== 'EEXIST') throw error;
    const created = await readFile(pepperFilePath, 'utf8');
    return { pepperBytes: parsePepperFileContentToBytes(created, pepperFilePath), source: 'file', pepperFilePath };
  }

  try {
    await chmod(pepperFilePath, 0o600);
  } catch {
    if (process.env.ENVSITTER_DEBUG === '1') {
      console.error(`envsitter: could not set permissions on ${pepperFilePath}`);
    }
  }

  return { pepperBytes: new Uint8Array(pepper), source: 'file', pepperFilePath };
}
