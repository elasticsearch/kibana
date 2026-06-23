# @kbn/occ

Optimistic concurrency control (OCC) for **raw Elasticsearch index documents**.

Inject `get` and `index` functions from your storage layer. `OccWriter` exposes three write paths that mirror Saved Objects `create` / `update(version?)`:

| Method | Read? | Retry on 409? | Use when |
|--------|-------|---------------|----------|
| `create` | No | No | New document (`op_type: create`) |
| `write` | No | No | Caller supplies `document` + `(ifSeqNo, ifPrimaryTerm)` |
| `readModifyWrite` | Yes | Yes (`maxRetries`, default `3`) | Merge inside `mutate` against each fresh read |

`create` and `write` are **optimistic** — no hidden read. `readModifyWrite` is read–modify–write with OCC on the index.

## When to use

Use `@kbn/occ` when you:

- Store entities in a **normal ES index** (not Saved Objects)
- Perform **read–modify–write on one `_id`**
- Have **concurrent writers** where blind indexing would cause lost updates

Domain-specific lookup rules (spaces, soft deletes, routing, aliases) belong in your **`get` / `index` adapters**, not in this package.

## API

### Dependencies

```typescript
import { OccWriter } from '@kbn/occ';
import type { OccDocument, OccWriterDeps } from '@kbn/occ';

interface MyDocument {
  title: string;
  updated_at: string;
}

const writer = new OccWriter<MyDocument>({
  // Required for readModifyWrite only
  get: async (id): Promise<OccDocument<MyDocument> | null> => {
    const hit = await client.get({ id, seq_no_primary_term: true });
    if (!hit._source) return null;
    return {
      id,
      source: hit._source as MyDocument,
      occ: { seqNo: hit._seq_no!, primaryTerm: hit._primary_term! },
    };
  },
  index: async ({ id, document, create, ifSeqNo, ifPrimaryTerm }) => {
    const response = await client.index({
      id,
      document,
      ...(create ? { op_type: 'create' as const } : {}),
      ...(ifSeqNo != null && ifPrimaryTerm != null
        ? { if_seq_no: ifSeqNo, if_primary_term: ifPrimaryTerm }
        : {}),
    });
    return { seqNo: response._seq_no!, primaryTerm: response._primary_term! };
  },
  maxRetries: 3,       // optional, default 3
  retryDelayMs: 100,   // optional, default 100
});
```

`get` must return `seq_no` and `primary_term` from Elasticsearch (`get` / `search` with `seq_no_primary_term: true`).

### `create({ id, document })`

Single attempt with `op_type: create`. A `409` means the id already exists (`OccConflictError`). No retry — handle id-collision races at the call site.

### `write({ id, document, ifSeqNo, ifPrimaryTerm })`

Conditional index with caller-supplied version metadata. No read, no retry. A `409` means the document changed since the caller read it.

Same semantics as Saved Objects `update(..., { version })` with `maxAttempts = 1`: the caller owns re-read and re-prepare.

### `readModifyWrite({ id, mutate })`

Read → `mutate(existing)` → index with `if_seq_no` / `if_primary_term`. On `409`, re-read and run `mutate` again up to `maxRetries`.

Same role as Saved Objects `update(...)` **without** an explicit `version` (default `retryOnConflict` loop).

Keep `mutate` **pure** with respect to the `existing` source passed in. Hoist work that does not depend on fresh state (validation, parsing request payload) **outside** `mutate` so retries do not repeat it unnecessarily.

## Choosing a method

| Scenario | Method |
|----------|--------|
| Insert a new doc; fail if id exists | `create` |
| Caller already read the doc and has `(seqNo, primaryTerm)` | `write` |
| Merge request fields into current stored state | `readModifyWrite` |
| Outer loop re-reads and re-prepares on conflict | `write` (or `create`) + caller retry |

## Example: concurrent updates

Two writers update the same document. Without OCC, last-write-wins drops the other change.

```typescript
await writer.readModifyWrite({
  id: 'doc-1',
  mutate: (existing) => ({
    ...existing,
    title: requestBody.title,
    updated_at: new Date().toISOString(),
  }),
});
```

## Example: thin factory over your storage service

Keep ES details in one adapter; call sites stay domain-focused.

```typescript
export const createMyOccWriter = ({ storage, logger }: { storage: MyStorage; logger: Logger }) =>
  new OccWriter<MyDocument>({
    get: async (id) => {
      const doc = await storage.getWithVersion(id);
      return doc
        ? { id, source: doc.source, occ: { seqNo: doc.seqNo, primaryTerm: doc.primaryTerm } }
        : null;
    },
    index: ({ id, document, create, ifSeqNo, ifPrimaryTerm }) =>
      storage.index(id, document, { create, ifSeqNo, ifPrimaryTerm }),
    logger,
  });

const writer = createMyOccWriter({ storage, logger });

// Merge update
await writer.readModifyWrite({
  id,
  mutate: (existing) => ({ ...existing, ...patch }),
});

// Optimistic update — caller already has version metadata from a prior read
await writer.write({
  id,
  document: prepared,
  ifSeqNo: existing.seqNo,
  ifPrimaryTerm: existing.primaryTerm,
});

// Create
await writer.create({ id, document: prepared });
```

Lookup filters, tenancy, and soft-delete semantics live in `storage.getWithVersion` — not in `OccWriter`.

## Errors

| Export | Use |
|--------|-----|
| `OccConflictError` | Thrown by `OccWriter` on exhausted or non-retryable conflicts |
| `isOccConflictError` | After `OccWriter` calls (`instanceof`) |
| `isElasticsearchWriteConflict` | Raw ES/client errors before wrapping (HTTP `409`) |

Map `OccConflictError` to your domain error at the call site when needed.

## When not to use

### Saved Objects — OCC is built in

```typescript
// ✅ Saved Objects
await savedObjectsClient.update('dashboard', id, { title: 'New title' }, {
  version: existing.version,
  retryOnConflict: 3,
});

// ❌ Don't wrap SO storage in OccWriter
```

### Append-only or last-write-wins

Logs, audit events, heartbeats, and ephemeral status snapshots do not need read–merge–write. Index directly.

### Scripted partial updates

When you only touch one field or increment a counter, ES `update` with a script may be simpler than full-document merge.

### Bulk or multi-document writes

`OccWriter` handles **one `_id`**. For many documents:

1. **Small batches** — loop `readModifyWrite` per id (simplest).
2. **Large batches** — bulk index with per-item `if_seq_no` / `if_primary_term`, then retry only `409` items after refreshing version metadata (batch `search` or `mget` with `seq_no_primary_term`).

`@kbn/occ` does not ship a bulk helper; compose the same primitives at the domain layer.

```typescript
// Bulk with per-item OCC (simplified)
const operations = hits.map((hit) => ({
  index: {
    _id: hit._id!,
    if_seq_no: hit._seq_no,
    if_primary_term: hit._primary_term,
    document: mutate(hit._source),
  },
}));

const bulkResponse = await client.bulk({ operations, refresh: true });
// Retry conflict ids after re-reading fresh seq_no / primary_term
```

## Design notes

- **`readModifyWrite` retries re-run the entire `mutate`** against a fresh read — do not rely on closed-over stale state inside `mutate`.
- **`create` and `write` do not retry** — the caller owns re-read + re-prepare on `OccConflictError`.
- **Validation, version history, and business rules** stay outside this package.
- Defaults: `DEFAULT_MAX_RETRIES = 3`, `DEFAULT_RETRY_DELAY_MS = 100`, `OCC_CONFLICT_STATUS_CODE = 409`.

## Domain integrations

Reference implementations live in consuming plugins (e.g. workflows OCC wiring and bulk retry patterns). See domain `dev_docs` in those plugins for call-site-specific `get` filters and entry-point tables.
