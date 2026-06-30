---
navigation_title: "Guidelines for HTTP API design in Kibana"
description: "Best practices and guidelines for designing consistent, user-friendly HTTP APIs in Kibana"
---

# Guidelines for HTTP API design in Kibana

:::{warning} Work in progress
This guidance is under review. If you have a question or intend to apply it to your use-case please reach out to the Kibana Core team first.
:::

Kibana's public HTTP APIs are the focus of this document. See the section about [Internal vs Public APIs](#internal-vs-public-apis) for more details.

[Click here](#structure-and-conventions) to skip to the structure and conventions guides.

## Design principles

### Consistency

Consistency is key to a great API-user experience. APIs should be consistent in their naming, structure, and behavior. Follow established patterns when available. If no pattern exists, consider creating one paying close attention to:

1. **Consistent naming**: Use the same suffix for IDs (e.g., `space_id`, `dashboard_id`, etc.). APIs with clear, descriptive field names help self-document how it should be used.
2. **Consistent structure**: Use the same structure for referencing resources in requests and responses in all related APIs.
3. **Consistent validation**: Apply the same validation rules across all APIs.
4. **Consistent error messages**: Use the same structure for error messages. See the [section on errors](#errors).
5. **Sufficient security controls**: Don't disable authentication or authorization requirements unless there's a strong and well-defined need.
6. **Predictability**: APIs should be predictable in their behavior. For example, deleting a resource in one API domain should not have unexpected side-effects in another domain.

This principle is embodied in the rest of this document, so read on for examples!

### Make a great API-user experience

Create a great _API_ user experience, as opposed to optimizing a single API for _UI_ use cases as well. Front-ends have very different needs and constraints from public HTTP API clients. Our public HTTP APIs should be primitives that are simple to use and compose.

For example, a UI might want to optimize it's network requests by bundling multiple requests into a single request, but an API client would be better designed to de-optimize and simplify the requests:

A view or component in the UI might do the following for some, UI-specific purpose:
```
GET /internal/some_related_resources_for_this_page?ids_only=true&page=1
# responds with:
{
  "a_ids": ["1", "2"],
  "b_ids": ["2"]
}
```

While API clients are better designed as:
```
# Request 1
GET /api/my_domain/my_resource_as?page=1
# responds with:
{
  "items": [{ id: "1", "name": "Resource A 1" }, { id: "2", "name": "Resource A 2" }],
  "page": 1,
  "total": 2
}
# Request 2
GET /api/my_domain/my_resource_bs?page=1
# responds with:
{
  "items": [{ id: "1", "name": "Resource B 1" }],
  "page": 1,
  "total": 1
}
```

:::{note} Internal vs Public APIs
We categorize HTTP APIs as either **internal** or **public** to further reinforce the different purposes they serve. See the [Internal vs Public APIs](#internal-vs-public-apis) section for more details.
:::

:::{note} Unit, Integration and E2E tests
All HTTP APIs must have [E2E or integration test coverage](../../testing/integration-tests.md) giving confidence the basic functionality works as intended.
:::

### Commitment

Exposing a public HTTP API is a long-term commitment to users and is not easily reversible. We must carefully design and plan APIs before they are made public, and then maintain them and ensure they work as expected.

First release new HTTP APIs internally or as `Technical Preview` behind a feature flag to ensure we aren't breaking our stability promises to users if the API needs to change while in development.

#### Breaking changes to HTTP APIs include

 - Rename or delete an API
 - Rename or delete a path, query or body parameter
 - Modify the type of a property (including expanding to a union type; e.g. returning `string` -> `string | string[]` in your responses)
 - Add a new required property
 - Set an existing **optional** property as required
 - Add or delete a security requirement
 - In some cases, changing a default
 - In some cases, _behavioral_ changes might form part of your contract

#### Non-breaking changes to HTTP APIs include
 - Adding a new **optional** request parameter
 - Expanding the types of input parameters, going from `string` -> `string | string[]` in requests
 - Adding a new **optional** response property
 - Relaxing request validation requirements: e.g. going from `schema.string({ minLength: 10 })` -> `schema.string()`

:::{note} Do not break clients!
A public HTTP API should never cause a client to break. Not without a long deprecation period and a ready alternative.

  Even `Technical Preview` HTTP APIs should consider graceful paths for changes when possible.

  Linus Torvalds famously said of Kernel development: "WE DO NOT BREAK USERSPACE!". We should adopt this kind of rigor and empathy when working with our _public_ HTTP APIs and always prioritize finding ways to avoid breaking our APIs.
:::

## Internal vs Public APIs

Internal HTTP APIs are only used by code Elastic owns, like the UI. By default, when you register a new HTTP API it will be classified as `internal`. For example, this API is internal:

```typescript
router.get({ path: '/api/foos' ... }, async () => {...})
```

You can make an HTTP API public by changing the `access` setting to `public`:

```typescript
router.get({ path: '/api/foos', options: { access: 'public' } }, async () => {...})
```

See the principle regarding [commitment](#commitment) before making APIs public!

### Do not access another plugin's REST API directly from plugin code

Plugins should not attempt to directly access the REST APIs created by another plugin. The plugin author who registered the public REST API should provide access to it via functionality on the plugin lifecycle contract. Accessing functionality through a client side plugin contract provides more type-safety compared to calling the REST API directly. Never attempt to call a server-side REST API if you are already on the server-side. It will not work. This should also be avoided in any code provided within a common folder.

## Infrastructure-as-Code

All public APIs should endeavour to be compatible with Infrastructure-as-Code (IaC) tools like Terraform. There may be merit in further optimizations for IaC use cases depending on your API.

For additional guidance, refer to the [Guidelines for Terraform friendly HTTP APIs](./guidelines-for-terraform-friendly-http-apis.md) if you would like to support an Infrastructure-as-Code (IaC) use case.

## Structure and conventions

### Think in terms of resources

Your HTTP APIs should describe REST-like actions (GET, POST, DELETE, etc.) against resources not remote procedures like: executeJob.

✅ Preferred: REST-like actions against resources

```
GET    /api/alerting/rule/{id}     # Kibana Alerting API
POST   /api/alerting/rule/{id}     # Create rule
PUT    /api/alerting/rule/{id}     # Update rule
DELETE /api/alerting/rule/{id}     # Delete rule
```

⚠️ Avoid: action-style endpoints

```
POST /api/executeJob
POST /api/processSpaceUpdate
POST /api/triggerIndexRebalance
```

### Implement complete CRUD operations

For every resource type, implement these HTTP endpoints:

```
GET    /api/my_domain/my_resources/{id}         # Read - retrieve an existing resource
POST   /api/my_domain/my_resources              # Create - create a new resource
PUT    /api/my_domain/my_resources/{id}         # Update - update an existing resource
DELETE /api/my_domain/my_resources/{id}         # Delete - remove an existing resource
GET    /api/my_domain/my_resources              # List - retrieve all resources (with pagination)
```

You can optionally create a search endpoint like the following:

```
POST   /api/my_domain/my_resources/_search              # Search across resources
{
  <search inputs>
}
```

### Path

**Use snake case**

`/api/my_domain/my_api` ✅

`/api/my-domain/my-api` ❌
`/api/myDomain/myApi` ❌

**Should not contain version numbers**

`/api/my_domain/my_api` ✅

`/api/my_domain/my_api/v1` ❌

See the section on [versioning](#versioning) for more details.

**Prefix public APIs with `/api/<domain>`**

`/api/security/roles` ✅

`/roles` ❌
`/api/roles` ❌

**Prefix internal APIs with `/internal/<domain>`**

`/internal/security/roles` ✅

`/roles` ❌
`/internal/roles` ❌

**Choosing a `<domain>` name**

Domain name pluralisation is case dependent, but the most common pattern in Kibana is to pluralize.

Additionally, domains are strongly encouraged because of Kibana's size, but not a hard requirement. For example:

❌ Do not choose a domain name that is the same as the resource. For example:

```
/api/files/files
```

✅ Rather choose another domain name

```
/api/storage/files
```

...or consider not using a domain name in certain cases:

```
/api/status
```

**Pluralize collection names**

`PUT /api/my_domain/my_resources/{id}` ✅

`PUT /api/my_domain/my_resource/{id}` ❌

**Prefix actions against resource collections with `_`**

Sometimes we want to designate `POST` action against a resource:

```
POST /api/my_domain/my_resources/_bulk_delete
```

Some common actions include:

- `_search`
- `_bulk_create`
- `_bulk_delete`
- `_bulk_update`

The fewer `_<action>` style APIs, the more user-friendly your APIs will be.

**Use `{id}` in the path when...**

```
GET    /api/my_resource/{id}
PUT    /api/my_resource/{id}
PATCH  /api/my_resource/{id}
DELETE /api/my_resource/{id}
POST   /api/my_resource
```

Typically `POST` does not contain a resource ID because it should always result in a new resource. Optionally, API users can specify an ID for a resource using `PUT` that will do an upsert.

For other path parameters it is recommended to take a conservative approach: do not put too much in the path, it is a character limited input!

### Methods

**Side-effects**

A side-effect is the result of some action that will (or would) alter server state. Different methods have different expections with respect to side-effects:

* `GET` **should not** have side-effects
* `PATCH`, `PUT` and `DELETE` **should** have side-effects
* `POST` **should** have side-effects (like creating some resource, read on!)

**Same method, same result?**

This is sometimes referred to as _idempotency_. It is related to side-effects, but not quite the same thing. Idempotency is a **very important** to consider when designing HTTP APIs.

Imagine we were to run the following methods 1000x over:

* `GET` always results in the same _server state_
* `PUT` always results in the same _server state_ (returns 409 after the first request)
* `DELETE` always results in the same _server state_ (returns 404 after the first request)
* `PATCH` always results in the same _server state_ for the same input! For example: `PATCH /api/coolstore/order/{id} { expected_delivery: "ASAP!" }` will result in the same state.

However...

* `POST` should result in a different _server state_. For example: `POST /api/coolstore/order` will result in a new order each time!

**GET does not accept a body**

`GET /api/my_domain/my_resources/{id}` ✅

`GET /api/my_domain/my_resources/{id} { body: { params } }` ❌

**POST is (mostly) for creating a resource**

Sometimes `POST` can be used for an action against a resource or for actions like a `GET` but with a body. In this case, `POST` may be both side-effect free and idempotent! In most cases it will not be because your request will open a PIT: see [pagination and sorting](#pagination-and-sorting).

If you expect you need to support a lot of input for searching or listing resources you can use `POST` and `_search` for this purpose:

```
POST /api/my_domain/my_resources/_search
{
  search_after: "<a_really_long_id>",
  size: 10000
}
```

**PUT and PATCH are for updating a resource**

`PUT` must _create_ the resource if it does not exist and expect the **full** resource in the body of the call.

`PATCH` must _update_ the resource if it does not exist and expect a **partial** resource in the body of the call.

**DELETE is for deleting a resource**

Delete can return a simple response instead of the full resource:

```
DELETE /api/my_domain/my_resources/{id}
# -> 204 No content
```

**Stick to simple methods**

`GET`, `POST`, `PUT`, `PATCH`, `DELETE` are often enough to cover almost all cases. If you are considering `HEAD` or some other method make sure you have a good justification for your HTTP API.

### Path and query parameters

**Use snake case**

`/api/my_api/{my_id}` ✅

`/api/my_api/{myId}` ❌

`/api/my_api?snake_case=true` ✅

`/api/my_api?camelCase=false` ❌

**BEWARE: path and query parameters should not expect values of unknown length**

Accepting very long strings (in excess of 200 characters per parameter) in path or query parameters can cause issues for HTTP servers that limit the byte length of certain parts of requests. HTTP servers may limit request header sections to as little as 4096 bytes!

Use a body parameter for long strings instead and use validation to limit a path param's length if you have an idea of max length.

### Bodies

**Contain snake case keys**

```
POST /api/my_domain/my_api
{
  "snake_case": true
}
```

:::{note} Snakes and camels
In Kibana's TypeScript code it is considered a formatting issue to use snake case variable names. This clashes with the convenient [object destructuring assignments](https://www.typescriptlang.org/docs/handbook/variable-declarations.html#object-destructuring) that are common throughout the codebase.

  If you would like to use object destructuring in your code:
  - Convert to camel case by renaming inline `const { snake_case: camelCase } = body`
  - Consider opting-out of this eslint rule about naming conventions `// eslint-disable-next-line @typescript-eslint/naming-convention` or disable the lint rule for a section `/* eslint-disable @typescript-eslint/naming-convention */` and re-enabling with `/* eslint-enable ... */`.
:::

**Use JSON**

Both requests and responses should be `application/json`, unless there is a good justification to use a different media type like when you're serving a file to a client.

**Resource shapes should be consistent**

`GET`, `PUT`, `POST` should return the same shape of data for the same resource.

`GET /api/my_domain/my_resources/{id}` <br />
=> <br />
`{ "id": "1", "name": "My resource" }`<br /><br />

`POST /api/my_domain/my_resources/{id} { "id": "1", "name": "My resource" }`<br />
=> <br />
`{ "id": "1", "name": "My resource" }`<br /><br />

`GET /api/my_domain/my_resources` <br />
=> <br />
`{ items: [{ "id": "1", "name": "My resource" }], page: 1, per_page: 10, total: 100 }`

See the section on data modelling for more guidance.

### Defaults

**Should be used to promote ease of use**

Choose sensible defaults. When uncertain, ask API callers to make informed decisions based on [documentation](#documentation).

**Should not be changed lightly**

Changing the value of a default may, in some cases, have a devastating result similar to a breaking change.

**Should be returned in the response (most of the time)**

Public API configurable defaults should be returned in the response. Internal defaults do not need to be returned.
Refer to [Terraform](./guidelines-for-terraform-friendly-http-apis.md#return-as-much-as-you-can-and-handle-defaults-carefully) to learn more.

### Validation

**Runtime validation should be as narrow as feasible. Arrays should always have a defined upper bound.**

`schema.object({ id: schema.string({ minLength: 32, maxLength: 32 }) })` ✅

`schema.object({ id: schema.string() })` ❌

`schema.object({ names: array(schema.string({ minLength: 1, maxLength: 32 }), { maxSize: 10 } })` ✅

`schema.object({ names: array(schema.string({ minLength: 1, maxLength: 32 }), { } })` ❌

**It is easier to relax requirements than tighten them up**

If you are in doubt, rather go with stricter validation. Making a requirement more lax if needed is never a breaking change!

### Headers

**Should not be used to specify behavior**

Outside of exceptional cases, you should always use parameters, query parameters or the body of the request to specify behavior.

### Response codes

**Should always be used as close as possible to their semantic meaning**

See the [MDN docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status).

### Pagination and sorting

:::{note}
For objects stored in ES (which is the case for most Kibana HTTP API resources) you can use [ES pagination API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results) from your route handler.
:::

**Page-based request**

`GET /api/my_domain/my_resources?page=1&per_page=10`

**Page-based response**

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "size": 10
}
```

**Cursor based request**

:::{warning} Required for 10,000 or more
You will need to implement cursor-based pagination for paging across resources that exceed 10,000 instances in ES. See [the docs](https://www.elastic.co/docs/reference/elasticsearch/index-settings/index-modules#index-max-result-window) and the [ES search after API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results#search-after).
:::

`GET /api/my_domain/my_resources?pit_id=abc&search_after=valueA,valueB&size=10`

**OR** if you have reserved `POST` and expect sophisticated search use cases with a lot of inputs:

```
POST /api/my_domain/my_resources
{
  "pit_id": "abc",
  "search_after": ["valueA", 123],
  "size": 10,
}
```

Where `pit_id` is the PIT ID and `["valueA", 123]` are the sort values that identify the last hit from ES ([docs](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results#search-after)).

**Cursor based response**

```json
{
  "items": [...],
  "total": 100,
  "pit_id": "abc",
  "search_after": ["valueA", 123], // The next search_after value
  "size": 10
}
```

**Pagination requires sorting**

Carefully decide a default for sorting resources. It is possible to accept a custom
set of additional values for sorting, but this may not be needed. Adding this later is a non breaking change!

Specify sorting in the query parameters like:

```
GET /api/my_domain/my_resources?sort=field_name,-other_name
```

Where `field_name` is the name of the field to sort by in ascending order and `-other_name` is the name of the field to sort by in descending order.

### Avoid polling style APIs

Prefer APIs that process their requests within the lifecycle of a single request. If your API handler is doing actions that take longer than a typical request (30s), consider using a background task or job and offer clients a way to monitor progress. Either by `GET`ing the resource or some special polling API.

:::{warning} Consider Infrastructure-as-Code
Polling style APIs create additional complexity for all API callers, but especially for IaC use cases that are typically not as sophisticated in their execution like Terraform.
:::

### Filtering

`GET /api/my_domain/my_resources?filter=field_name:value`

Use [simple KQL](https://www.elastic.co/docs/explore-analyze/query-filter/languages/kql) to cover most of your filtering needs.

Utilities for working with KQL queries are available in the `@kbn/es-query` package.

:::{warning} Beware of leaky filters!
Do not let API consumers directly query based on the schema of your database (saved) objects. This is leaking implementation detail that will make your API unversionable!

  `cool_field: "value" AND other_field: "value"` : ✅

  `internalFieldName: "value" AND otherField: "value"` : ❌

  Take care in [documenting](#documentation) the filtering options available in a KQL filter. In your server-side code you must always be prepared to translate field names provided in a KQL filter to match the database column names you want API users to filter on. If API users try to filter on a field that does not exist, you should return a `400` error.
:::

### Errors

4xx or 5xx status code with a body:

```json
{
  ok: false,
  error: "A short summary of what went wrong",
  message: "A human-friendly explanation about what went wrong and how to fix it",
  attributes: {
    /* Optional additional attributes */
  },
}
```

#### Avoid directly returning errors from Elasticsearch

In most cases you should add some specific context to your errors to help users self-service the problem. Returning ES errors without context rarely accomplishes this and will likely create future support load for your team. Try to think of your future selves when crafting error messages!

### Bulk operations

Resources collections with 10,000+ instances should consider supporting bulk operations.

```
POST /api/my_domain/my_resources/_bulk
```

That accepts an array of operations:

```json
[
  { "create": { "id": "1", "name": "New resource" } },
  { "update": { "id": "2", "name": "Updated resource" } },
  { "delete": { "id": "1" } },
]
```

And either returns a task ID for tracking long running executions or a response with the result of the bulk operation.

:::{warning} Bulk operations against Elasticsearch are not atomic
Bulk operations are not atomic. If an operation fails, the previous operations will not be rolled back automatically.

  Bulk operations add complexity, ensure that your use case merits the added complexity. Reach out to the Kibana Core team for more guidance.
:::

If you are considering offering this API consider impacts on [IaC use cases](./guidelines-for-terraform-friendly-http-apis.md).

### Observability

Consider common error states your API might face, as well the information you might need to answer unexpected questions about the behavior of the API. To this end, creating a dedicated logger is be a good idea. Something like `const log = logger.get('myApi')` will emit logs for your API that can be easily searched for in overview clusters.

:::{warning} Default to `debug`
Carefully choose the log level of any logs you emit. `info` level logs can generate a lot of log noise for Kibana operators. This increases costs and often provides little value. Rather stick to `debug` logs and scope Kibana logs using configuration in `kibana.dev.yml` when developing locally:

```yaml
  logging.loggers:
    - name: <your-logger-name>
      level: debug
```
:::

For questions about APM and telemetry please reach out to the Core team.

#### Telemetry
###LG TODO check in on https://github.com/elastic/kibana/issues/112291#issuecomment-4238886978
Every team should be collecting telemetry metrics on it's public API usage. This will be important for knowing when it's safe to make breaking changes. The Core team will be looking into ways to make this easier and an automatic part of registration (see [#112291](https://github.com/elastic/kibana/issues/112291)).

#### APM

{{kib}} server and client are instrumented with APM node and APM RUM clients respectively, tracking several types of transactions by default, such as `page-load`, `request`, etc.
You may introduce custom transactions. Please refer to the [APM documentation](https://www.elastic.co/guide/en/apm/get-started/current/index.html) and follow these guidelines when doing so:

- Use dashed syntax for transaction types and names: `my-transaction-type` and `my-transaction-name`
- [Refrain from adding too many custom labels](https://www.elastic.co/guide/en/apm/get-started/current/metadata.html)

### Security

User authentication is handled globally for all routes (whether public, internal or "Tech Preview"). However, as an API desiginer you still need make some decisions about the appropriate authentication and authorization for your API (see [API authorization docs](../../key-concepts/security/api-authorization.md)). This depends on the actions your API performs.

:::{warning} Do not expose sensitive information
Carefully consider the information you return from or log in your API handler, whether it's a successful response or an error. **Do not expose sensitive information**. This includes information that could be used to identify users, reveal sensitive file paths, internal resources, or even leak credentials. We have a separate [audit logger](../../key-concepts/security/audit-logging.md) that you can use to log sensitive information about user actions.
:::

Assigning specific privilege requirements to your API will surface them in the code-generated OpenAPI spec. See the [documentation section](#documentation).

_**If you have any hesitation or questions please reach out to the Kibana security team!**_

### Performance

**Save the event loop!**

When you anticipate CPU or memory intensive operations consider that Node.js uses a single-threaded event loop. Keep this shared resource [unblocked](https://github.com/elastic/kibana/blob/9edce03a0510c32c1d210e0f3d1bea46c3b71143/src/core/packages/saved-objects/migration-server-internal/src/core/migrate_raw_docs.ts#L160-L175) and maintain stable memory pressure by chunking data loads from Elasticsearch rather than loading everything at once.

**Security**

Do not attempt to improve performance by caching data dependent on user permissions in Kibana route handlers. User permissions can change and you cannot guarantee that the cache will be up to date!

### Special data formats

**Dates**
Use [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) in UTC. This is the default representation in Node.js.

**Durations**
Can be specified in the [Elasticsearch date math](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/common-options#date-math) format, for ex. `1m` for 1 minute if you want your duration to be relative to `now` where the full expression would be `now-1m`. See the `@elastic/datemath` available in Kibana for more details about the capabilities available.

Alternatively, use 2 numbers in milliseconds or [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) date strings.

## Documentation

**Public HTTP APIs must have reference documentation**

See our current reference documentation [here](https://www.elastic.co/docs/api/doc/kibana/). This is compiled from our OpenAPI spec.

See [this tutorial](../../tutorials/generating-oas-for-http-apis.md) about the code-first approach to generating OpenAPI spec available in Kibana.

Every public API should be documented inside the [docs/api](https://github.com/elastic/kibana/tree/main/docs/api) folder in asciidoc (this content will eventually be migrated to mdx to support the new docs system). If a public REST API is undocumented, you should either document it, or make it internal.

### Release tags

Every public API should have a release tag specified at the top of its documentation page. Release tags are not applicable to internal APIs, as we make no guarantees on those.

| Type | Description | Documentation | Asciidoc Tag |
| -----| ------------| ------------- | ------------ |
| Undocumented | Every public API should be documented, but if it isn't, we make no guarantees about it. These need to be eliminated and should become internal or documented. | | |
| Experimental | A public API that may break or be removed at any time. | experimental[] | |
| Beta | A public API that we make a best effort not to break or remove. However, there are no guarantees. | beta[] | |
| Stable | No breaking changes outside of a Major | stable[] | |
| Deprecated | Do not use, will be removed. | deprecated[] | |

Every public API should have a release tag specified using the appropriate documentation release tag above. If you do this, the docs system will provide a pop up explaining the conditions. If an API is not marked, it should be considered experimental.

## Versioning

```bash
# An example request to a versioned API
curl -v -uelastic:changeme 'http://localhost:5601/api/synthetics/monitors' \
  -H 'elastic-api-version: 2023-10-31'
```

Kibana's public HTTP APIs in our Serverless offering are versioned with the entire Elastic organization using date-based versioning. The date indicates the last breaking change. For example: version `2023-10-31` is saying "the last breaking change was at the end of October 2023".

:::{warning} New public date versions will be very sparse
Do not build your public HTTP APIs with the idea you will be able to change them quickly using versions! Due to the MASSIVE surface area, new date string versions are not introduced lightly and must go through rigorous review and justification.
:::

:::{note} What about Kibana public APIs that are not explicitly versioned?
You may see some routes using `router.get` instead of `router.versioned.get`. Routes registered in the former fashion are assumed to be part of the oldest, `2023-10-31` API surface area and will be included as-is in future version surface areas as well, unless they are explicitly versioned. This was done to prevent the need for a wide-spread refactor.
:::

Kibana's internal HTTP APIs can be versioned too, but for a very different purpose! With serverless, we continually roll out code changes _without_ asking browsers to refresh. That means, for a time, browser clients might expect old internal API behavior. It is up to route authors and UI developers to consider how to handle breaking changes of internal routes. Note: you are free to version internal APIs at will to mitigate any unfortunate browser client breakages!

Please see the tutorial on [versioning HTTP APIs](../../tutorials/versioning-http-apis.md) for more details.

## Advanced concepts

###  Data modelling

If your API needs to support multiple data types for the same logical concept, consider these approaches:

1. **Use separate, clearly named fields**
```json
{
  "group_by_field": "field_name",      // Single field
  "group_by_fields": ["field1", "field2"]  // Multiple fields
}
```

2. **Use the most flexible type from the start**
```json
{
  "group_by": ["field_name"]  // Always an array, even for single values
}
```

**When you MUST support poorly defined types**

Poorly defined data structures in your requests result in a terrible user experience. But if poorly defined structure or types are unavoidable due to legacy design, you can use "JSON blobs" to hold such data structures:

```json
{
  "id": "abc",
  "data": {...} // Kludge of data
}
```

And validation should be super lax `schema.object({}, { unknowns: 'allow' })`.

### Concurrency controls

Between refreshing state and applying changes, there’s a gap where someone could modify your API. Generally it's ok to take the approach of last-write-wins.

If you have to consider concurrency control, support mechanisms like ETags and checksums, and the \`version\` property on saved objects.