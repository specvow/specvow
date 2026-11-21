import type { Match, SdkMethod, SpecOperation } from "./types.js";

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1);
}

function singularize(word: string): string {
  if (word.endsWith("ies") && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) return word.slice(0, -1);
  return word;
}

export function operationCandidates(methodName: string): Set<string> {
  const parts = methodName.split(".");
  const verb = parts[parts.length - 1] ?? methodName;
  const resource = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (!resource) return new Set([verb]);

  const names = new Set([resource, singularize(resource)]);
  const candidates = new Set<string>();
  for (const name of names) {
    const pascal = capitalize(name);
    candidates.add(`${verb}${pascal}`);
    candidates.add(`${name}${capitalize(verb)}`);
  }
  return candidates;
}

export function matchSurface(
  operations: SpecOperation[],
  methods: SdkMethod[],
  map: Record<string, string>,
): { matches: Match[]; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  const usedOps = new Set<string>();
  const usedMethods = new Set<string>();
  const matches: Match[] = [];

  function claim(method: SdkMethod, operationId: string, via: Match["via"]): void {
    if (!byId.has(operationId)) {
      errors.push(`${method.name} maps to "${operationId}", which is not in the spec`);
      return;
    }
    if (usedOps.has(operationId)) {
      errors.push(`"${operationId}" is claimed by more than one SDK method`);
      return;
    }
    usedOps.add(operationId);
    usedMethods.add(method.name);
    matches.push({ method: method.name, operationId, via });
  }

  for (const method of methods) {
    const configured = map[method.name];
    if (configured) claim(method, configured, "map");
    else if (method.operationId) claim(method, method.operationId, "tag");
  }

  for (const method of methods) {
    if (usedMethods.has(method.name)) continue;
    const candidates = operationCandidates(method.name);
    const hits = operations.filter(
      (operation) => !usedOps.has(operation.operationId) && candidates.has(operation.operationId),
    );
    if (hits.length > 1) {
      const names = hits.map((operation) => operation.operationId).join(", ");
      errors.push(`${method.name} matches ${names}. Set map in specvow.config.yaml.`);
      continue;
    }
    if (hits.length === 1) claim(method, hits[0].operationId, "auto");
  }

  return { matches, errors };
}
