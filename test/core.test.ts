import { describe, expect, it } from "vitest";
import { classify } from "../src/core/classify.js";
import { buildLock } from "../src/core/lock.js";
import { matchSurface } from "../src/core/match.js";
import { operationsFromDocument } from "../src/core/openapi.js";
import type { SdkMethod, SpecOperation } from "../src/core/types.js";

const billingDoc = {
  paths: {
    "/invoices": {
      get: {
        operationId: "listInvoices",
        parameters: [{ name: "status", in: "query", required: false, schema: { type: "string" } }],
      },
      post: {
        operationId: "createInvoice",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amount"],
                properties: { amount: { type: "number" }, currency: { type: "string" } },
              },
            },
          },
        },
      },
    },
    "/invoices/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { operationId: "getInvoice" },
    },
  },
};

function method(name: string, params: SdkMethod["params"], operationId?: string): SdkMethod {
  return { name, params, operationId };
}

const billingMethods: SdkMethod[] = [
  method("billing.invoices.create", [
    {
      name: "body",
      optional: false,
      fields: [
        { name: "amount", optional: false },
        { name: "currency", optional: true },
      ],
    },
  ]),
  method("billing.invoices.list", [
    {
      name: "query",
      optional: true,
      fields: [{ name: "status", optional: true }],
    },
  ]),
  method("billing.invoices.get", [{ name: "id", optional: false, fields: [] }]),
];

describe("operationsFromDocument", () => {
  it("keeps required path params and required body fields", () => {
    const operations = operationsFromDocument(billingDoc);
    const create = operations.find((operation) => operation.operationId === "createInvoice");
    const get = operations.find((operation) => operation.operationId === "getInvoice");
    const list = operations.find((operation) => operation.operationId === "listInvoices");
    expect(create?.params.map((param) => param.name)).toEqual(["body", "amount"]);
    expect(get?.params.map((param) => `${param.location}:${param.name}`)).toEqual(["path:id"]);
    expect(list?.params).toEqual([]);
  });
});

describe("matchSurface", () => {
  it("maps a nested method to the leaf operation id", () => {
    const operations = operationsFromDocument(billingDoc);
    const { matches, errors } = matchSurface(operations, billingMethods, {});
    expect(errors).toEqual([]);
    expect(matches.map((match) => [match.method, match.operationId, match.via])).toEqual([
      ["billing.invoices.create", "createInvoice", "auto"],
      ["billing.invoices.list", "listInvoices", "auto"],
      ["billing.invoices.get", "getInvoice", "auto"],
    ]);
  });

  it("uses a JSDoc operation id when the verb does not match", () => {
    const operations = operationsFromDocument(billingDoc);
    const tagged = method("invoices.add", [{ name: "body", optional: false, fields: [] }], "createInvoice");
    const { matches, errors } = matchSurface(operations, [tagged], {});
    expect(errors).toEqual([]);
    expect(matches).toEqual([{ method: "invoices.add", operationId: "createInvoice", via: "tag" }]);
  });

  it("asks for a map when two operation ids are equally plausible", () => {
    const operations: SpecOperation[] = [
      { operationId: "createInvoice", method: "post", path: "/invoices", params: [] },
      { operationId: "createInvoices", method: "post", path: "/invoices/bulk", params: [] },
    ];
    const { errors } = matchSurface(operations, [method("invoices.create", [])], {});
    expect(errors[0]).toContain("invoices.create matches createInvoice, createInvoices");
  });
});

describe("classify", () => {
  const operations = operationsFromDocument(billingDoc);

  it("passes a method whose required body field is present", () => {
    const { matches } = matchSurface(operations, billingMethods, {});
    const findings = classify({ operations, methods: billingMethods, matches, lock: null });
    expect(findings.filter((finding) => finding.level === "breaking")).toEqual([]);
  });

  it("flags a body field the spec made required", () => {
    const changed = structuredClone(operations);
    const create = changed.find((operation) => operation.operationId === "createInvoice");
    create?.params.push({ name: "currency", location: "field" });
    const { matches } = matchSurface(changed, billingMethods, {});
    const findings = classify({ operations: changed, methods: billingMethods, matches, lock: null });
    expect(findings.map((finding) => finding.detail)).toContain("billing.invoices.create now requires `currency`");
  });

  it("flags a locked method that the SDK no longer has", () => {
    const { matches } = matchSurface(operations, billingMethods, {});
    const lock = buildLock("Client", matches, operations, billingMethods);
    const remaining = billingMethods.filter((item) => item.name !== "billing.invoices.get");
    const findings = classify({ operations, methods: remaining, matches: [], lock });
    expect(findings.map((finding) => finding.code)).toContain("removed-method");
  });
});
