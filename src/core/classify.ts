import type { Finding, LockFile, Match, SdkMethod, SdkParam, SpecOperation, SpecParam } from "./types.js";

const BODY_NAMES = new Set(["body", "data", "payload", "input", "request"]);

function bodyParam(method: SdkMethod, operation: SpecOperation): SdkParam | undefined {
  const named = method.params.find((param) => BODY_NAMES.has(param.name));
  if (named) return named;
  const specNames = new Set(
    operation.params
      .filter((param) => param.location !== "body" && param.location !== "field")
      .map((param) => param.name.toLowerCase()),
  );
  const leftover = (param: SdkParam) =>
    !param.optional && param.name !== "options" && !specNames.has(param.name.toLowerCase());
  return method.params.find((param) => leftover(param) && param.fields.length > 0) ?? method.params.find(leftover);
}

function sameName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function satisfiesName(method: SdkMethod, param: SpecParam, skip: SdkParam | undefined): boolean {
  const names = [param.name, param.sdkName].filter((name): name is string => Boolean(name));
  for (const item of method.params) {
    if (skip && item === skip) continue;
    if (item.optional) continue;
    if (names.some((name) => sameName(item.name, name))) return true;
    if (item.fields.some((field) => !field.optional && names.some((name) => sameName(field.name, name)))) return true;
  }
  return false;
}

function missingPathParams(method: SdkMethod, operation: SpecOperation): string[] {
  const used = new Set<SdkParam>();
  const missing: string[] = [];
  for (const param of operation.params.filter((item) => item.location === "path")) {
    const found = method.params.find(
      (item) =>
        !item.optional &&
        !used.has(item) &&
        (sameName(item.name, param.name) || (param.sdkName !== undefined && sameName(item.name, param.sdkName))),
    );
    if (found) used.add(found);
    else missing.push(param.name);
  }
  if (missing.length !== 1) return missing;
  const spare = method.params.find(
    (item) => !item.optional && !used.has(item) && item.fields.length === 0 && item.name !== "options" && !BODY_NAMES.has(item.name),
  );
  return spare ? [] : missing;
}

function paramFindings(method: SdkMethod, operation: SpecOperation): Finding[] {
  const findings: Finding[] = [];
  const body = bodyParam(method, operation);
  const bodyRequired = operation.params.some((param) => param.location === "body");

  if (bodyRequired && (!body || body.optional)) {
    findings.push({
      level: "breaking",
      code: "new-required-param",
      method: method.name,
      operationId: operation.operationId,
      detail: `${method.name} now requires a request body`,
    });
  }

  if (bodyRequired && body && !body.optional) {
    for (const field of operation.params.filter((param) => param.location === "field")) {
      const declared = body.fields.find((item) => sameName(item.name, field.name));
      if (!declared || declared.optional) {
        findings.push({
          level: "breaking",
          code: "new-required-param",
          method: method.name,
          operationId: operation.operationId,
          detail: `${method.name} now requires \`${field.name}\``,
        });
      }
    }
  }

  for (const name of missingPathParams(method, operation)) {
    findings.push({
      level: "breaking",
      code: "new-required-param",
      method: method.name,
      operationId: operation.operationId,
      detail: `${method.name} now requires \`${name}\``,
    });
  }

  for (const param of operation.params) {
    if (param.location === "body" || param.location === "field" || param.location === "path") continue;
    if (satisfiesName(method, param, body)) continue;
    findings.push({
      level: "breaking",
      code: "new-required-param",
      method: method.name,
      operationId: operation.operationId,
      detail: `${method.name} now requires \`${param.name}\``,
    });
  }

  return findings;
}

function bySeverity(left: Finding, right: Finding): number {
  const rank = { breaking: 0, gap: 1, note: 2 };
  return rank[left.level] - rank[right.level] || left.detail.localeCompare(right.detail);
}

export function classify(input: {
  operations: SpecOperation[];
  methods: SdkMethod[];
  matches: Match[];
  lock: LockFile | null;
}): Finding[] {
  const findings: Finding[] = [];
  const operations = new Map(input.operations.map((operation) => [operation.operationId, operation]));
  const methods = new Map(input.methods.map((method) => [method.name, method]));

  if (input.lock) {
    const lockedOperations = new Set(input.lock.methods.map((method) => method.operationId));
    const lockedNames = new Set(input.lock.methods.map((method) => method.name));

    for (const locked of input.lock.methods) {
      const method = methods.get(locked.name);
      if (!method) {
        findings.push({
          level: "breaking",
          code: "removed-method",
          method: locked.name,
          operationId: locked.operationId,
          detail: `${locked.name} is in the lockfile and missing from the SDK`,
        });
        continue;
      }
      const operation = operations.get(locked.operationId);
      if (!operation) {
        findings.push({
          level: "breaking",
          code: "removed-operation",
          method: locked.name,
          operationId: locked.operationId,
          detail: `${locked.name} calls ${locked.operationId}, which is no longer in the spec`,
        });
        continue;
      }
      findings.push(...paramFindings(method, operation));
    }

    for (const operation of input.operations) {
      if (lockedOperations.has(operation.operationId)) continue;
      findings.push({
        level: "gap",
        code: "missing-method",
        operationId: operation.operationId,
        detail: `${operation.method.toUpperCase()} ${operation.path} (${operation.operationId}) has no SDK method in the lockfile`,
      });
    }

    for (const method of input.methods) {
      if (lockedNames.has(method.name)) continue;
      findings.push({
        level: "note",
        code: "orphan-method",
        method: method.name,
        detail: `${method.name} is not in the lockfile`,
      });
    }
  } else {
    const matchedOperations = new Set(input.matches.map((match) => match.operationId));
    const matchedMethods = new Set(input.matches.map((match) => match.method));

    for (const match of input.matches) {
      const method = methods.get(match.method);
      const operation = operations.get(match.operationId);
      if (!method || !operation) continue;
      findings.push(...paramFindings(method, operation));
    }

    for (const operation of input.operations) {
      if (matchedOperations.has(operation.operationId)) continue;
      findings.push({
        level: "gap",
        code: "missing-method",
        operationId: operation.operationId,
        detail: `${operation.method.toUpperCase()} ${operation.path} (${operation.operationId}) has no SDK method`,
      });
    }

    for (const method of input.methods) {
      if (matchedMethods.has(method.name)) continue;
      findings.push({
        level: "note",
        code: "orphan-method",
        method: method.name,
        detail: `${method.name} has no OpenAPI operation`,
      });
    }
  }

  return findings.sort(bySeverity);
}
