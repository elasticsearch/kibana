# OCC writes in workflows_management

Workflow documents live in a raw elasticsearch index (via `@kbn/storage-adapter`). Concurrent writers use optimistic concurrency control (OCC) so updates merge against fresh state instead of last-write-wins.

Platform primitives and bulk patterns: [`@kbn/occ` README](../../../../packages/shared/kbn-occ/README.md).

## Entry points

| Path | CRUD method | `OccWriter` method | Reads before write? | Retries | Version |
|------|-------------|-------------------|---------------------|---------|---------|
| `WorkflowCrudService.updateWorkflow` | `readModifyWriteWorkflowDocument` | `readModifyWrite` | Yes — inside helper, per attempt | `3` (`DEFAULT_MAX_RETRIES`) | `maybeApplyWorkflowVersion` in composed `mutate` |
| `ManagedWorkflowsService.installManagedWorkflow` **create** | `createWorkflowDocument` | `create` | No | Outer install loop on id collision | `maybeApplyWorkflowVersion(document, undefined, versioningEnabled)` |
| `ManagedWorkflowsService.installManagedWorkflow` **update** | `writeWorkflowDocumentWithOcc` | `write` (optimistic OCC) | No — install pre-read supplies `(ifSeqNo, ifPrimaryTerm)` | Outer install loop on 409 | `maybeApplyWorkflowVersion` from pre-read `existing` when `versioningEnabled` |
| `disableAllWorkflows` | `bulkIndexWithOccRetry` | — | Per-page search only | `3` | `maybeApplyWorkflowVersion` per bulk item when `versioningEnabled` |

## CRUD write methods

```typescript
// Create (op_type: create)
createWorkflowDocument(id, spaceId, document)

// Optimistic OCC — caller already read version metadata
writeWorkflowDocumentWithOcc(id, spaceId, { document, ifSeqNo, ifPrimaryTerm })

// Read-modify-write — merge inside mutate
readModifyWriteWorkflowDocument(id, spaceId, {
  mutate: (existing) => merged,
  maxRetries?,
  getOptions?,
})
```

## When to use which path

**`readModifyWriteWorkflowDocument` (default for user updates)** when `mutate` is a **pure merge** over the document the helper just read. On conflict, `OccWriter` re-reads and runs `mutate` again.

**`writeWorkflowDocumentWithOcc` (optimistic)** when the caller already has the document to index and version metadata from a prior read. Managed workflow **updates** use this: `installManagedWorkflowOnce` reads once, prepares the document, then writes with the pre-read version metadata. On `409`, the outer `installManagedWorkflow` loop re-reads and re-prepares.

**`createWorkflowDocument`** for managed **creates** (`op_type: create`). No retry on create conflicts inside `OccWriter`.

## Read-modify-write writers

`WorkflowCrudService` constructs a read-modify-write `OccWriter` per call (no process-lifetime cache). Each writer closes over `spaceId`, optional `getOptions`, and `maxRetries` (normalized to `DEFAULT_MAX_RETRIES` when omitted).

## Bulk writes and conflict refresh

Multi-document paths do not use `OccWriter` per id. `bulkIndexWithOccRetry` bulk-indexes with per-item `if_seq_no` / `if_primary_term`, then retries only `409` items.

Conflict refresh batches a single `search` with an `ids` query (not per-doc `get` / raw `mget`) so `@kbn/storage-adapter` routing and source migration stay correct:

```typescript
await client.search({
  query: { ids: { values: conflictIds } },
  seq_no_primary_term: true,
  size: conflictIds.length,
  track_total_hits: false,
});
```
