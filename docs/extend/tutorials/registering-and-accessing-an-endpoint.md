---
navigation_title: "Registering and accessing an endpoint"
description: "Learn how to register a new endpoint and access it"
---

# Registering and accessing an endpoint

## The HTTP service API

### The server-side HTTP service

The server-side `HttpService` allows server-side plugins to register endpoints with built-in support for request validation. These endpoints may be used by client-side code or be exposed as a public API for users. Most plugins integrate directly with this service.

The service allows plugins to:
- extend the Kibana server with custom HTTP API.
- execute custom logic on an incoming request or server response.
- implement custom authentication and authorization strategy.

:::{note}
See [the server-side HTTP service API docs](https://github.com/elastic/kibana/blob/main/docs/development/core/server/kibana-plugin-core-server.httpservicesetup.md)
:::

### The client-side HTTP service

The client-side counterpart of the HTTP service provides an API to communicate with the Kibana server via HTTP interface.
The client-side `HttpService` is a preconfigured wrapper around `window.fetch` that includes some default behavior and automatically handles common errors (such as session expiration).

**The service should only be used for access to backend endpoints registered by the same plugin.** Feel free to use another HTTP client library to request 3rd party services.

:::{note}
See [the client-side HTTP service API docs](https://github.com/elastic/kibana/blob/main/docs/development/core/public/kibana-plugin-core-public.httpsetup.md)
:::

## Registering an endpoint

Registering an endpoint, or `route`, is done during the `setup` lifecycle stage of a plugin. The first step to register a route
is to create a [router](https://github.com/elastic/kibana/blob/main/docs/development/core/server/kibana-plugin-core-server.irouter.md)
using the `http` core service.

Once the router is instantiated, it is possible to use its APIs, such as `router.get` or `router.post` to create a route for the equivalent
HTTP method. All these APIs share the same signature, and receive two parameters:
- `route` - the route configuration, such as the `path` of the route, or the parameter validation schemas
- `handler` - the handler function that will be called when a request matching the route configuration is received

When invoked, the `handler` receive three parameters: `context`, `request`, and `response`, and must return a response that will be sent to serve
the request.
- `context` is a request-bound context exposed for the request. For example, it allows to use an elasticsearch client bound to the request's credentials.
- `request` contains information related to the request, such as the path and query parameter
- `response` contains factory helpers to create the response to return from the endpoint

:::{note}
See the [request](https://github.com/elastic/kibana/blob/main/docs/development/core/server/kibana-plugin-core-server.kibanarequest.md)
  and [response](https://github.com/elastic/kibana/blob/main/docs/development/core/server/kibana-plugin-core-server.kibanaresponsefactory.md)
  documentation
:::

## Basic examples

### Registering a GET endpoint

The following snippet demonstrate how to create a basic `GET` endpoint on the `/api/my_plugin/get_object` path:

```ts
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/get_object',
        validate: false,
      },
      async (context, request, response) => {
        return response.ok({
          body: { result: 'everything is alright'},
        });
      }
    );
  }
}
```

consuming the endpoint from the client-side using core's `http` service would then look like:

```ts
import { HttpStart } from '@kbn/core/public';

interface ResponseType {
  result: string;
};

async function fetchData(http: HttpStart) {
  return await http.get<ResponseType>(`/api/my_plugin/get_object`); 
}
```

### Using and validating path parameters

It is possible to specify dynamic parameters in the `path` of the endpoint using the `{name}` syntax.
When doing so, the associated validation schema must be defined via the `validate.params` option
of the route definition.

```ts
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/get_object/{id}',
        validate: {
          params: schema.object({
            id: schema.string(),
          })
        },
      },
      async (context, request, response) => {
        const { id } = request.params;
        const data = await findObject(id);
        if (!data) {
          return response.notFound();
        }
        return response.ok({ body: data });
      }
    );
  }
}
```

consuming the endpoint from the client-side using core's `http` service would then look like:

```ts
import { HttpStart } from '@kbn/core/public';
import { MyObjectType } from '../common/types';

async function fetchData(http: HttpStart, id: string) {
  return await http.get<MyObjectType>(`/api/my_plugin/get_object/${id}`); 
}
```

### Registering a POST endpoint and validating the payload

Similar to the validation we performed against the path parameters in the previous example, the `body` validation schema
must be provided when registering a `post` handler that will access the payload.

```ts
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.post(
      {
        path: '/api/my_plugin/objects/{id}/update',
        validate: {
          params: schema.object({
            id: schema.string(),
          }),
          body: schema.object({
            title: schema.string(),
            description: schema.string()
          }),
        },
      },
      async (context, request, response) => {
        const { id } = request.params;
        const { title, description } = request.body;
        await updateObject(id, { title, description });
        return response.ok({ body: { updated: true }});
      }
    );
  }
}
```

consuming the endpoint from the client-side using core's `http` service would then look like:

```ts
import { HttpStart } from '@kbn/core/public';

interface ResponseType {
  updated: boolean;
};

interface UpdateOptions {
  title?: string;
  description?: string;
}

async function fetchData(http: HttpStart, id: string, { title, description }: UpdateOptions) {
  return await http.post<ResponseType>(`/api/my_plugin/objects/${id}/update`, {
    body: JSON.stringify({ title, description })
  }); 
}
```

### Using the query parameters

Similar to the `body` validation, the query parameters schema has to be defined using the `validate.query`
option of the route definition to be accessible from the handler.

```ts
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/objects/find',
        validate: {
          query: schema.object({
            term: schema.maybe(schema.string()),
            page: schema.number({ min: 1, defaultValue: 1 }),
            perPage: schema.number({ min: 5, max: 50, defaultValue: 10 }),
          }),
        },
      },
      async (context, request, response) => {
        const { term, page, perPage } = request.query;
        const results = await findObjects(term, { page, perPage });
        return response.ok({ body: { results } });
      }
    );
  }
}
```

consuming the endpoint from the client-side using core's `http` service would then look like:

```ts
import { HttpStart } from '@kbn/core/public';
import { MyObjectType } from '../common/types';

interface ResponseType {
  results: MyObjectType[];
};

interface UpdateOptions {
  term?: string;
  page?: number;
  perPage?: number;
}

async function fetchData(http: HttpStart, { term, page, perPage }: UpdateOptions) {
  return await http.get<ResponseType>(`/api/my_plugin/objects/find`, {
    query: { term, page, perPage },
  }); 
}
```

## Customizing the response

### Attaching headers to the response

All APIs of the `response` parameter of the handler accept a `headers` property that can be used
to define headers to attach to the response.

```ts
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/some_text_response',
        validate: false,
      },
      async (context, request, response) => {
        return response.ok({
          body: 'some plain text response',
          headers: {
            'content-type': 'text/plain',
            'cache-control': 'must-revalidate',
          },
        });
      }
    );
  }
}
```

### Defining a specific HTTP status code for the response

The `response` parameter of the handler already provides APIs for the most common HTTP response codes, such as
- `response.ok` for `200`
- `response.notFound` for `404`
- `response.badRequest` for `400`
- and so on

However, some of the less commonly used return codes don't have such helpers. In that case, the `response.custom`
and/or `response.customError` APIs should be used.

```ts
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/some_text_response',
        validate: false,
      },
      async (context, request, response) => {
        return response.custom({
          body: `Kibana is a teapot`,
          statusCode: 418,
        });
      }
    );
  }
}
```

## Some advanced usages

### Handling request cancellation

Some request lifecycle events are exposed to the handler via `request.events` in the form of `rxjs` 
observables, such as `request.events.aborted$` that emits if/when the request is canceled by the client.

These observables can either be used directly, or be used to control an `AbortController`.

```ts
import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/objects/find',
        validate: {
          query: schema.object({
            term: schema.maybe(schema.string()),
          }),
        },
      },
      async (context, request, response) => {
        const { term } = request.query;
        const { aborted$ } = request.events;
        
        const abortController = new AbortController();
        aborted$.subscribe(() => {
          abortController.abort();
        });
        
        const results = await findObjects(term, { abortController });
        return response.ok({ body: results });
      }
    );
  }
}
```

### Disabling authentication for an endpoint

By default, when security is enabled, endpoints require the user to be authenticated to be accessed,
and will return a `401 - Unauthorized` otherwise.

It is possible to disable this requirement using the `security.authc.enabled` option of the route.

```ts
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/get_object',
        validate: false,
        security: {
          authc: {
            enabled: false,
            reason: 'This endpoint does not require authentication',
          },
        },
      },
      async (context, request, response) => {
        return response.ok({
          body: { authenticated: request.auth.isAuthenticated },
        });
      }
    );
  }
}
```

Note that in addition to `true` and `false`, `security.authc.enabled` accepts a third value, `'optional'`. When used,
Kibana will try to authenticate the user but will allow access to the endpoint regardless of the result. In that
case, the developer needs to manually checks if the user is authenticated via `request.auth.isAuthenticated`.

### Accessing the url or route configuration from the handler 

In some advanced use cases, such as generic handlers being used for multiple routes, it can be useful to know,
from within the handler, the route configuration and the actual url that was requested by the user. This can
be achieved by using the `url` and `route` properties of the `request` parameter of the handler.

request.url / request.route

```ts
import type { CoreSetup, Plugin } from '@kbn/core/server';

export class MyPlugin implements Plugin {
  public setup(core: CoreSetup) {
    const router = core.http.createRouter();
    router.get(
      {
        path: '/api/my_plugin/get_object',
        validate: false,
        security: {
          authc: {
            enabled: false,
            reason: 'This endpoint does not require authentication',
          },
        },
      },
      async (context, request, response) => {
        const { url, route } = request;
        return response.ok({
          body: `You requested ${route.method} ${url}`,
        });
      }
    );
  }
}
```

## More examples

:::{note}
See [the routing example plugin](https://github.com/elastic/kibana/blob/main/examples/routing_example) for more route registration examples.
:::