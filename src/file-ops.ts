import { readFile } from 'node:fs/promises';

import {
  addDotenvKey,
  annotateDotenvKey,
  copyDotenvKeys,
  deleteDotenvKeys,
  formatDotenv,
  setDotenvKey,
  unsetDotenvKey,
  validateDotenv,
  type KeyMutationAction,
  type KeyMutationPlanItem
} from './dotenv/edit.js';
import { readTextFileOrEmpty, writeTextFileAtomic } from './dotenv/io.js';

export type DotenvIssue = {
  line: number;
  column: number;
  message: string;
};

export type CopyConflictPolicy = 'error' | 'skip' | 'overwrite';

export type CopyPlanItem = {
  fromKey: string;
  toKey: string;
  action: 'copy' | 'skip' | 'overwrite' | 'missing_source' | 'conflict';
  fromLine?: number;
  toLine?: number;
};

export type FormatMode = 'sections' | 'global';
export type FormatSort = 'alpha' | 'none';

export type AnnotatePlan = {
  key: string;
  action: 'inserted' | 'updated' | 'not_found' | 'ambiguous';
  keyLines?: number[];
  line?: number;
};

export type CopyEnvFilesResult = {
  from: string;
  to: string;
  onConflict: CopyConflictPolicy;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: CopyPlanItem[];
};

export async function copyEnvFileKeys(options: {
  from: string;
  to: string;
  keys?: readonly string[];
  include?: RegExp;
  exclude?: RegExp;
  rename?: string;
  onConflict?: CopyConflictPolicy;
  write?: boolean;
}): Promise<CopyEnvFilesResult> {
  const sourceContents = await readFile(options.from, 'utf8');
  const targetContents = await readTextFileOrEmpty(options.to);

  const result = copyDotenvKeys({
    sourceContents,
    targetContents,
    ...(options.keys ? { keys: options.keys } : {}),
    ...(options.include ? { include: options.include } : {}),
    ...(options.exclude ? { exclude: options.exclude } : {}),
    ...(options.rename ? { rename: options.rename } : {}),
    onConflict: options.onConflict ?? 'error'
  });

  const conflicts = result.plan.some((p) => p.action === 'conflict');
  const willWrite = options.write === true;

  if (willWrite && !conflicts && result.hasChanges) {
    await writeTextFileAtomic(options.to, result.output);
  }

  return {
    from: options.from,
    to: options.to,
    onConflict: options.onConflict ?? 'error',
    willWrite,
    wrote: willWrite && !conflicts && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}

export type FormatEnvFileResult = {
  file: string;
  mode: FormatMode;
  sort: FormatSort;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
};

export async function formatEnvFile(options: {
  file: string;
  mode?: FormatMode;
  sort?: FormatSort;
  write?: boolean;
}): Promise<FormatEnvFileResult> {
  const mode = options.mode ?? 'sections';
  const sort = options.sort ?? 'alpha';
  const contents = await readFile(options.file, 'utf8');

  const result = formatDotenv({ contents, mode, sort });
  const willWrite = options.write === true;

  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    mode,
    sort,
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues
  };
}

export type AnnotateEnvFileResult = {
  file: string;
  key: string;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: AnnotatePlan;
};

export async function annotateEnvFile(options: {
  file: string;
  key: string;
  comment: string;
  line?: number;
  write?: boolean;
}): Promise<AnnotateEnvFileResult> {
  const contents = await readFile(options.file, 'utf8');
  const result = annotateDotenvKey({
    contents,
    key: options.key,
    comment: options.comment,
    ...(options.line !== undefined ? { line: options.line } : {})
  });

  const willWrite = options.write === true;
  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    key: options.key,
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}

export type ValidateEnvFileResult = {
  file: string;
  ok: boolean;
  issues: DotenvIssue[];
};

export async function validateEnvFile(file: string): Promise<ValidateEnvFileResult> {
  const contents = await readFile(file, 'utf8');
  const result = validateDotenv(contents);
  return { file, ok: result.ok, issues: result.issues };
}

export type { KeyMutationAction, KeyMutationPlanItem };

export type AddEnvFileKeyResult = {
  file: string;
  key: string;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: KeyMutationPlanItem;
};

export async function addEnvFileKey(options: {
  file: string;
  key: string;
  value: string;
  write?: boolean;
}): Promise<AddEnvFileKeyResult> {
  const contents = await readTextFileOrEmpty(options.file);
  const result = addDotenvKey({ contents, key: options.key, value: options.value });

  const willWrite = options.write === true;
  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    key: options.key,
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}

export type SetEnvFileKeyResult = {
  file: string;
  key: string;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: KeyMutationPlanItem;
};

export async function setEnvFileKey(options: {
  file: string;
  key: string;
  value: string;
  write?: boolean;
}): Promise<SetEnvFileKeyResult> {
  const contents = await readTextFileOrEmpty(options.file);
  const result = setDotenvKey({ contents, key: options.key, value: options.value });

  const willWrite = options.write === true;
  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    key: options.key,
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}

export type UnsetEnvFileKeyResult = {
  file: string;
  key: string;
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: KeyMutationPlanItem;
};

export async function unsetEnvFileKey(options: {
  file: string;
  key: string;
  write?: boolean;
}): Promise<UnsetEnvFileKeyResult> {
  const contents = await readFile(options.file, 'utf8');
  const result = unsetDotenvKey({ contents, key: options.key });

  const willWrite = options.write === true;
  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    key: options.key,
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}

export type DeleteEnvFileKeysResult = {
  file: string;
  keys: string[];
  willWrite: boolean;
  wrote: boolean;
  hasChanges: boolean;
  issues: DotenvIssue[];
  plan: KeyMutationPlanItem[];
};

export async function deleteEnvFileKeys(options: {
  file: string;
  keys: readonly string[];
  write?: boolean;
}): Promise<DeleteEnvFileKeysResult> {
  const contents = await readFile(options.file, 'utf8');
  const result = deleteDotenvKeys({ contents, keys: options.keys });

  const willWrite = options.write === true;
  if (willWrite && result.hasChanges) {
    await writeTextFileAtomic(options.file, result.output);
  }

  return {
    file: options.file,
    keys: [...options.keys],
    willWrite,
    wrote: willWrite && result.hasChanges,
    hasChanges: result.hasChanges,
    issues: result.issues,
    plan: result.plan
  };
}
