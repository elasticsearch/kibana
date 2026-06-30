---
navigation_title: "ES|QL"
description: "Learn how to use the `esql` method to query Saved Objects using ES|QL."
---

# Saved Object `esql` method

`SavedObjectsClientContract.esql` allows you to query Saved Objects using [ES|QL (Elasticsearch Query Language)](https://www.elastic.co/docs/explore-analyze/query-filter/languages/esql). It returns tabular results (columns and values) directly from Elasticsearch, which can be useful for analytics, aggregations, and cross-type queries that don't fit the `find` or `search` methods.

## Relationship to `find` and `search`

| Method | Use case | Response format |
|--------|----------|----------------|
| `find` | Simple filtering and pagination of saved objects | Structured `SavedObject[]` |
| `search` | Complex queries using Elasticsearch Query DSL | Raw Elasticsearch search hits |
| `esql` | Tabular queries using ES|QL syntax | Tabular columns + values |

Use `esql` when you need ES|QL-specific features like `STATS`, `EVAL`, `ENRICH`, or pipe-based query composition.

:::{note} With great power comes great responsibility
While the `esql` method is powerful, it can increase code complexity, introduce performance issues and introduce security risks (like injection attacks). Carefully consider how you would like to use this method in your plugin to unlock value for users.
:::

## The `pipeline` concept

Like `search` and `find`, you specify saved object **types** as a dedicated parameter — you never need to know or write index names. The `esql` method resolves the correct Elasticsearch indices from the `type` parameter and auto-generates the `FROM` clause. Security filters (namespace + type restriction) are injected via the `filter` parameter, so you don't need `WHERE type ==` either.

You write only the ES|QL **processing pipeline** — everything after `FROM`:

```ts
import { isResponseError } from '@kbn/es-errors';
import { MY_TYPE } from './saved_objects';

/** ...inside a route handler: */
async (ctx, req, res) => {
  const core = await ctx.core;
  const savedObjectsClient = core.savedObjects.client;
  try {
    const result = await savedObjectsClient.esql({
      type: [MY_TYPE],
      namespaces: ['default'],
      pipeline: `| KEEP ${MY_TYPE}.title, ${MY_TYPE}.description
        | SORT ${MY_TYPE}.title
        | LIMIT 100`,
    });
    return res.ok({ body: { columns: result.columns, values: result.values } });
  } catch (e) {
    if (isResponseError(e)) {
      log.error(JSON.stringify(e.meta.body, null, 2));
    }
    throw e;
  }
}
```

To include METADATA fields on the auto-generated FROM clause, use the `metadata` option:

```ts
const result = await savedObjectsClient.esql({
  type: [MY_TYPE],
  namespaces: ['default'],
  metadata: ['_id', '_source'],
  // generates: FROM .kibana METADATA _id, _source | WHERE ...
  pipeline: '| WHERE my_type.title LIKE "test*" | LIMIT 100',
});
```

See the full example in the Kibana repository at `examples/saved_objects`.

### Building pipelines with `@elastic/esql`

The [`@elastic/esql`](https://www.npmjs.com/package/@elastic/esql) package provides an `esql` tagged template that makes pipeline construction safer and more ergonomic:

- `esql.col()` produces a correctly-quoted ES|QL identifier — field names containing dots (e.g. `my_type.title`) are automatically backtick-quoted as required by ES|QL syntax.
- Template holes using `${{ name: value }}` become named ES|QL parameters, keeping user input out of the query string (see [Safe pipeline construction](#safe-pipeline-construction-with-esql-params)).

```ts
import { esql } from '@elastic/esql';
import { isResponseError } from '@kbn/es-errors';
import { MY_TYPE } from './saved_objects';

const titleCol = esql.col(`${MY_TYPE}.title`);
const descCol = esql.col(`${MY_TYPE}.description`);

try {
  const result = await savedObjectsClient.esql({
    type: [MY_TYPE],
    namespaces: ['default'],
    pipeline: esql`
      KEEP ${titleCol}, ${descCol}
      | SORT ${titleCol}
      | LIMIT 100
    `,
  });
} catch (e) {
  if (isResponseError(e)) {
    log.error(JSON.stringify(e.meta.body, null, 2));
  }
  throw e;
}
```

To include `METADATA` fields with the tagged template:

```ts
const result = await savedObjectsClient.esql({
  type: [MY_TYPE],
  namespaces: ['default'],
  metadata: ['_id', '_source'],
  pipeline: esql`KEEP _id, ${esql.col(`${MY_TYPE}.title`)} | LIMIT 100`,
});
```

## Safe pipeline construction with ES|QL params

When interpolating user input into ES|QL pipelines, **never** use string concatenation. Instead, use ES|QL's native parameterization — named params (`?paramName`) or positional params (`?`) — to separate code from data at the protocol level.

### Named params `?paramName` (recommended for user input)

Use `?paramName` placeholders in the pipeline string and pass the values via the `params` array as `{ name: value }` entries. This is true parameterization — the values are never interpolated into the query string, preventing injection attacks.

```ts
import type { estypes } from '@elastic/elasticsearch';

const userInput = req.body.searchTerm;

const result = await savedObjectsClient.esql({
  type: ['my_type'],
  namespaces: ['default'],
  pipeline: '| WHERE my_type.title LIKE ?searchTerm | LIMIT 100',
  // Named params are supported by ES at runtime, but the ES client TypeScript types
  // only define positional params — cast through unknown to bridge the type gap.
  params: [{ searchTerm: userInput }] as unknown as estypes.EsqlESQLParam[],
});
```

The pipeline sent to Elasticsearch will be `| WHERE my_type.title LIKE ?searchTerm | LIMIT 100` — with `searchTerm` as a separate parameter, never interpolated into the pipeline string.

### Positional params `?` (alternative)

ES|QL also supports positional `?` placeholders. Params are plain values (string, number, boolean, or null) matched by position:

```ts
const result = await savedObjectsClient.esql({
  type: ['my_type'],
  namespaces: ['default'],
  pipeline: '| WHERE my_type.title LIKE ? | LIMIT 100',
  params: [userInput],
});
```

### Tagged template params (via `@elastic/esql`)

If you are using the `esql` tagged template from `@elastic/esql`, use `${{ name: value }}` holes for user-supplied values. The value becomes a named ES|QL parameter forwarded to Elasticsearch separately — it never appears in the query string:

```ts
import { esql } from '@elastic/esql';

const searchTerm = req.body.title;
const titleCol = esql.col(`${MY_TYPE}.title`);

const result = await savedObjectsClient.esql({
  type: [MY_TYPE],
  namespaces: ['default'],
  pipeline: esql`
    WHERE ${titleCol} LIKE ${{ title: searchTerm }}
    | LIMIT 100
  `,
});
```

:::{warning}
**Never pass user input via `esql.exp(userInput)`** — that injects a raw ES|QL expression and bypasses parameterization entirely.
:::

## Security model

### Execution context — `kibana_system` user

The ES|QL pipeline executes with the privileges of the `kibana_system` Elasticsearch user, which has elevated access including `manage_enrich` and broad index monitoring permissions. This means the pipeline can access resources that the end user may not be authorized to see.

**Never inject arbitrary or untrusted user input directly into the pipeline string.** If a user can control the full pipeline, they could use commands like `ENRICH` to join against enrich policies whose source data they would not normally have access to — this is a privilege escalation. Always construct the pipeline server-side and use parameterized values (see [Safe pipeline construction](#safe-pipeline-construction-with-esql-params)) for any user-provided input.

Using `ENRICH` in your pipeline is perfectly fine when you control the pipeline and are enriching from a policy whose data is appropriate for all users who will see the results.

### Index resolution from types

Like `search` (which passes `index: getIndicesForTypes(types)` internally), the `esql` method resolves the correct Elasticsearch indices from the `type` parameter and auto-generates the `FROM` clause. You never need to know the index name — it is an implementation detail handled by the saved objects system.

### Space and type filtering

When you call `esql()`, namespace (space) and type filters are automatically injected into the `filter` parameter of the ES|QL request. The filter restricts results to the specified types and namespaces, so you don't need `WHERE type == "..."` in your pipeline. This works the same way as the `search` method:

1. `spacesExtension.getSearchableNamespaces()` resolves which namespaces the user can access
2. `securityExtension.authorizeFind()` checks RBAC permissions
3. A namespace bool filter (including type restriction) is constructed and merged with any user-provided `filter`

If the user is not authorized to access any of the requested namespaces or types, an empty response is returned.

### User-provided filters are merged, not replaced

If you provide a `filter` in the options, it is merged with the security filter using `{ bool: { must: [securityFilter, yourFilter] } }`. Your filter is never used in isolation.

## Encrypted attributes

Encrypted saved object attributes are handled differently depending on whether `_source` is present in the response:

- **With `_source` (via `metadata: ['_id', '_source']`):** The full document in `_source` contains all attributes needed for AAD (Additional Authenticated Data) reconstruction. Encrypted attributes are by default stripped from `_source`, or are **decrypted** in `_source`, using the same path as `find` and `search`, if registered with the `dangerouslyExposeValue` option. If decryption fails (e.g., key rotation), all encrypted attributes are stripped from `_source`.
- **Standalone scalar columns (e.g., `connector.secrets`):** Always replaced with `null`, regardless of `_source` decryption. These columns contain raw ciphertext that cannot be used outside the document context.

For example, if a `connector` type has an encrypted `secrets` attribute:
- `connector.secrets` column → always `null`
- `_source` column → contains the full document with `secrets` decrypted (or stripped on failure)

## Response structure

The `esql` method returns the raw ES|QL response with `columns` and `values`:

```json
{
  "columns": [
    { "name": "index-pattern.title", "type": "keyword" },
    { "name": "type", "type": "keyword" }
  ],
  "values": [
    ["logs-*", "index-pattern"],
    ["metrics-*", "index-pattern"]
  ]
}
```

## When to use

- You need ES|QL-specific operations like `STATS`, `EVAL`, `ENRICH`, `DISSECT`, or `GROK`
- You want tabular results for analytics or reporting
- You need to compute aggregations across saved object types

## When not to use

- You want structured `SavedObject` instances with `id`, `attributes`, `references` - use `find` instead
- You need Elasticsearch Query DSL features like runtime mappings or aggregation trees - use `search` instead
- Simple filtering and pagination - use `find` instead
- You need ES|QL source commands like `ROW`, `SHOW`, or `METRICS` - use the raw Elasticsearch client directly