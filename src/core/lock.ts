import { readFile, writeFile } from "node:fs/promises";
import type { LockFile, Match, SdkMethod, SpecOperation } from "./types.js";

export function buildLock(
  client: string,
  matches: Match[],
  operations: SpecOperation[],
  methods: SdkMethod[],
): LockFile {
  const byOperation = new Map(operations.map((operation) => [operation.operationId, operation]));
  const byMethod = new Map(methods.map((method) => [method.name, method]));
  const locked = matches.map((match) => {
    const operation = byOperation.get(match.operationId);
    const method = byMethod.get(match.method);
    if (!operation || !method) {
      throw new Error(`Cannot lock ${match.method}: the match is incomplete`);
    }
    return {
      name: method.name,
      operationId: operation.operationId,
      http: `${operation.method} ${operation.path}`,
      params: method.params.map((param) => ({ name: param.name, optional: param.optional })),
    };
  });
  locked.sort((left, right) => left.name.localeCompare(right.name));
  return { specvow: 1, client, methods: locked };
}

export function parseLock(text: string): LockFile {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Lockfile must be a JSON object");
  }
  const record = data as Partial<LockFile>;
  if (record.specvow !== 1 || typeof record.client !== "string" || !Array.isArray(record.methods)) {
    throw new Error("Lockfile is not a SpecVow v1 surface lock");
  }
  return record as LockFile;
}

export async function readLock(file: string): Promise<LockFile> {
  return parseLock(await readFile(file, "utf8"));
}

export async function writeLock(file: string, lock: LockFile): Promise<void> {
  await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}
