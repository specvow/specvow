import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchSurface } from "../src/core/match.js";
import { loadSpec } from "../src/core/load-spec.js";
import { execute, type Io } from "../src/cli/run.js";
import { extractTypeScriptSurface } from "../src/cli/extract-ts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function io(): Io & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (message) => lines.push(message),
    error: (message) => lines.push(message),
  };
}

describe("TypeScript surface", () => {
  it("reads nested client methods and one level of body fields", () => {
    const methods = extractTypeScriptSurface(path.join(root, "examples/billing/sdk/index.ts"), "Client");
    const create = methods.find((method) => method.name === "billing.invoices.create");
    expect(create?.params[0]).toMatchObject({
      name: "body",
      optional: false,
      fields: [
        { name: "amount", optional: false },
        { name: "currency", optional: true },
      ],
    });
    expect(methods.map((method) => method.name).sort()).toEqual([
      "billing.invoices.create",
      "billing.invoices.get",
      "billing.invoices.list",
    ]);
  });

  it("ignores transport helpers on the root client", () => {
    const methods = extractTypeScriptSurface(path.join(root, "test/fixtures/transport/sdk.ts"), "Client");
    expect(methods.map((method) => method.name)).toEqual(["pets.create"]);
  });

  it("honors an @operation tag", async () => {
    const methods = extractTypeScriptSurface(path.join(root, "test/fixtures/tagged/sdk.ts"), "Client");
    const operations = await loadSpec(path.join(root, "examples/billing/openapi.yaml"));
    const { matches, errors } = matchSurface(operations, methods, {});
    expect(errors).toEqual([]);
    expect(matches[0]).toMatchObject({ method: "invoices.add", operationId: "createInvoice", via: "tag" });
  });
});

describe("specvow check", () => {
  it("accepts the billing example", async () => {
    const output = io();
    const code = await execute(["check", "--config", "examples/billing/specvow.config.yaml"], root, output);
    expect(code).toBe(0);
    expect(output.lines.join("\n")).toContain("No breaking changes");
  });

  it("fails when the spec requires a body field the SDK marks optional", async () => {
    const output = io();
    const code = await execute(
      [
        "check",
        "--spec",
        "test/fixtures/breaking/openapi.yaml",
        "--sdk",
        "examples/billing/sdk/index.ts",
        "--client",
        "Client",
      ],
      root,
      output,
    );
    expect(code).toBe(2);
    expect(output.lines.join("\n")).toContain("billing.invoices.create now requires `currency`");
  });
});
