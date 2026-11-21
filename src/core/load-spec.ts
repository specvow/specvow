import SwaggerParser from "@apidevtools/swagger-parser";
import { operationsFromDocument } from "./openapi.js";
import type { SpecOperation } from "./types.js";

export async function loadSpec(file: string): Promise<SpecOperation[]> {
  const document: unknown = await SwaggerParser.dereference(file);
  return operationsFromDocument(document);
}
