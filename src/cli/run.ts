import { access, readFile } from "node:fs/promises";
import { parse } from "yaml";
import { buildLock, classify, exitCode, loadSpec, matchSurface, methodMapFromStainless, readLock, render, writeLock } from "../core/index.js";
import { resolveConfig, type CliFlags } from "./config.js";
import { extractTypeScriptSurface } from "./extract-ts.js";

export type Io = {
  log: (message: string) => void;
  error: (message: string) => void;
};

const help = `SpecVow checks a TypeScript SDK against an OpenAPI document.

The spec makes a promise. The SDK has to keep it.

Usage
  specvow check [--config specvow.config.yaml] [--spec openapi.yaml] [--sdk sdk/index.ts]
                [--client Client] [--lock surface.lock.json] [--stainless stainless.yml]
                [--format text|markdown|json]
  specvow lock  [--config specvow.config.yaml] [--out surface.lock.json]

Exit codes
  0  no breaking changes
  1  the command could not run
  2  breaking changes
`;

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function execute(argv: string[], cwd: string, io: Io): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    io.log(help);
    return command ? 0 : 1;
  }
  if (command !== "check" && command !== "lock") {
    io.error(`Unknown command "${command}". Use check or lock.`);
    return 1;
  }

  const flags = parseFlags(rest);
  const config = await resolveConfig(cwd, flags);
  const operations = await loadSpec(config.spec);
  const methods = extractTypeScriptSurface(config.sdk, config.client);
  const map = await surfaceMap(config.stainless, operations, config.map);

  if (command === "lock") {
    const matched = matchSurface(operations, methods, map);
    if (matched.errors.length > 0) throw new Error(matched.errors.join("\n"));
    const lock = buildLock(config.client, matched.matches, operations, methods);
    if (!config.out) throw new Error("No output path for the lockfile");
    await writeLock(config.out, lock);
    io.log(`Wrote ${config.out}`);
    return 0;
  }

  const lockPath = config.lock;
  const locked = Boolean(lockPath && (await exists(lockPath)));
  if (lockPath && !locked) {
    throw new Error(`Lockfile not found at ${lockPath}. Run specvow lock.`);
  }

  const matched = locked ? { matches: [], errors: [] } : matchSurface(operations, methods, map);
  if (matched.errors.length > 0) throw new Error(matched.errors.join("\n"));

  const findings = classify({
    operations,
    methods,
    matches: matched.matches,
    lock: locked && lockPath ? await readLock(lockPath) : null,
  });
  io.log(render(findings, locked, config.format).trimEnd());
  return exitCode(findings);
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { format: "text" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    const read = (name: string): string => {
      if (!next || next.startsWith("--")) throw new Error(`${name} needs a value`);
      index += 1;
      return next;
    };
    if (arg === "--spec") flags.spec = read(arg);
    else if (arg === "--sdk") flags.sdk = read(arg);
    else if (arg === "--client") flags.client = read(arg);
    else if (arg === "--lock") flags.lock = read(arg);
    else if (arg === "--stainless") flags.stainless = read(arg);
    else if (arg === "--config") flags.config = read(arg);
    else if (arg === "--format") flags.format = read(arg);
    else if (arg === "--out") flags.out = read(arg);
    else throw new Error(`Unknown option "${arg}"`);
  }
  return flags;
}

async function surfaceMap(
  stainless: string | undefined,
  operations: Awaited<ReturnType<typeof loadSpec>>,
  explicit: Record<string, string>,
): Promise<Record<string, string>> {
  if (!stainless) return explicit;
  const document: unknown = parse(await readFile(stainless, "utf8"));
  const mapped = methodMapFromStainless(document, operations);
  if (mapped.errors.length > 0) throw new Error(mapped.errors.join("\n"));
  return { ...mapped.map, ...explicit };
}
