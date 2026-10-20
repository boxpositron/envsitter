export {
  EnvSitter,
  type Detection,
  type EnvSitterFingerprint,
  type EnvSitterKeyMatch,
  type EnvSitterMatcher,
  type ListKeysOptions,
  type MatchOptions,
  type ScanFinding,
  type ScanOptions
} from './envsitter.js';

export { type PepperOptions, resolvePepper } from './pepper.js';

export { type EnvSitterRedactor, type RedactionCount, type RedactOptions, type RedactResult } from './redact.js';

export {
  addEnvFileKey,
  annotateEnvFile,
  copyEnvFileKeys,
  deleteEnvFileKeys,
  formatEnvFile,
  setEnvFileKey,
  unsetEnvFileKey,
  validateEnvFile,
  type AddEnvFileKeyResult,
  type AnnotateEnvFileResult,
  type AnnotatePlan,
  type CopyConflictPolicy,
  type CopyEnvFilesResult,
  type CopyPlanItem,
  type DeleteEnvFileKeysResult,
  type DotenvIssue,
  type FormatEnvFileResult,
  type FormatMode,
  type FormatSort,
  type KeyMutationAction,
  type KeyMutationPlanItem,
  type SetEnvFileKeyResult,
  type UnsetEnvFileKeyResult,
  type ValidateEnvFileResult
} from './file-ops.js';

export { isEnvFile, isEnvSitterPepperFile, isExampleEnvFile, isSensitiveEnvFile } from './paths.js';
