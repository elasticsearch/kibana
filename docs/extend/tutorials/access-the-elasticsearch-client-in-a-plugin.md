---
navigation_title: "Access the Elasticsearch Client in a Plugin"
description: "Learn how to use the Elasticsearch client in your Kibana plugin."
---

# Access the Elasticsearch Client in a Plugin

This guide covers how to obtain the Elasticsearch client in both your plugin's start lifecycle and route handler context. It explains the difference between asCurrentUser and asInternalUser, and demonstrates best practices for robust concurrent index initialization.

## Getting the Elasticsearch Client

### From the Plugin Start Contract

In your plugin's `start` method, the `core` parameter provides access to the Elasticsearch client:

```ts
import type { CoreStart, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public start(core: CoreStart) {
    const esClient = core.elasticsearch.client.asInternalUser;
    // You can now use esClient to call Elasticsearch APIs
  }
}
```

- Use `asScoped(request)` to perform actions as the request-authenticated user.
- **Note**: In HTTP route handlers you receive a client already scoped to the user `elasticsearch.client.asCurrentUser` instead of needing to call `asScoped(request)`.
- Use `asInternalUser` for system-level operations that should bypass user permissions (see security considerations).

### From a Route Handler Context

When defining a server route, you can access the Elasticsearch client from the route handler's `context` parameter:

```ts
router.get(
  { path: '/api/my_plugin/search', validate: false },
  async (context, request, response) => {
    const esClient = (await context.core).elasticsearch.client.asCurrentUser;
    // Use esClient to call Elasticsearch APIs
    const result = await esClient.search({
      index: 'my-index',
      body: { query: { match_all: {} } }
    });
    return response.ok({ body: result });
  }
);
```

- `context.core.elasticsearch.client.asCurrentUser` executes requests as the user making the HTTP request.
- Always prefer `asCurrentUser` in route handlers to respect user permissions.

## Example: Safely Initializing, Indexing, and Searching an Index

When working in distributed environments (such as multiple Kibana instances), it is common for several instances to attempt to create the same index at the same time. To ensure the index is ready for ingesting and searching, all instances should:

1. Attempt to create the index.
2. If the index already exists (or creation succeeds), wait until the index status is **green** before proceeding.

```ts
import type { CoreStart, Plugin } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';

async function ensureIndexReady(esClient: ElasticsearchClient, indexName: string, mappings: object) {
  try {
    // Attempt to create the index even if it may already exist
    // Use a long timeout and set requestTimeout slightly longer to avoid socket closure
    await esClient.indices.create(
      {
        index: indexName,
        mappings,
        timeout: '300s',
        // Allow for 0 or 1 replicas for higher availability on multi-node clusters, but continue to work on single-node (dev) clusters
        auto_expand_replicas: '0-1', 
      },
      { requestTimeout: 310_000 } 
    );
  } catch (error) {
    if (error?.body?.error?.type !== 'resource_already_exists_exception') {
      throw error;
    }
    // Index already exists - this is expected in multi-instance environments
    // Do NOT log this as an error since it's an expected scenario that we
    // gracefully handle
  }

  // Wait for the index to be ready (green status)
  // Use a long timeout and set requestTimeout slightly longer to avoid socket closure
  // Note: On serverless, the health API is only available to the internal user
  await esClient.cluster.health(
    {
      index: indexName,
      wait_for_status: 'green',
      timeout: '300s',
    },
    { requestTimeout: 310_000 }
  );
}

export class MyPlugin implements Plugin {
  public start(core: CoreStart) {
    const esClient = core.elasticsearch.client.asInternalUser;
    const indexName = 'my-index';
    const mappings = {
      properties: {
        title: { type: 'text' },
        description: { type: 'text' },
      },
    };

    ensureIndexReady(esClient, indexName, mappings)
      .then(() => {
        // Index is ready for ingesting and searching
      })
      .catch((err) => {
        this.logger.error(`Failed to initialize index ${indexName} in start: ${err?.message || err}`);
      });
  }
}
```

### Why Wait for Green Status?

- The create index call can return successfully if the timeout was reached after the operation was accepted but the primary shards are not yet available (in this case the response will include `acknowledged: true, shard_acknowledged: false`).
- Multiple Kibana instances may race to create the same index. If a given instance receives the "index already exists" exception it does not provide any guarantee that the primary shards are available yet.
- After creation (or if the index already exists), always wait for the index to reach **green** status before indexing or searching. This ensures all primary shards are available, preventing failed operations.
- NOTE: On stateful **yellow** status would be sufficient, but serverless requires waiting for green status.

### Logging Best Practices

When implementing index initialization:

- **Do NOT log `resource_already_exists_exception` as an error** - this is completely expected when multiple Kibana instances start simultaneously
- **DO log genuine initialization failures** - like an index still not being available after the timeout

```ts
// Good: Only log actual errors
} catch (error) {
  if (error?.body?.error?.type !== 'resource_already_exists_exception') {
    this.logger.error(`Failed to create index ${indexName}: ${error?.message || error}`);
    throw error;
  }
  // Don't log - this is expected behavior
}
```

---

## Security Considerations

- Use `asScoped` or `asCurrentUser` for user-initiated actions to enforce security
- Use `asInternalUser` only for trusted, internal operations that must not be restricted by user permissions.
- Never use `asInternalUser` in route handlers that respond to user requests.

---

## Logging

The Elasticsearch service logs all requests and responses at the `debug` log level.

By default, requests are logged under the logger `elasticsearch.query.data`, where `data` is the default client name. Custom clients created via `core.elasticsearch.createClient(type, options)` are logged as `elasticsearch.query.<type>`.

To group specific queries for easier troubleshooting, pass a `loggerName` via the `loggingOptions` context parameter:

```typescript
client.search(searchParams, {
  context: {
    loggingOptions: {
      loggerName: 'myqueries',
    },
  },
});
```

This request will be logged under `elasticsearch.query.myqueries`.

To see these logs, enable the `debug` level for that logger in `kibana.yml`:

```yaml
logging.loggers:
  - name: elasticsearch.query.myqueries
    level: debug
```