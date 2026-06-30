---
navigation_title: "Saved Object `search` method"
description: "Learn how to use the `search` method to search for Saved Objects."
---

# Saved Object `search` method

`SavedObjectsClientContract.search` is a powerful way to search for Saved Objects. It allows you to search Saved Objects using the [Elasticsearch query DSL](https://www.elastic.co/docs/explore-analyze/query-filter/languages/querydsl), [runtime fields](https://www.elastic.co/docs/manage-data/data-store/mapping/define-runtime-fields-in-search-request) and more.

It is an alternative to the safer but more limited `SavedObjectsClientContract.find` method. If you plan to use aggregations, be sure to review the [Aggregations to avoid](#aggregations-to-avoid) section.

:::{note} With great power comes great responsibility
While the `search` method is powerful, it can increase code complexity, introduce performance issues and introduce security risks (like injection attacks). Take care to ensure it is implemented correctly for your use case and appropriately stress tested. Carefully consider how you would like to use this method in your plugin to unlock value for users.
:::

## See it in code

This example demonstrates a request to search across multiple types of Saved Objects and sort by fields that are the same type, but named differently:

```ts
import { isResponseError } from '@kbn/es-errors';
import { TYPE_A, TYPE_B } from './saved_objects';
  /** ...some lines down we have a route handler like this: */
  async (ctx, req, res) => {
    log.info('Searching for saved objects');
    const core = await ctx.core;
    const savedObjectsClient = core.savedObjects.client;
    try {
      const result /* returns raw hits from Elasticsearch */ = await savedObjectsClient.search({
        type: [TYPE_A, TYPE_B],
        namespaces: ['default'],
        query: {
          bool: {
            must: [
              {
                match_all: {},
              },
            ],
          },
        },
        // The below runtime mappings would not be possible with the `find` method
        runtime_mappings: {
          merged_date: {
            type: 'date',
            script: {
              // Note 1: the query is in Painless, but written against the "raw" Saved object document,
              //         you are responsible for ensuring that the fields are scoped to the correct type
              // Note 2: Painless is powerful, but is executed at runtime, so be mindful of performance and handling
              //         edge cases in your data like when null values may be present.
              source: `
                if (doc.containsKey(params.typeA + '.myDateField') && !doc[params.typeA + '.myDateField'].empty) {
                  emit(doc[params.typeA + '.myDateField'].value.toInstant().toEpochMilli());
                } else if (doc.containsKey(params.typeB + '.myOtherDateField') && !doc[params.typeB + '.myOtherDateField'].empty) {
                  emit(doc[params.typeB + '.myOtherDateField'].value.toInstant().toEpochMilli());
                }
              `,
              // Note 3: Using `params` is best practice to avoid injection attacks.
              params: {
                typeA: TYPE_A,
                typeB: TYPE_B,
              },
            },
          },
        },
        sort: [
          {
            merged_date: {
              order: 'desc',
              unmapped_type: 'date', // In case one type doesn't have the date field
            },
          },
        ],
      });
      return res.ok({
        body: {
          result,
        },
      });
    } catch (e) {
      if (isResponseError(e)) {
        log.error(JSON.stringify(e.meta.body, null, 2)); // good error logging is essential for debugging...
      }
      throw e;
    }
  }
```

See the full example in the Kibana repository at `examples/saved_objects`.

## Understanding the generated Elasticsearch query

When you call the `search` method, an Elasticsearch query is constructed that includes your provided query merged with namespace and type filtering.

### Basic query generation

For a simple search like this:

```ts
const result = await savedObjectsClient.search({
  type: ['index-pattern'],
  namespaces: ['my-namespace'],
  query: {
    bool: {
      filter: [{ term: { 'index-pattern.title': 'logs' } }],
    },
  },
});
```

The following Elasticsearch query is created that wraps your query with namespace filtering:

```json
{
  "bool": {
    "must": [
      {
        "bool": {
          "minimum_should_match": 1,
          "should": [
            {
              "bool": {
                "minimum_should_match": 1,
                "must": [{ "term": { "type": "index-pattern" } }],
                "must_not": [{ "exists": { "field": "namespaces" } }],
                "should": [{ "terms": { "namespace": ["my-namespace"] } }]
              }
            }
          ]
        }
      },
      {
        "bool": {
          "filter": [{ "term": { "index-pattern.title": "logs" } }]
        }
      }
    ]
  }
}
```

### Partially authorized namespace queries

When a user has partial authorization (access to some but not all requested namespaces or types), a query is created that restricts each type to only the namespaces the user is authorized to access.

For example, if a user searches for:
- Type: `index-pattern`
- Namespaces: `['foo-namespace', 'bar-namespace']`

But they are only authorized to access `foo-namespace`:

```ts
const result = await savedObjectsClient.search({
  type: ['index-pattern'],
  namespaces: ['foo-namespace', 'bar-namespace'],
  query: { match_all: {} },
});
```

The generated query will only include `foo-namespace`, excluding `bar-namespace`:

```json
{
  "bool": {
    "must": [
      {
        "bool": {
          "minimum_should_match": 1,
          "should": [
            {
              "bool": {
                "minimum_should_match": 1,
                "must": [{ "term": { "type": "index-pattern" } }],
                "must_not": [{ "exists": { "field": "namespaces" } }],
                "should": [{ "terms": { "namespace": ["foo-namespace"] } }]
              }
            }
          ]
        }
      }
    ]
  }
}
```

## Response structure

The `search` method returns raw Elasticsearch search results. Before returning results, migrations are ran on saved object attributes to ensure they are up to date with the current schema version.

### Example response

```json
{
  "took": 5,
  "timed_out": false,
  "_shards": {
    "total": 1,
    "successful": 1,
    "skipped": 0,
    "failed": 0
  },
  "hits": {
    "total": {
      "value": 2,
      "relation": "eq"
    },
    "max_score": 1.0,
    "hits": [
      {
        "_index": ".kibana_8.0.0",
        "_id": "index-pattern:logs",
        "_score": 1.0,
        "_source": {
          "type": "index-pattern",
          "namespace": "default",
          "updated_at": "2024-01-15T10:30:00.000Z",
          "created_at": "2024-01-10T08:00:00.000Z",
          "index-pattern": {
            "title": "logs",
            "timeFieldName": "@timestamp",
            "fields": "[]"
          },
          "references": [],
          "managed": false,
          "coreMigrationVersion": "8.8.0",
          "typeMigrationVersion": "8.0.0"
        }
      },
      {
        "_index": ".kibana_8.0.0",
        "_id": "dashboard:my-dashboard-id",
        "_score": 1.0,
        "_source": {
          "type": "dashboard",
          "namespace": "default",
          "updated_at": "2024-01-20T14:00:00.000Z",
          "created_at": "2024-01-18T09:00:00.000Z",
          "dashboard": {
            "title": "My Dashboard",
            "description": "A sample dashboard",
            "panelsJSON": "[]",
            "optionsJSON": "{}"
          },
          "references": [
            { "id": "logs", "name": "indexpattern-datasource", "type": "index-pattern" }
          ],
          "managed": false,
          "coreMigrationVersion": "8.8.0",
          "typeMigrationVersion": "8.0.0"
        }
      }
    ]
  }
}
```

### When to use the `search` method

- You are trying to search across multiple types of Saved Objects
- You are trying to aggregate over multiple types of Saved Objects

### When not to use the `search` method

- You just want a simple way to filter your Saved Object type, use `SavedObjectsClientContract.find` instead

## Security

:::{important} ⚠️ Avoid using these patterns
The following examples demonstrate patterns that can compromise security. These patterns are shown only to help you recognize and avoid them.
:::

### Security considerations for aggregations

:::{important} Security Warning: Aggregations can bypass query restrictions
Both the `search` and `find` methods support aggregations, but some Elasticsearch aggregation types can return data from documents that did not match your query. This can inadvertently bypass security restrictions like Kibana Spaces, potentially exposing data from unauthorized documents or other spaces.
:::

When Kibana communicates with Elasticsearch on behalf of the internal user (`kibana_system`), queries are constructed to limit results to the subset of documents that the end user has access to (e.g., saved objects in a specific space, or of certain types). However, certain aggregations can leak data outside of this filtered scope.

### Aggregations to avoid

The following aggregation patterns should be avoided because they can return data outside the query scope:

| Aggregation | Risk |
|------------|------|
| `terms` with `min_doc_count: 0` | Returns terms that exist in the index but not in matching documents. Can expose field values from other spaces. |
| `global` | Ignores your search filter and collects data from all documents in the index. |
| `significant_terms` | Compares against a "background set" that by default includes all documents in the index. |
| `significant_text` | Similar to `significant_terms`—uses background document set for comparisons. |
| `parent` | Accesses parent documents which may not match filters. |
| `nested` / `reverse_nested` | May access nested documents outside the current query scope. |

### Example: Unsafe aggregations

```ts
// ❌ DANGEROUS: This can expose data from other spaces.
const result = await savedObjectsClient.search({
  type: ['dashboard'],
  namespaces: ['default'],
  query: { match_all: {} },
  aggs: {
    all_authors_in_index: {
      terms: {
        field: 'dashboard.attributes.author',
        min_doc_count: 0, // ❌ Returns terms from documents that don't match the query.
      },
    },
  },
});
```

```ts
// ❌ DANGEROUS: Global aggregation bypasses namespace security
const result = await savedObjectsClient.search({
  type: ['dashboard'],
  namespaces: ['default'],
  query: { match_all: {} },
  aggs: {
    everything: {
      global: {}, // ❌ Aggregates documents from ALL namespaces, not just 'default'
      aggs: {
        total_count: { value_count: { field: '_id' } },
      },
    },
  },
});
```

### Protected root fields

The `search` method validates runtime mappings to prevent overriding critical root fields (like `namespace`, `namespaces`, `type`). These fields are used for security filtering, and allowing them to be overridden could bypass namespace restrictions.

If you attempt to create a runtime mapping that overrides a protected root field, the search will throw an error:

```ts
// ❌ This will throw an error attempting to override protected field
const result = await savedObjectsClient.search({
  type: ['my-type'],
  namespaces: ['default'],
  runtime_mappings: {
    namespaces: {
      type: 'keyword',
      script: {
        source: 'emit("default")', // Attempt to make all docs appear in 'default' namespace
      },
    },
  },
  query: { match_all: {} },
});
// Throws: "'runtime_mappings' contains forbidden fields: namespaces"
```

### Encrypted fields and runtime mappings

The `search` method processes results to decrypt and redact sensitive fields before returning them to the caller.

However, runtime mappings execute at the Elasticsearch level before this post processing occurs. This means runtime mappings can access the raw encrypted field values stored in the index.

```ts
// ❌ DANGEROUS: Runtime mappings can expose encrypted fields
const result = await savedObjectsClient.search({
  type: ['connector'],
  namespaces: ['default'],
  query: { match_all: {} },
  runtime_mappings: {
    // ❌ This accesses encrypted secrets before the search method can decrypt them
    exposed_api_key: {
      type: 'keyword',
      script: {
        source: `
          if (doc.containsKey('connector.secrets') && !doc['connector.secrets'].empty) {
            emit(doc['connector.secrets'].value);
          }
        `,
      },
    },
  },
  // ❌ The encrypted value is returned in the response, bypassing decryption
  fields: ['exposed_api_key'],
});
```