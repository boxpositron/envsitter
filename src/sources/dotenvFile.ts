import { readFile } from 'node:fs/promises';
import { parseDotenv } from '../dotenv/parse.js';

export type DotenvFileSourceOptions = {
  allowErrors?: boolean;
};

type Snapshot = {
  values: ReadonlyMap<string, string>;
};

export class DotenvFileSource {
  readonly filePath: string;
  readonly options: DotenvFileSourceOptions;

  constructor(filePath: string, options: DotenvFileSourceOptions = {}) {
    this.filePath = filePath;
    this.options = options;
  }

  async load(): Promise<Snapshot> {
    const contents = await readFile(this.filePath, 'utf8');
    const parsed = parseDotenv(contents);

    if (parsed.errors.length > 0 && !this.options.allowErrors) {
      const message = parsed.errors.map((e) => `L${e.line}: ${e.message}`).join(', ');
      throw new Error(`Invalid dotenv file: ${message}`);
    }

    return { values: parsed.values };
  }
}
