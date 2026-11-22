import { describe, expect, it } from "vitest";
import { classify } from "../src/core/classify.js";
import { buildLock } from "../src/core/lock.js";
import { matchSurface } from "../src/core/match.js";
import { operationsFromDocument } from "../src/core/openapi.js";
import { methodMapFromStainless } from "../src/core/stainless.js";
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

  it("keeps the Stainless parameter name", () => {
    const operations = operationsFromDocument({
      paths: {
        "/user/{username}": {
          put: {
            operationId: "updateUser",
            parameters: [
              { name: "username", in: "path", required: true, "x-stainless-param": "existingUsername" },
            ],
          },
        },
      },
    });
    expect(operations[0]?.params).toEqual([
      { name: "username", location: "path", sdkName: "existingUsername" },
    ]);
  });

  it("leaves an API key header off the method when a security scheme already names it", () => {
    const operations = operationsFromDocument({
      components: {
        securitySchemes: {
          "X-API-Key": { type: "apiKey", in: "header", name: "X-API-Key" },
          Bearer: { type: "http", scheme: "bearer" },
        },
      },
      paths: {
        "/user": {
          post: {
            operationId: "createUser",
            parameters: [
              { name: "X-API-Key", in: "header", required: true },
              { name: "Authorization", in: "header", required: true },
              { name: "X-Request-Id", in: "header", required: true },
            ],
          },
        },
      },
    });
    expect(operations[0]?.params.map((param) => param.name)).toEqual(["X-Request-Id"]);
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

  it("treats petID as the petId path parameter", () => {
    const operation: SpecOperation = {
      operationId: "deletePet",
      method: "delete",
      path: "/pet/{petId}",
      params: [{ name: "petId", location: "path" }],
    };
    const sdk = method("pets.delete", [{ name: "petID", optional: false, fields: [] }]);
    const findings = classify({
      operations: [operation],
      methods: [sdk],
      matches: [{ method: sdk.name, operationId: operation.operationId, via: "map" }],
      lock: null,
    });
    expect(findings.filter((finding) => finding.level === "breaking")).toEqual([]);
  });

  it("accepts a renamed path argument when it is the only spare parameter", () => {
    const operation: SpecOperation = {
      operationId: "updateUser",
      method: "put",
      path: "/user/{username}",
      params: [{ name: "username", location: "path" }],
    };
    const sdk = method("users.update", [
      { name: "existingUsername", optional: false, fields: [] },
      { name: "body", optional: true, fields: [{ name: "email", optional: true }] },
    ]);
    const findings = classify({
      operations: [operation],
      methods: [sdk],
      matches: [{ method: sdk.name, operationId: operation.operationId, via: "map" }],
      lock: null,
    });
    expect(findings.filter((finding) => finding.level === "breaking")).toEqual([]);
  });

  it("accepts a path parameter that Stainless nests in the params object", () => {
    const operation: SpecOperation = {
      operationId: "deleteApiKey",
      method: "delete",
      path: "/projects/{id}/api-key/{apiKeyId}",
      params: [
        { name: "id", location: "path" },
        { name: "apiKeyId", location: "path" },
      ],
    };
    const sdk = method("beta.projects.apiKey.delete", [
      { name: "apiKeyID", optional: false, fields: [] },
      { name: "params", optional: false, fields: [{ name: "id", optional: false }] },
      { name: "options", optional: true, fields: [] },
    ]);
    const findings = classify({
      operations: [operation],
      methods: [sdk],
      matches: [{ method: sdk.name, operationId: operation.operationId, via: "map" }],
      lock: null,
    });
    expect(findings.filter((finding) => finding.level === "breaking")).toEqual([]);
  });
});

describe("stainless.yml", () => {
  it("maps resource methods by endpoint, including nested resources and id casing", () => {
    const operations: SpecOperation[] = [
      { operationId: "addPet", method: "post", path: "/pet", params: [] },
      { operationId: "findPetsByStatus", method: "get", path: "/pet/findByStatus", params: [] },
      { operationId: "updatePetWithForm", method: "post", path: "/pet/{petId}", params: [] },
      { operationId: "placeOrder", method: "post", path: "/store/order", params: [] },
    ];
    const { map, errors } = methodMapFromStainless(
      {
        resources: {
          pets: {
            methods: {
              create: "post /pet",
              find_by_status: "get /pet/findByStatus",
              update_by_id: "post /pet/{petId}",
            },
          },
          store: {
            subresources: {
              orders: { methods: { create: "post /store/order" } },
            },
          },
        },
      },
      operations,
    );
    expect(errors).toEqual([]);
    expect(map).toEqual({
      "pets.create": "addPet",
      "pets.findByStatus": "findPetsByStatus",
      "pets.updateByID": "updatePetWithForm",
      "store.orders.create": "placeOrder",
    });
  });
});
