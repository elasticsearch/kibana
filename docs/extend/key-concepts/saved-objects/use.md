---
navigation_title: CRUD operations
---

# Using Saved Objects services [saved-objects-use]

This page describes how to perform CRUD operations (create, get, search, update, delete) on **Saved Object** instances of a given type from server-side plugin code. Use the Saved Objects service exposed by Core; do **not** use the HTTP APIs under `/api/saved_objects/`, which are deprecated and will be removed.

## Do not use the Saved Objects HTTP API

The HTTP routes registered under `/api/saved_objects/` (and `/internal/saved_objects/` for migration and cleanup) are **deprecated**. Plugins must not rely on them for create, get, find, update, delete, bulk operations, export, or import. Use the Core Saved Objects service from your plugin's request handlers or other server-side code instead.

## How plugins access the Saved Objects service

Core exposes the Saved Objects service to plugins as `core.savedObjects`:

* In your plugin's `setup(core, plugins)` hook, `core.savedObjects` is **SavedObjectsServiceSetup**. Use it to register types (`registerType`), set client factory, and configure extensions. It does not provide clients or repositories.
* In your plugin's `start(core, plugins)` hook, `core.savedObjects` is **SavedObjectsServiceStart**. This interface is defined in `src/core/packages/saved-objects/server/src/contracts.ts`. Use it to obtain a scoped or internal client, or a scoped or internal repository, and to perform CRUD operations on Saved Objects.

You need the **start** contract to create, read, update, or delete Saved Object documents. Typically you obtain a client (or repository) per request inside a route handler using the request from the handler.

## Start contract: clients and repositories [saved-objects-service-start]

**SavedObjectsServiceStart** (contracts.ts) exposes four methods. The first two return an object that implements **SavedObjectsClientContract** (defined in `src/core/packages/saved-objects/api-server/src/saved_objects_client.ts`). The other two return an object that implements **ISavedObjectsRepository** (defined in `src/core/packages/saved-objects/api-server/src/saved_objects_repository.ts`).

| Method | Returns | Scoped to request? | Use when |
|--------|--------|--------------------|----------|
| `getScopedClient(req, options?)` | Object implementing `SavedObjectsClientContract` | Yes (user from `req`) | Normal user-driven operations; respects security and spaces. |
| `getUnsafeInternalClient(options?)` | Object implementing `SavedObjectsClientContract` | No (internal user) | System-level operations; no user context; security extension excluded. |
| `createScopedRepository(req, includedHiddenTypes?, extensions?)` | Object implementing `ISavedObjectsRepository` | Yes | You need repository-only methods (e.g. `incrementCounter`, `deleteByNamespace`) with request context. |
| `createInternalRepository(includedHiddenTypes?, extensions?)` | Object implementing `ISavedObjectsRepository` | No | Internal operations needing repository-only methods, no user context. |

### getScopedClient

Creates a **Saved Objects client** scoped to the given `KibanaRequest`. The client uses the requesting user's credentials and applies security and spaces extensions. Use this for all user-facing operations (e.g. in HTTP route handlers).

* **Options:** `SavedObjectsClientProviderOptions` — `includedHiddenTypes?: string[]` to allow access to hidden types, `excludedExtensions?: string[]` to disable specific extensions for this client.
* **When to use:** Default choice for request handlers. Prefer this over creating a repository unless you need methods only available on the repository.

### getUnsafeInternalClient

Creates a **Saved Objects client** that uses the **internal** Kibana user. It does not run with a specific user context; the security extension is always excluded so there is no user-based filtering. Other extensions (encryption, spaces) can still be applied. Use only for system-level operations (e.g. background jobs, migrations, or when no request is available).

* **Options:** `SavedObjectsClientProviderOptions` — `includedHiddenTypes?: string[]`, `excludedExtensions?: string[]`. The security extension is excluded regardless.
* **When to use:** When you must perform Saved Object operations without a request or with system privileges. Do not use with a fake request to bypass security.

::::{important}
The internal client operates in the `default` space by default. To query Saved Objects across **all** spaces (for example, during a background cleanup job), pass `namespaces: ['*']` in the `find` options:

```ts
const client = savedObjectsStart.getUnsafeInternalClient();
const result = await client.find({ type: 'my-type', namespaces: ['*'] });
```

Without `namespaces: ['*']`, the query is silently restricted to the `default` space and will miss objects in other spaces.
::::

### createScopedRepository

Creates a **repository** scoped to the given request. The repository has all client methods plus a few extra operations (see [Working with the SavedObjectsRepository](#working-with-the-savedobjectsrepository)). Use only when you need those repository-only methods with request context.

* **Parameters:** `req`, optional `includedHiddenTypes`, optional `extensions`.
* **When to use:** When you need `incrementCounter`, `deleteByNamespace`, or `find` with internal options. Prefer `getScopedClient` otherwise.

### createInternalRepository

Creates a **repository** using the internal user, with no request context. Same as `getUnsafeInternalClient` in terms of scoping (system-level, no user), but returns a repository so you can use repository-only methods.

* **Parameters:** Optional `includedHiddenTypes`, optional `extensions`.
* **When to use:** When you need repository-only methods for internal operations (e.g. usage collection with `incrementCounter`). Prefer `getUnsafeInternalClient` if the client API is enough.

## Choosing between client and repository

* **Use the client** (`getScopedClient` or `getUnsafeInternalClient`) for almost all use cases: CRUD, find, search, resolve, bulk operations, point-in-time finder, updateObjectsSpaces, removeReferencesTo, and access control (changeOwnership, changeAccessMode). The client is the recommended API and covers the vast majority of plugin needs.
* **Use the repository** (`createScopedRepository` or `createInternalRepository`) only when you need one of the following:
  * **`incrementCounter`** — Atomically increment numeric fields (e.g. for usage collection). The client does not expose this.
  * **`deleteByNamespace`** — Delete all Saved Objects in a given space (e.g. when deleting a space). The client does not expose this.
  * **`find` with internal options** — Advanced cases where you need to run find with extensions disabled (internal use; rarely needed by plugins).

If you are not sure, use the client. Prefer the **scoped** client for request handlers and the **internal** client for background or system operations.

::::{warning}
Do not manually instantiate `SavedObjectsClient` (or `SavedObjectsRepository`) by passing a non-default or custom repository directly. Clients obtained this way bypass the wrappers that provide security, spaces isolation, and encrypted saved object protections. Always obtain a client or repository through the methods exposed by [`SavedObjectsServiceStart`](#saved-objects-service-start).
::::

---

## Security considerations [saved-objects-use-security]

### Aggregation security [saved-objects-use-aggregation-security]

When using `find` or `search` with aggregations, be aware that certain {{es}} aggregation types (for example, `terms` on a field that is only partially visible to the user) can bypass query restrictions and return data from documents the user should not be able to see.

To avoid exposing data unintentionally:

* Prefer aggregations on fields that are directly filterable in the current query.
* Avoid `terms` aggregations on fields whose values could come from documents outside the user's access scope.
* Review the {{es}} documentation on [document-level security and aggregations](docs-content://deploy-manage/users-roles/cluster-or-deployment-auth/controlling-access-at-document-field-level.md#document-level-security) before using aggregations in a security-sensitive context.

---

## Working with the SavedObjectsClient

**getScopedClient** and **getUnsafeInternalClient** return an object that implements **SavedObjectsClientContract** (see `src/core/packages/saved-objects/api-server/src/saved_objects_client.ts`). That interface is the main API for reading and writing Saved Objects from a plugin. Use it in route handlers and services whenever you have a request (scoped client) or need system-level access (internal client).

### Operations

* **Create:** `create(type, attributes, options?)`, `bulkCreate(objects, options?)`, `checkConflicts(objects, options?)`
* **Read:** `get(type, id, options?)`, `bulkGet(objects, options?)`, `resolve(type, id, options?)`, `bulkResolve(objects, options?)`, [`esql`](./esql.md)
* **Search / list:** `find(options)`, `search(options)` (raw {{es}}-style search; use with care), `createPointInTimeFinder(findOptions, deps?)` for large result sets
* **Update:** `update(type, id, attributes, options?)`, `bulkUpdate(objects, options?)`
* **Delete:** `delete(type, id, options?)`, `bulkDelete(objects, options?)`
* **Spaces and references:** `updateObjectsSpaces(objects, spacesToAdd, spacesToRemove, options?)`, `removeReferencesTo(type, id, options?)`, `collectMultiNamespaceReferences(objects, options?)`
* **Point-in-time:** `openPointInTimeForType(type, options?)`, `closePointInTime(id, options?)`
* **Access control:** `changeOwnership(objects, options)`, `changeAccessMode(objects, options)` (when the type supports access control)
* **Convenience:** `getCurrentNamespace()`, `asScopedToNamespace(namespace)` (returns a new client scoped to that namespace)

Options typically include `namespace` for space-scoped types. Create options can include `references`, `overwrite`, and `id`. See the type definitions for full option shapes.

### Examples

**Route handler: scoped client (recommended)**

```ts
router.get(
  { path: '/api/my-plugin/dashboards', validate: false },
  async (context, req, res) => {
    const client = context.core.savedObjects.getClient();
    const { saved_objects } = await client.find({
      type: 'dashboard',
      perPage: 20,
    });
    return res.ok({ body: saved_objects });
  }
);
```

**Get, update, and delete**

```ts
const client = savedObjectsStart.getScopedClient(req);
const dashboard = await client.get('dashboard', id);
await client.update('dashboard', id, { title: 'New title' });
await client.delete('dashboard', id);
```

**Create with references**

```ts
const client = context.core.savedObjects.getClient();
const created = await client.create(
  'dashboard',
  { title: 'My Dashboard', panels: [{ visualizationRefName: 'vis1' }] },
  {
    references: [
      { id: 'vis-id-123', type: 'visualization', name: 'vis1' },
    ],
  }
);
```

**Accessing hidden types**

If your type is registered with `hidden: true`, pass it in `includedHiddenTypes`:

```ts
const client = savedObjectsStart.getScopedClient(req, {
  includedHiddenTypes: ['my-plugin-internal-type'],
});
const obj = await client.get('my-plugin-internal-type', id);
```

**Internal operation (no request)**

```ts
const client = savedObjectsStart.getUnsafeInternalClient({
  includedHiddenTypes: ['fleet-agent-policies'],
});
const result = await client.find({ type: 'fleet-agent-policies', perPage: 100 });
```

**Paging through large result sets with createPointInTimeFinder**

Use the point-in-time finder for server-side batch processing when you may exceed 1000 objects. Do not use it for request-response paging in multi-instance deployments (the finder is stateful).

```ts
const client = savedObjectsStart.getUnsafeInternalClient();
const finder = client.createPointInTimeFinder({
  type: 'visualization',
  perPage: 100,
});
try {
  for await (const response of finder.find()) {
    for (const obj of response.saved_objects) {
      // process obj
    }
  }
} finally {
  await finder.close();
}
```

Errors (e.g. not found, conflict) are thrown by the client. Use `SavedObjectsErrorHelpers` (e.g. `isNotFoundError(error)`) to classify and handle them.

---

## Working with the SavedObjectsRepository

**createScopedRepository** and **createInternalRepository** return an object that implements **ISavedObjectsRepository** (see `src/core/packages/saved-objects/api-server/src/saved_objects_repository.ts`). That interface exposes the same CRUD, find, search, resolve, bulk, point-in-time, and space/access-control methods as the client, plus a few **repository-only** methods. Use the repository only when you need those extra methods.

### Repository-only operations

* **`deleteByNamespace(namespace, options?)`** — Deletes all Saved Objects in the given namespace. Used when deleting a space. Not exposed on the client.
* **`incrementCounter(type, id, counterFields, options?)`** — Atomically increments one or more numeric fields; creates the document if it does not exist. Used for usage collection and metrics. Not exposed on the client. Options include `initialize` (set fields to 0 before incrementing) and `upsertAttributes` (attributes to set when creating the document).
* **`find(options, internalOptions?)`** — Same as the client’s `find`, but accepts an optional second argument `SavedObjectsFindInternalOptions` (e.g. `disableExtensions`) for internal callers that need to bypass extensions. Rarely needed by plugins.

### When to use the repository

* You need **`incrementCounter`** (e.g. usage collection, dashboard or feature counters).
* You need **`deleteByNamespace`** (e.g. space deletion flow).
* You have an advanced need for **`find` with internal options** (e.g. disabling extensions for a specific internal search).

Otherwise use the client.

### Examples

**Usage collection with incrementCounter**

Use an **internal** repository so counters are not tied to a user request. Ensure usage collection is best-effort and does not harm stability or user experience.

```ts
// In a plugin's start hook or a service that has savedObjectsStart
const repository = savedObjectsStart.createInternalRepository(
  ['my-plugin-usage-type']  // if your usage type is hidden
);
await repository.incrementCounter(
  'my-plugin-usage-type',
  'global',
  ['stats.apiCalls', 'stats.sampleDataInstalled'],
  { initialize: true }
);
await repository.incrementCounter('my-plugin-usage-type', 'global', ['stats.apiCalls']);
```

**Increment by a custom amount or with upsert**

```ts
const repository = savedObjectsStart.createInternalRepository();
await repository.incrementCounter(
  'dashboard_counter_type',
  'counter_id',
  [{ fieldName: 'stats.apiCalls', incrementBy: 4 }]
);
await repository.incrementCounter<{ appId: string }>(
  'dashboard_counter_type',
  'counter_id',
  ['stats.apiCalls'],
  { upsertAttributes: { appId: 'myId' } }
);
```

**Deleting all objects in a space (deleteByNamespace)**

Typically used by the Spaces plugin when a space is deleted. Use a **scoped** repository if the operation is tied to a request and authorization, or an **internal** repository for a system-level cleanup job.

```ts
const repository = savedObjectsStart.createInternalRepository();
const result = await repository.deleteByNamespace('space-id');
// result: { took, total, deleted, batches, ... }
```
