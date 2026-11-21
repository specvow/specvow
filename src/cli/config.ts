import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type CliFlags = {
  spec?: string;
  sdk?: string;
  client?: string;
  lock?: string;
  config?: string;
  format: string;
  out?: string;
};

export type ResolvedConfig = {
  spec: string;
  sdk: string;
  client: string;
  lock?: string;
  map: Record<string, string>;
  format: string;
  out?: string;
};

type RawConfig = {
  spec?: string;
  sdk?: string;
  client?: string;
  lock?: string;
  language?: string;
  map?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveConfig(cwd: string, flags: CliFlags): Promise<ResolvedConfig> {
  const configPath = flags.config
    ? path.resolve(cwd, flags.config)
    : path.join(cwd, "specvow.config.yaml");
  let raw: RawConfig = {};
  let base = cwd;
  try {
    const text = await readFile(configPath, "utf8");
    const parsed: unknown = parse(text);
    if (!isRecord(parsed)) throw new Error(`${configPath} must be a YAML object`);
    raw = parsed as RawConfig;
    base = path.dirname(configPath);
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing || flags.config) throw error;
  }

  if (raw.language && raw.language !== "typescript") {
    throw new Error(`Only TypeScript SDKs are supported in this version (got "${raw.language}")`);
  }

  const spec = flags.spec ?? raw.spec;
  const sdk = flags.sdk ?? raw.sdk;
  if (!spec || !sdk) {
    throw new Error("Provide --config or both --spec and --sdk");
  }

  const map = raw.map ?? {};
  for (const [method, operationId] of Object.entries(map)) {
    if (typeof operationId !== "string") {
      throw new Error(`map.${method} must be an operationId string`);
    }
  }

  return {
    spec: path.resolve(base, spec),
    sdk: path.resolve(base, sdk),
    client: flags.client ?? raw.client ?? "Client",
    lock: flags.lock ? path.resolve(cwd, flags.lock) : raw.lock ? path.resolve(base, raw.lock) : undefined,
    map,
    format: flags.format,
    out: flags.out ? path.resolve(cwd, flags.out) : raw.lock ? path.resolve(base, raw.lock) : path.resolve(cwd, "surface.lock.json"),
  };
}
