---
navigation_title: "Generating OAS for HTTP APIs"
description: "This tutorial demonstrates how to generate OpenAPI specification for HTTP APIs."
---

# Generating OAS for HTTP APIs

:::{note} OAS is required for all public routes
If your route declares `access: 'public'` you **must** provide up-to-date OpenAPI specification for it. Docs for these routes get hosted on [on our docs site](https://www.elastic.co/docs/api/doc/serverless) and are used for client integrations. For example: our [Elastic stack terraform provider](https://github.com/elastic/terraform-provider-elasticstack).
:::

:::{warning} Designing good code-first APIs
Code-first API schemas must be designed carefully to produce clear OpenAPI 3.0 output. Prefer simple `@kbn/config-schema` types and keep request/response shapes narrow and explicit. For more information on how to design your API for OAS, see [HTTP API Design](../contributing/api-design/guidelines-for-http-api-design-in-kibana.md).

  Complex runtime-centric schemas can validate correctly but still generate confusing, lossy, or incomplete OAS. See <a href="#oas-compatibility-kbn-config-schema-types">types and patterns that do not map cleanly to OAS 3.0</a>.

  Always make sure to preview the OAS you generated before merging it to `main`, run `make help` in `/oas_docs` for preview commands.
:::

### Important components

To get OAS generated for HTTP APIs you must use the following components:

1. Core's `router` or `router.versioned` for defining HTTP APIs provided via the `core.http` service to all plugins
2. `@kbn/config-schema` or `@kbn/zod` request and response schemas

:::{note} Beyond runtime validation
Kibana's core platform supports `@kbn/config-schema` as a first-class citizen for various schema purposes: configuration, saved objects, and HTTP API request/response bodies.

  Developers can leverage `@kbn/config-schema` as a single-source of truth for runtime validation, TypeScript interfaces, and OpenAPI specification.
:::

### How do I see my HTTP API's OAS?

In `kibana.dev.yml` add the following configuration:

```yaml
server.oas.enabled: true
```

Launch Kibana and send the following request:

```bash
curl -s -uelastic:changeme http://localhost:5601/api/oas\?pathStartsWith\=/api/foo
```

The value returned should contain the OpenAPI specification for your route and any other path's start with `/api/foo`.

Other useful query parameters for filtering are:
 * `pluginId` - get the OAS for a specific plugin, for example: `@kbn/data-views-plugin`
 * `access` - filter for specific access levels: `public` or `internal` are supported

### Some good practices to consider
<a id="oas-compatibility-kbn-config-schema-types"></a>

Use this section as a practical checklist when authoring public APIs.

| `@kbn/config-schema` type/pattern | Why this is problematic for OAS 3.0 | Preferred alternative |
| --- | --- | --- |
| `schema.byteSize()` / `schema.duration()` | Parses to runtime-specific value types (`ByteSizeValue`, `moment.Duration`) that are not standard JSON schema primitives for OpenAPI consumers. | Use `schema.string()` (human-readable units) or `schema.number()` (normalized base unit), and document units in `meta.description` (for example: "duration in milliseconds", "size in bytes"). |
| `schema.buffer()` / `schema.stream()` | Binary and stream runtime objects do not map naturally to standard JSON request/response bodies. | Model payloads as JSON-friendly primitives/objects. For binary transport, document media type and use explicit OpenAPI request/response content definitions. |
| `schema.any()` | Escape hatch that produces little to no useful contract in generated OAS. | Use a small explicit `schema.object({...})`, `schema.recordOf(...)`, or a constrained union with documented fields. |
| `schema.mapOf()` / `schema.recordOf()` when key shape matters | OAS generally represents these as `type: object` with `additionalProperties`, which does not clearly communicate all key constraints to clients. | If keys are known, model explicit object properties. If keys are dynamic, keep values simple and document key format in descriptions. |
| `schema.oneOf()` for object variants (especially nested `oneOf`) | Unions without a clear discriminator are harder for humans/tools to understand. Nested forms like `schema.oneOf([schema.oneOf([a, b]), schema.oneOf([c, d])])` are especially hard to read and lead to poor validation errors. | Prefer `schema.discriminatedUnion('type', [...])` with a stable discriminator and flat variants. |
| `schema.conditional()`, `schema.contextRef()`, `schema.siblingRef()` | Behavior depends on runtime context, which is difficult to encode as a stable, portable OAS contract. | Prefer explicit route versions or explicit discriminator/object shapes so behavior is statically visible in the contract. |

#### 1. Runtime schema definitions

```typescript
// In server/schemas/v1.ts
import { schema, TypeOf } from '@kbn/config-schema';

export const fooResource = schema.object({
  name: schema.string({
    meta: { description: 'A unique identifier for...' },
  }),
  // ...and any other fields you may need
});

export type FooResource = TypeOf<typeof fooResource>;

// In common/foo/v1.ts
export type { FooResource } from '../server/schemas/v1';

// In common/index.ts expose this as the "latest" schema shape
export type { FooResource } from './latest';

export * as fooResourceV1 from '../foo/v1';
```

This example demonstrates how you can organize runtime schemas to prepare for:

1. Being versioned
2. Have TypeScript references available to client and server code in your plugin

See [strategies for versioning your schemas](./versioning-interfaces.md) for more information on this organizational pattern.

#### 2. Route definitions

```typescript
// Somewhere in your plugin's server/routes folder
import { schema, TypeOf } from '@kbn/config-schema';
import type { FooResource } from '../../../common';
import { fooResource } from '../../schemas/v1';

// Note: this response schema is instantiated lazily to avoid creating schemas that are not needed in most cases!
const fooResourceResponse = () => {
  return schema.object({
    id: schema.string({
      maxLength: 20,
      meta: { description: 'Add a description.' }
    }),
    name: schema.string({ meta: { description: 'Add a description.' } }),
    createdAt: schema.string({
      meta: {
        description: 'Add a description.',
        deprecated: true,  // An indicator that the property is deprecated
      },
    }),
  })
}

// Note: TypeOf can extract types for lazily instantiated schemas
type FooResourceResponse = TypeOf<typeof fooResourceResponse>

function registerFooRoute(router: IRouter, docLinks: DoclinksStart) {
  router.versioned
    .post({
      path: '/api/foo',
      access: 'public',
      summary: 'Create a foo resource'
      description: `A foo resource enables baz. See the following [documentation](${docLinks.links.fooResource}).`,
      deprecated: true,  // An indicator that the operation is deprecated
      options: {
        tags: ['oas-tag:my tag'],  // Each operation must have a tag that's used to group similar endpoints in the docs
        availability: {
          since: '1.0.0', // The version that the API was added.
          stability: 'experimental', // The current lifecycle: experimental, beta, or stable
        },
      },
    })
    .addVersion({
      version: '2023-10-31',
      validate: {
        request: {
          body: fooResource,
        },
        response: {
          200: {
            description: 'Indicates a successful call.',
            body: fooResourceResponse,
          },
        },
      },
    },
    async (ctx, req, res) => {
      const core = await ctx.core;
      const savedObjectsClient = core.savedObjects.client;
      const body = req.body;
      const foo = await createFoo({ name: body.name });
      // This is our HTTP translation layer to ensure only the necessary fields included
      const responseBody: FooResourceResponse = {
        id: foo.id,
        name: foo.name,
        createdAt: foo.createdAt,
      };
      return res.ok({ body: responseBody });
    }
  );
}
```

##### Adding examples

Beyond the schema of requests and responses, it is **very useful** to provide
concrete requests and responses as examples. Examples go beyond defaults and
provide a more intuitive understanding for end users in learning the behaviour
of your API. See the [bump.sh documentation](https://docs.bump.sh/guides/openapi/specification/v3.1/data-models/examples/)
for more information on how examples will be shown to end users.

To add examples to the endpoint we created above you could do the following:

```typescript
// ...
    .addVersion({
      version: '2023-10-31',
      options: {
        // Be sure and lazily instantiate this value. It's only used at dev time!
        oasOperationObject: () => ({
          requestBody: {
            content: {
              'application/json': {
                examples: {
                  fooExample1: {
                    summary: 'An example foo request',
                    value: {
                      name: 'Cool foo!',
                    } as FooResource,
                  },
                },
              },
            },
          },
          responses: {
            200: {
              content: {
                'application/json': {
                  examples: {
                    /* Put your 200 response examples here */
                  },
                },
              },
            },
          },
        }),
      },
      validate: {
        request: {
          body: fooResource,
        },
        response: {
          200: {
            body: fooResourceResponse,
          },
        },
      },
    },
// ...
```
The strength of this approach is your examples are captured in code and type
checked at dev time. So any shape errors should be caught as you author.

<details>

<summary>I have prexisting YAML based examples I'd like to use!</summary>

If you pre-existing examples created in YAML that you would like
to use the following approach:

```typescript
import path from 'node:path';

const oasOperationObject: () => path.join(__dirname, 'foo.examples.yaml'),

// ...
    .addVersion({
      version: '2023-10-31',
      options: {
        oasOperationObject,
      },
      validate: {
        request: {
          body: fooResource,
        },
        response: {
          200: {
            body: fooResourceResponse,
          },
        },
      },
    },
// ...
```

Where the contents of `foo.examples.yaml` are:

```yaml
requestBody:
  content:
    application/json:
      examples: # Make sure to use the examples array, example (singular) has been deprecated
        fooExample:
          summary: Foo example
          description: >
            An example request of creating foo.
          value:
            name: 'Cool foo!'
        fooExampleRef:
          # You can use JSONSchema $refs to organize this file further
          $ref: "./examples/foo_example_i_factored_out_of_this_file.yaml"
responses:
  200:
    content:
      application/json:
        examples:
          # Apply a similar pattern to writing examples here
x-codeSamples:
- lang: cURL
  # label: A label which will be used as a title. Defaults to the lang value.
  source: |
    curl \
      -X POST /api/foo
      -H "kbn-xsrf: true"
      -d '{...}'
- lang: Console
  source: |
    POST kbn:/api/agent_builder/tools
    {...}
```

</details>

#### 3. Generating OAS

See <a href="#how-do-i-see-my-http-apis-oas">this section</a> about viewing your HTTP APIs OAS.

#### 4. Iterating on OAS

From here, you can develop your route and schema definitions iteratively. After each change the Kibana server will
automatically reload and the latest OAS should reflect the current state of your code!

For example, let's add a few descriptions to our schema members:

```typescript
const fooResourceResponse = () => {
  return schema.object({
    id: schema.string({ maxLength: 20, meta: { description: 'An unique ID for a foo resource.'} }),
    name: schema.string({ meta: { description: 'A human friendly name for a foo resource.'} }),
    createdAt: schema.string({ meta: { description: 'The ISO date a foo resource was created.'} }),
  })
}
```

This descriptions should now be reflected in the OAS generated for your route.

#### Field-level availability and `x-state`

You can also attach **availability** metadata on individual fields in code-first schemas. In `@kbn/config-schema`, use `meta.availability`; with Zod v4 (`@kbn/zod/v4`), use `.meta({ openapi: { availability: ... } })`. The OpenAPI generator maps this to an `x-state` extension on the corresponding schema property (or named component).

```typescript
// @kbn/config-schema
schema.string({
  meta: {
    description: 'Add a description.',
    availability: { stability: 'stable', since: '9.4.0' },
  },
});
```

```typescript
// @kbn/zod/v4
import { z } from '@kbn/zod/v4';

z.string().meta({
  openapi: {
    availability: { stability: 'stable', since: '9.4.0' },
  },
});
```

:::{note} How this appears in generated OAS
For example, `stability: 'stable'` together with `since: '9.4.0'` becomes `x-state: Generally available; added in 9.4.0` on that field in the generated document.
:::

#### 5. Publishing OAS

OAS for public routes are written to the Kibana repo as a snapshot that will ultimately be published.

:::{warning} Under construction
At the time of writing we only capture OAS for a subset of Kibana's HTTP APIs to give teams time to check and improve the quality of generated OAS.

  If you would like OAS for your endpoints to be included in the snapshot, **please reach out to the Kibana Core team** or follow the instructions below.
:::

To publish OAS to our docs site create a pull request updating [this command](https://github.com/elastic/kibana/blob/970e9fe4a3c29df81ccff6761d4986d316338398/.buildkite/scripts/steps/checks/capture_oas_snapshot.sh#L11) to include your HTTP API path.

The OAS will be pushed and published to our [stateful](https://www.elastic.co/docs/api/doc/kibana/) and [serverless](https://www.elastic.co/docs/api/doc/serverless/) docs hosted by bump.sh.

If you would like to preview your docs before merging, you can do the following:

1. Install the bump cli: https://www.npmjs.com/package/bump-cli
2. Save your docs to a local file `curl localhost:5601/api/oas\?access\=public\&version\=2023-10-31\&pathStartsWith\=/api/saved_objects/_export > temp.json`
3. `npx bump preview temp.json`
4. Once done, your docs should be hosted at a temporary location provided by bump.sh

### FAQs

#### What about runtime validation libary X?
Teams have adopted different runtime validation libraries for their HTTP APIs. Kibana core does not intend to support all runtime validation libraries.

Reach out to **the Kibana Core Team** with questions, concerns or issues you may be facing with `@kbn/config-schema` and we will help you find a solution.

#### What about internal HTTP APIs?
It's possible to generate OpenAPI specification for `access: 'internal'` routes but it is not required. The benefit will largely be for your team's internal reference and for other teams to discover your APIs. If you follow the practices outlined in this tutorial it should be simple to generate OAS for internal routes as well.