import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

function parsePepperFileContentToBytes(content: string): Uint8Array {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Pepper file is empty');
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length < 16) throw new Error('Pepper file content is too short');
  return new Uint8Array(decoded);
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

  try {
    const content = await readFile(pepperFilePath, 'utf8');
    return { pepperBytes: parsePepperFileContentToBytes(content), source: 'file', pepperFilePath };
  } catch (error) {
    if (!createIfMissing) throw error;

    const dir = dirname(pepperFilePath);
    await mkdir(dir, { recursive: true });

    const pepper = randomBytes(32);
    await writeFile(pepperFilePath, pepper.toString('base64'), { encoding: 'utf8', mode: 0o600 });

    try {
      await chmod(pepperFilePath, 0o600);
    } catch {
      if (process.env.ENVSITTER_DEBUG === '1') {
        console.error(`envsitter: could not set permissions on ${pepperFilePath}`);
      }
    }

    return { pepperBytes: new Uint8Array(pepper), source: 'file', pepperFilePath };
  }
}
