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
  annotateEnvFile,
  copyEnvFileKeys,
  formatEnvFile,
  validateEnvFile,
  type AnnotateEnvFileResult,
  type CopyEnvFilesResult,
  type FormatEnvFileResult,
  type ValidateEnvFileResult
} from './file-ops.js';
