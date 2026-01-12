import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseDotenv } from '../dotenv/parse.js';

const execFileAsync = promisify(execFile);

type Snapshot = {
  values: ReadonlyMap<string, string>;
};

export type ExternalCommandSourceOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  allowErrors?: boolean;
};

export class ExternalCommandSource {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ExternalCommandSourceOptions;

  constructor(command: string, args: readonly string[] = [], options: ExternalCommandSourceOptions = {}) {
    this.command = command;
    this.args = args;
    this.options = options;
  }

  async load(): Promise<Snapshot> {
    const { stdout } = await execFileAsync(this.command, [...this.args], {
      cwd: this.options.cwd,
      env: this.options.env,
      timeout: this.options.timeoutMs
    });

    const parsed = parseDotenv(stdout);

    if (parsed.errors.length > 0 && !this.options.allowErrors) {
      const message = parsed.errors.map((e) => `L${e.line}: ${e.message}`).join(', ');
      throw new Error(`Invalid dotenv content from external command: ${message}`);
    }

    return { values: parsed.values };
  }
}
