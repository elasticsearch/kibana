---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/patterns.html
---

# Patterns [patterns]

## Scoped services [scoped-services]

Whenever Kibana needs to get access to data saved in Elasticsearch, it should perform a check whether an end-user has access to the data. The Kibana Platform introduced a handler interface on the server-side to perform that association internally. Core services, that require impersonation with an incoming request, are exposed via `context` argument of [the request handler interface](https://github.com/elastic/kibana//blob/8.9/src/core/packages/http/server/src/router/request_handler.ts).

```js
async function handler(context, req, res) {
  const data = await context.core.elasticsearch.client.asCurrentUser('ping');
}
```

The [request handler context](https://github.com/elastic/kibana//blob/8.9/src/core/packages/http/server/src/router/request_handler.ts) exposes the following scoped **core** services:

* [`context.savedObjects.client`](https://github.com/elastic/kibana//blob/8.9/src/core/packages/saved-objects/api-server/src/saved_objects_client.ts)
* [`context.elasticsearch.client`](https://github.com/elastic/kibana//blob/8.9/src/core/packages/elasticsearch/server/src/client/scoped_cluster_client.ts)
* [`context.uiSettings.client`](https://github.com/elastic/kibana//blob/8.9/src/core/packages/ui-settings/server/src/ui_settings_client.ts)

### Declare a custom scoped service [_declare_a_custom_scoped_service]

Plugins can extend the handler context with a custom API that will be available to the plugin itself and all dependent plugins. For example, the plugin creates a custom Elasticsearch client and wants to use it via the request handler context:

```typescript
import type { CoreSetup, RequestHandlerContext, IScopedClusterClient } from '@kbn/core/server';

interface MyRequestHandlerContext extends RequestHandlerContext {
 myPlugin: {
   client: IScopedClusterClient;
 };
}

class MyPlugin {
  setup(core: CoreSetup) {
    const client = core.elasticsearch.createClient('myClient');
    core.http.registerRouteHandlerContext<MyRequestHandlerContext, 'myPlugin'>('myPlugin', (context, req, res) => {
      return { client: client.asScoped(req) };
    });
    const router = core.http.createRouter<MyRequestHandlerContext>();
    router.get(
      { path: '/api/my-plugin/', validate: … },
      async (context, req, res) => {
        // context type is inferred as MyPluginContext
        const data = await context.myPlugin.client.asCurrentUser('endpoint');
      }
    );
  }
```



