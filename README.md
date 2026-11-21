# SpecVow

The spec makes a promise. The SDK has to keep it.

SpecVow checks a published TypeScript SDK against an OpenAPI document. When a pull request changes the spec, it fails if an existing method would break. It does not generate a new SDK.

## What it flags

Breaking changes, exit code 2:

- A locked method disappeared from the SDK.
- A locked method points at an operation that disappeared from the spec.
- The spec now requires a path or query parameter the method does not require.
- The spec now requires a request body, or a top-level body field, that the method does not require.

It also reports gaps (an operation with no SDK method) and notes (an SDK method with no operation). Gaps do not fail the command.

## What it does not flag

Nested object fields, `allOf` schemas, and whole-model equality. Python and other languages are not read yet. Query and body fields are checked one level deep: `create(body: { currency?: string })` is visible, `create(body: { address: { city?: string } })` is not.

## Run the example

```bash
npm install
npm run example
```

`examples/billing` is a small client. `billing.invoices.create` lines up with `createInvoice`. The lockfile is `examples/billing/surface.lock.json`.

Check another SDK from a directory that has `specvow.config.yaml`:

```yaml
spec: ./openapi.yaml
sdk: ./sdk/index.ts
client: Client
lock: ./surface.lock.json
```

```bash
npx tsx src/cli/cli.ts lock --config specvow.config.yaml
npx tsx src/cli/cli.ts check --config specvow.config.yaml
```

Without a config file:

```bash
npx tsx src/cli/cli.ts check --spec openapi.yaml --sdk sdk/index.ts --client Client
```

`--format` accepts `text`, `markdown`, or `json`.

## Names

By default the leaf resource and the verb become the operation id. `billing.invoices.create` matches `createInvoice`. A method can force a match with a JSDoc tag:

```ts
/** @operation createInvoice */
add(body: CreateInvoice): Promise<Invoice>
```

Or set `map` in the config when the names do not line up:

```yaml
map:
  billing.invoices.add: createInvoice
```

Commit the lockfile. In CI, run `check`. Run `lock` only when the SDK change is intentional. A missing locked method is a breaking change.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No breaking changes |
| 1 | The command could not run |
| 2 | Breaking changes |
