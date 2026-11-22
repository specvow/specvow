import type { SpecOperation } from "./types.js";

type Endpoint = {
  http: string;
  path: string;
};

const HTTP = /^(get|put|post|delete|options|head|patch|trace)\s+(\S+)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEndpoint(value: unknown): Endpoint | undefined {
  const raw = typeof value === "string" ? value : isRecord(value) && typeof value.endpoint === "string" ? value.endpoint : undefined;
  if (!raw) return undefined;
  const match = raw.trim().match(HTTP);
  if (!match) return undefined;
  const route = match[2].startsWith("/") ? match[2] : `/${match[2]}`;
  return { http: match[1].toLowerCase(), path: route };
}

function withIdAcronym(part: string, index: number): string {
  if (part.toLowerCase() === "id") return index === 0 ? "id" : "ID";
  const words = part.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g);
  if (!words) return part;
  return words
    .map((word, wordIndex) => {
      if (word.toLowerCase() !== "id") return word;
      return index === 0 && wordIndex === 0 ? "id" : "ID";
    })
    .join("");
}

/** Stainless method and resource names as they appear on a TypeScript client. */
export function stainlessTypeScriptName(snake: string): string {
  const parts = snake.split("_").filter((part) => part.length > 0);
  return parts
    .map((part, index) => {
      const named = withIdAcronym(part, index);
      if (index === 0) return named;
      return named.charAt(0).toUpperCase() + named.slice(1);
    })
    .join("");
}

function collect(
  resources: unknown,
  prefix: string,
  endpoints: Array<{ methodPath: string; endpoint: Endpoint }>,
): void {
  if (!isRecord(resources)) return;
  for (const [name, value] of Object.entries(resources)) {
    if (name.startsWith("$") || !isRecord(value)) continue;
    const resourcePath = prefix ? `${prefix}.${stainlessTypeScriptName(name)}` : stainlessTypeScriptName(name);
    if (isRecord(value.methods)) {
      for (const [methodName, methodValue] of Object.entries(value.methods)) {
        const endpoint = readEndpoint(methodValue);
        if (!endpoint) continue;
        endpoints.push({
          methodPath: `${resourcePath}.${stainlessTypeScriptName(methodName)}`,
          endpoint,
        });
      }
    }
    collect(value.subresources, resourcePath, endpoints);
  }
}

export function methodMapFromStainless(
  document: unknown,
  operations: SpecOperation[],
): { map: Record<string, string>; errors: string[] } {
  if (!isRecord(document)) {
    return { map: {}, errors: ["stainless.yml must be a YAML object"] };
  }
  const endpoints: Array<{ methodPath: string; endpoint: Endpoint }> = [];
  collect(document.resources, "", endpoints);

  const map: Record<string, string> = {};
  const errors: string[] = [];
  for (const item of endpoints) {
    const hits = operations.filter(
      (operation) => operation.method === item.endpoint.http && operation.path === item.endpoint.path,
    );
    if (hits.length !== 1) {
      const found = hits.map((operation) => operation.operationId).join(", ") || "none";
      errors.push(
        `${item.methodPath} points at ${item.endpoint.http.toUpperCase()} ${item.endpoint.path}, matched ${found}`,
      );
      continue;
    }
    map[item.methodPath] = hits[0].operationId;
  }
  return { map, errors };
}
