---
navigation_title: "Versioning HTTP APIs"
description: "This tutorial demonstrates how to create or migrate to versionable HTTP APIs."
---

# Versioning HTTP APIs

All Kibana HTTP API developers and maintainers must ensure that past versions of HTTP APIs remain available.

:::{note} A note on internal vs public HTTP APIs
HTTP APIs may be intended for **internal** or **public** use. Different levels of rigour are appropriate when designing and managing changes for each. However, in both cases we must support some minimal set of past HTTP APIs.

  The exact number of past APIs and the length of time they are kept available will vary per use case. Generally, the length of time will be shorter for internal HTTP APIs than for public HTTP APIs.
:::

:::{dropdown} FAQ: What is the difference between an internal and a public HTTP API?
:::{note}
We only declare HTTP APIs that are stable and reliable as public and keep all development changes behind internal HTTP APIs. Public HTTP APIs are intended for external consumption and are typically garanteed not to change within a major. Internal HTTP APIs may change more frequently, as long as they adhere to the versioning principles outlined in the rest of this doc.
:::

:::

Versioned HTTP APIs should hold to the following set of properties. **Note:** how you meet these is properties is up to you. Use the examples provided as a guide.

### 1. Do not directly expose persistence schemas on your HTTP API endpoints

Consider this example of directly exposing a persisted schema over HTTP:

```ts
interface MyObject {
  foo: string;
  bar: number;
}
router.get(
  {
    path: '/api/myobject/{id}',
    validate: { params: schema.object({ id: schema.string() }) },
  },
  (ctx, req, res) => {
    const { savedObjects } = await ctx.core;
    const myObject = await savedObjects.client.get<MyObjectAttributes>('myObject', req.params.id);
    return res.ok({
      body: { ...myObject.attributes }, // <- Directly exposing SO attributes
    });
  }
);
```

#### Why is this problematic for versioning?

Whenever we perform a data migration the body of this endpoint will change for all clients. This prevents us from being able to maintain past interfaces and gracefully introduce new ones.

#### There are several examples of persistence schemas:

* The shape of attributes in your Saved Object(s)
* The shape of the document source in an Elasticsearch index you manage, for example, a report
* The shape of the data whose storage you delegate to some other code
  * One example is the metadata stored on a `file` object exposed by the `src/plugins/files` plugin

Therefore a persistence schema is the _shape_ of any data your code directly, or indirectly _persists_. Think carefully about any persisted schemas your code might be using and ensure that none of them are exposed directly over your HTTP APIs.

Let's make the minimal changes to prepare the endpoint above for versioning:

```ts
interface MyObject {
  foo: string;
  bar: number;
}
// 1.
// We add a new interface for this HTTP APIs return value
// Note: this interface can live in your plugins top-level "common" directory
interface GetMyObjectResponse {
  foo: string;
  bar: number;
}
router.get(
  {
    path: '/api/myobject/{id}',
    validate: { params: schema.object({ id: schema.string() }) },
  },
  (ctx, req, res) => {
    const { savedObjects } = await ctx.core;
    const {
      attributes: { foo, bar },
    } = await savedObjects.client.get<MyObjectAttributes>('myObject', req.params.id);
    // 2.
    // Explicitly map to our HTTP body
    const body: GetMyObjectResponse = { foo, bar };
    return res.ok({ body });
  }
);
```

The changes are:

1. We created a **new interface** to represent our HTTP API contract. **Note:** Even though we duplicated some of our `MyObjectAttributes` in `GetMyObjectResponse`, it removed the risk that a data migration will break our current HTTP contract without TypeScript noticing.
2. We replaced object spread with **cherry-picking values** from our persistence schema. We now have a **translation layer** between our persistence schema and HTTP API interface.

These changes might seem subtle, but they are the difference between a versionable and unversionable HTTP API.

### 2. Strict input validation

Consider this example of an HTTP API that accepts unexpected values as input:

```ts
interface MyObjectAttributes {
  /** A user provided name */
  name: string;
  /** A number representing a length of time in milliseconds */
  duration: number;
}
router.post(
  {
    path: '/api/myobject',
    validate: { body: schema.object({ name: schema.string(), duration: schema.number() }) },
  },
  (ctx, req, res) => {
    const { savedObjects } = await ctx.core;
    const { id } = await savedObjects.client.create<MyObjectAttributes>('myObject', req.params.body);
    return res.ok({ body: id });
  }
);
```
#### Why is this problematic for versioning?

This HTTP API currently accepts all numbers and strings as input which allows for unexpected inputs like negative numbers or non-URL friendly characters. This may break future migrations or integrations that assume your data will always be within certain parameters.

```ts
  {
    path: '/api/myobject',
    validate: {
      body: schema.object({
        name: schema.string({
          minLength: 3,
          maxLength: 100,
          validate: (name) => name.match(/^[a-z0-9]+$/),
        }),
        duration: schema.number({ min: 0 }),
      })
    },
  }
```

Adding this validation we negate the risk of unexpected values. It is not necessary to use `@kbn/config-schema`, as long as your validation mechanism provides finer grained controls than "number" or "string".

In summary: think about the acceptable parameters for every input your HTTP API expects.

### 3. Keep interfaces as "narrow" as possible

```ts
const nameSchema = schema.string({ minLength: 1, });

router.get(
  {
    path: '/api/myobject/find',
    validate: { query: schema.object({ name: nameSchema, sort: schema.string() }) },
  },
  (ctx, req, res) => {
    const { savedObjects } = await ctx.core;
    const result = await savedObjects.client.find<MyObjectAttributes>({
      type: 'myObject',
      filter: `myObject.attributes.name: ${req.query.name}`,
      sortField: req.query.sort,
    });
    return res.ok({
      // Note: we observe the same translation for all our responses as in step 1.
      body: result.saved_objects.map(({ attributes: { foo, bar } }) => ({ foo, bar })),
    });
  }
);
```

The above code follows guidelines from steps 1 and 2, but it allows clients to specify ANY string by which to sort. This is a far "wider" API than we need for this endpoint.

#### Why is this problematic for versioning?

Without telemetry it is impossible to know what values clients might be passing through &mdash; and what type of sort behaviour they are expecting.

Additionally, the `sortField` is leaking information about our persistence schema. As with step 1, we want to remove direct knowledge of persistence schema from clients. Consider the following changes:

```ts
import { escapeKuery } from '@kbn/es-query';
const nameSchema = schema.string({ minLength: 1, });
// 1.
// A stricter schema for the sort by field. Now it is a small, known set of values
const sortSchema = schema.oneOf([schema.literal('foo'), schema.literal('bar')]);

router.get(
  {
    path: '/api/myobject/find',
    validate: { query: schema.object({ name: nameSchema, sort: sortSchema }) },
  },
  (ctx, req, res) => {
    const { savedObjects } = await ctx.core;
    const result = await savedObjects.client.find<MyObjectAttributes>({
      type: 'myObject',
      // 2.
      // Bonus point: defend against injection attacks
      filter: `myObject.attributes.name: ${escapeKuery(req.query.name)}`,
      sortField: req.query.sort,
    });
    return res.ok({
      // Note: we observe the same translation for all our responses as in step 1.
      body: result.saved_objects.map(({ attributes: { foo, bar } }) => ({ foo, bar })),
    });
  }
);
```

The changes are:

1. New input validation accepts a known set of values. This makes our HTTP API far _narrower_ and specific to our use case. It does not matter that our `sortSchema` has the same values as our persistence schema, what matters is that we created a **translation layer** between our HTTP API and our internal schema. This facilitates easily versioning this endpoint.
2. **Bonus point**: we use the `escapeKuery` utility to defend against KQL injection attacks.

### 4. Adhere to the HTTP versioning specification

We categorize our endpoints based on their intended audience: `public` or `internal`. Different versioning practices apply to each.

#### Public endpoints
Public endpoints include any endpoint that is intended for users to directly integrate with via HTTP.

:::{note} Version all public endpoints
All Kibana's public endpoints must be versioned using the format described below.
:::

##### Version lifecycle

Introducing a new version or moving a current version into deprecation to eventually be deleted must
follow [this process](https://github.com/elastic/dev/issues/new?assignees=&labels=breaking-change-proposal&projects=&template=breaking-change.md).

##### Version format

Choose a date string in the format `YYYY-MM-DD`. This date should be the date that a (group) of APIs was made available.

--------

#### Internal endpoints
Internal endpoints are all non-public endpoints (see definition above). Note: these endpoints do not need to be versioned,
but versioning can be leveraged to maintain BWC with existing clients.

##### Version lifecycle

Introducing/removing a version is up to the team who owns the HTTP API. Consider how introduction or removal might
affect client code when being rolled out.

:::{note} Keep internal versions to a minimum
To keep maintenance light it is **highly** recommended to reduce the number of versions you have for internal endpoints. In your code it is possible to
  centrally define and share internal versions through code that is `common` to your browser- and server-side plugin code.
:::

##### Version format

If you need to version an internal endpoint use a single, larger-than-zero major version. Ex. `1`.

#### API backwards compatibility

Backwards-incompatible changes to a public API version cannot be merged into an existing API version; they require a new API version following a proper breaking change process.

**Backwards-compatible changes** (safe within an existing version):

* Adding a new API
* Adding an optional request field or parameter
* Adding a response field
* Adding a new value to a non-exhaustive enum
* Adding a new variant to a union of variants
* Adding a value to a union type used for a request field or parameter
* Changing a scalar type into a union type for a request field or parameter

**Backwards-incompatible changes** (require a new API version):

* Removing an API
* Removing or renaming a request field or parameter
* Removing or renaming a response field
* Adding a new required request field or parameter
* Changing an optional request field or parameter to required
* Removing enum values
* Removing a variant from a union of variants
* Changing the type of a response field
* Adding a value to an exhaustive enum

When you make a backwards-compatible change, apply it to **all** supported API versions where it is applicable. Users should not need to upgrade their API version to take advantage of new features that are otherwise compatible.

#### Use the versioned router

Core exposes a versioned router that ensures your endpoint's behaviour and formatting all conforms to the versioning specification.

```typescript
  router.versioned.
    .post({
      access: 'public', // This endpoint is intended for a public audience
      path: '/api/my-app/foo/{id?}',
      options: { timeout: { payload: 60000 } },
    })
    .addVersion(
      {
        version: '2023-10-31', // The public version of this API
        validate: {
          request: {
            query: schema.object({
              name: schema.maybe(schema.string({ minLength: 2, maxLength: 50 })),
            }),
            params: schema.object({
              id: schema.maybe(schema.string({ minLength: 10, maxLength: 13 })),
            }),
            body: schema.object({ foo: schema.string() }),
          },
          response: {
            200: { // In development environments, this validation will run against 200 responses
              body: schema.object({ foo: schema.string() }),
            },
          },
        },
      },
      async (ctx, req, res) => {
        await ctx.fooService.create(req.body.foo, req.params.id, req.query.name);
        return res.ok({ body: { foo: req.body.foo } });
      }
    )
    // BREAKING CHANGE: { foo: string } => { fooString: string } in response body
    .addVersion(
      {
        version: '2024-10-31',
        validate: {
          request: {
            query: schema.object({
              name: schema.maybe(schema.string({ minLength: 2, maxLength: 50 })),
            }),
            params: schema.object({
              id: schema.maybe(schema.string({ minLength: 10, maxLength: 13 })),
            }),
            body: schema.object({ fooString: schema.string() }),
          },
          response: {
            200: {
              body: schema.object({ fooName: schema.string() }),
            },
          },
        },
      },
      async (ctx, req, res) => {
        await ctx.fooService.create(req.body.fooString, req.params.id, req.query.name);
        return res.ok({ body: { fooName: req.body.fooString } });
      }
    )
    // BREAKING CHANGES: Enforce min/max length on fooString
    .addVersion(
      {
        version: '2025-03-01',
        validate: {
          request: {
            query: schema.object({
              name: schema.maybe(schema.string({ minLength: 2, maxLength: 50 })),
            }),
            params: schema.object({
              id: schema.maybe(schema.string({ minLength: 10, maxLength: 13 })),
            }),
            body: schema.object({ fooString: schema.string({ minLength: 0, maxLength: 1000 }) }),
          },
          response: {
            200: {
              body: schema.object({ fooName: schema.string() }),
            },
          },
        },
      },
      async (ctx, req, res) => {
        await ctx.fooService.create(req.body.fooString, req.params.id, req.query.name);
        return res.ok({ body: { fooName: req.body.fooString } });
      }
```

#### Use `http.fetch` to send a version

Core's `http.fetch` (and helpers like `http.get`) accept an optional `version` parameter. The `version` parameter can be used to send your request to the corresponding handler of the route.

```ts
import type { CoreSetup, Plugin } from '@kbn/core/public';

export class MyPlugin implements Plugin {
  setup(core: CoreSetup): FilesSetup {
    // Example call using core's http.fetch
    core.http.post('/api/my-app/foo/1', {
      version: '2023-10-31',
      headers: { 'content-type': 'application/json' },
      query: { name: 'example' },
      body: JSON.stringify({ fooString: 'string' }),
    });
  }
}
```