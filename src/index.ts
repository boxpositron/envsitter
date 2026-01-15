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
  type CopyEnvFilesResult,
  type DeleteEnvFileKeysResult,
  type FormatEnvFileResult,
  type KeyMutationAction,
  type KeyMutationPlanItem,
  type SetEnvFileKeyResult,
  type UnsetEnvFileKeyResult,
  type ValidateEnvFileResult
} from './file-ops.js';

export { isExampleEnvFile } from './dotenv/utils.js';
