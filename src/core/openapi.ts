import type { SpecOperation, SpecParam } from "./types.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type SchemaObject = {
  required?: string[];
  properties?: Record<string, unknown>;
};

type ParameterObject = {
  name?: string;
  in?: string;
  required?: boolean;
  "x-stainless-param"?: string;
};

type RequestBodyObject = {
  required?: boolean;
  content?: Record<string, { schema?: SchemaObject }>;
};

type OperationObject = {
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
};

type PathItem = Partial<Record<HttpMethod, OperationObject>> & {
  parameters?: ParameterObject[];
};

type OpenApiDocument = {
  paths?: Record<string, PathItem | undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asDocument(value: unknown): OpenApiDocument {
  if (!isRecord(value) || !isRecord(value.paths)) {
    throw new Error("OpenAPI document has no paths object");
  }
  return value as OpenApiDocument;
}

function authHeaderNames(document: unknown): Set<string> {
  const names = new Set<string>();
  if (!isRecord(document) || !isRecord(document.components) || !isRecord(document.components.securitySchemes)) {
    return names;
  }
  for (const scheme of Object.values(document.components.securitySchemes)) {
    if (!isRecord(scheme)) continue;
    if (scheme.type === "apiKey" && scheme.in === "header" && typeof scheme.name === "string") {
      names.add(scheme.name.toLowerCase());
    }
    if (scheme.type === "http" && (scheme.scheme === "bearer" || scheme.scheme === "basic")) {
      names.add("authorization");
    }
  }
  return names;
}

function requiredParams(parameters: ParameterObject[] | undefined, authHeaders: Set<string>): SpecParam[] {
  const params: SpecParam[] = [];
  for (const parameter of parameters ?? []) {
    if (!parameter.name || !parameter.in) continue;
    const location = parameter.in;
    if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") {
      continue;
    }
    if (location === "header" && authHeaders.has(parameter.name.toLowerCase())) continue;
    if (location === "path" || parameter.required === true) {
      params.push({
        name: parameter.name,
        location,
        sdkName: typeof parameter["x-stainless-param"] === "string" ? parameter["x-stainless-param"] : undefined,
      });
    }
  }
  return params;
}

function bodyParams(body: RequestBodyObject | undefined): SpecParam[] {
  if (!body?.required) return [];
  const params: SpecParam[] = [{ name: "body", location: "body" }];
  const content = body.content ?? {};
  const media = content["application/json"] ?? Object.values(content)[0];
  for (const name of media?.schema?.required ?? []) {
    params.push({ name, location: "field" });
  }
  return params;
}

function mergeParams(base: SpecParam[], extra: SpecParam[]): SpecParam[] {
  const merged = new Map<string, SpecParam>();
  for (const param of base) merged.set(`${param.location}:${param.name}`, param);
  for (const param of extra) merged.set(`${param.location}:${param.name}`, param);
  return [...merged.values()];
}

export function operationsFromDocument(document: unknown): SpecOperation[] {
  const doc = asDocument(document);
  const authHeaders = authHeaderNames(document);
  const operations: SpecOperation[] = [];
  const seen = new Set<string>();

  for (const [route, item] of Object.entries(doc.paths ?? {})) {
    if (!item) continue;
    const pathParams = requiredParams(item.parameters, authHeaders);
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const operationId = operation.operationId ?? `${method} ${route}`;
      if (seen.has(operationId)) {
        throw new Error(`Duplicate operation id "${operationId}"`);
      }
      seen.add(operationId);
      operations.push({
        operationId,
        method,
        path: route,
        params: mergeParams(pathParams, [
          ...requiredParams(operation.parameters, authHeaders),
          ...bodyParams(operation.requestBody),
        ]),
      });
    }
  }

  return operations;
}
