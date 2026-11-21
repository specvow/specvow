import { statSync } from "node:fs";
import path from "node:path";
import {
  Node,
  Project,
  ScriptTarget,
  type ClassDeclaration,
  type MethodDeclaration,
  type ParameterDeclaration,
  type PropertyDeclaration,
  type PropertySignature,
} from "ts-morph";
import type { SdkField, SdkMethod, SdkParam } from "../core/types.js";

function operationTag(method: MethodDeclaration): string | undefined {
  for (const doc of method.getJsDocs()) {
    for (const tag of doc.getTags()) {
      if (tag.getTagName() !== "operation") continue;
      const text = tag.getCommentText()?.trim();
      if (text) return text;
    }
  }
  return undefined;
}

function isProperty(node: Node): node is PropertySignature | PropertyDeclaration {
  return Node.isPropertySignature(node) || Node.isPropertyDeclaration(node);
}

function fieldsOf(parameter: ParameterDeclaration): SdkField[] {
  let type = parameter.getType();
  if (type.isNullable()) type = type.getNonNullableType();
  if (type.isString() || type.isNumber() || type.isBoolean() || type.isEnum() || type.isLiteral()) return [];

  const fields: SdkField[] = [];
  for (const property of type.getProperties()) {
    const declaration = property.getDeclarations().find(isProperty);
    if (!declaration) continue;
    fields.push({
      name: property.getName(),
      optional: declaration.hasQuestionToken(),
    });
  }
  return fields;
}

function toParam(parameter: ParameterDeclaration): SdkParam {
  return {
    name: parameter.getName(),
    optional: parameter.isOptional(),
    fields: fieldsOf(parameter),
  };
}

function classFromType(type: ReturnType<PropertyDeclaration["getType"]>): ClassDeclaration | undefined {
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  if (!symbol) return undefined;
  return symbol.getDeclarations().find((declaration): declaration is ClassDeclaration => Node.isClassDeclaration(declaration));
}

const ROOT_NOISE = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
  "request",
  "buildURL",
  "buildRequest",
  "fetchWithTimeout",
  "withOptions",
]);

function walk(cls: ClassDeclaration, prefix: string, depth: number, seen: Set<ClassDeclaration>, out: SdkMethod[]): void {
  if (seen.has(cls) || depth > 4) return;
  seen.add(cls);

  for (const method of cls.getMethods()) {
    if (method.isStatic()) continue;
    const scope = method.getScope();
    if (scope === "private" || scope === "protected") continue;
    const methodName = method.getName();
    if (methodName.startsWith("#") || methodName.startsWith("_")) continue;
    if (!prefix && ROOT_NOISE.has(methodName)) continue;
    const name = prefix ? `${prefix}.${methodName}` : methodName;
    out.push({
      name,
      params: method.getParameters().map(toParam),
      operationId: operationTag(method),
    });
  }

  for (const property of cls.getProperties()) {
    const scope = property.getScope();
    if (scope === "private" || scope === "protected") continue;
    const declaration = classFromType(property.getType());
    if (!declaration) continue;
    const next = prefix ? `${prefix}.${property.getName()}` : property.getName();
    walk(declaration, next, depth + 1, seen, out);
  }
}

export function extractTypeScriptSurface(sdkPath: string, clientName: string): SdkMethod[] {
  const project = new Project({
    compilerOptions: {
      strict: true,
      target: ScriptTarget.ES2022,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  const stats = statSync(sdkPath);
  if (stats.isDirectory()) {
    const include = path.join(sdkPath, "**/*.ts").replaceAll("\\", "/");
    const exclude = `!${path.join(sdkPath, "**/node_modules/**").replaceAll("\\", "/")}`;
    project.addSourceFilesAtPaths([include, exclude]);
  } else {
    project.addSourceFileAtPath(sdkPath);
  }

  const client = project
    .getSourceFiles()
    .flatMap((source) => source.getClasses())
    .find((cls) => cls.getName() === clientName);
  if (!client) {
    throw new Error(`Could not find class ${clientName} in ${sdkPath}`);
  }

  const methods: SdkMethod[] = [];
  walk(client, "", 0, new Set(), methods);
  if (methods.length === 0) {
    throw new Error(`Class ${clientName} has no public methods`);
  }
  return methods;
}
