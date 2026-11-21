export { classify } from "./classify.js";
export { buildLock, parseLock, readLock, writeLock } from "./lock.js";
export { loadSpec } from "./load-spec.js";
export { matchSurface, operationCandidates } from "./match.js";
export { operationsFromDocument } from "./openapi.js";
export { exitCode, render, renderJson, renderMarkdown, renderText } from "./report.js";
export type {
  Finding,
  LockFile,
  Match,
  SdkMethod,
  SpecOperation,
} from "./types.js";
