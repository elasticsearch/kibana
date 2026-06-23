# Domain: Entity Relationship Maintainers

## What every reviewer must know

This domain is the Entity Store v2 relationship-maintainer framework: a shared 2-step ES|QL/composite-aggregation engine (`engine/`) plus per-relationship, config-driven maintainers (`accesses`, `administers`, `communicates_with`, `supervises`) that resolve raw signals into canonical `entity.relationships.<relType>.ids` on actor entity documents. Each maintainer runs as a scheduled background task registered via the `entityStore` plugin's `RegisterEntityMaintainerConfig` contract, and its `run()` callback receives `{ esClient, cpsEsClient?, logger, status, crudClient, abortController }`. Step 1 (`build_actor_discovery_query.ts`) pages actors via an ES composite aggregation (page size `COMPOSITE_PAGE_SIZE = 3500`); Step 2 builds an ES|QL query per config `kind` (`standard` / `bucketed` / `override`) and writes results via `crudClient.bulkUpdateEntity({ objects, force: true })` (`engine/update_entities.ts:104`). Raw-identifiers maintainers (`administers`, `supervises`) read from the latest entity index rather than a logs index and use a `entity.lifecycle.last_seen > lastProcessedTimestamp` watermark persisted in `status.state.lastProcessedTimestamp` for incremental processing (`engine/build_raw_identifiers_query.ts:87`).

## Architectural invariants

- **Abort-signal errors must be detected and treated as a clean (non-error) exit — checked _before_ `isIndexNotFound`** — When the abort signal fires during `esClient.search`, the resulting error does not match `isIndexNotFound`, falls through to the generic error logger and re-throw, and crashes the maintainer, blocking future runs. (PR #266159, @macroscopeapp, `engine/run_relationship_maintainer.ts`)
- **An ES|QL query failure must surface as an error in the return metrics — never write partial data while reporting success** — Continuing with `break` after an ES|QL failure lets already-collected records be written while returning success metrics, so callers/operators cannot distinguish a partial run from a complete one. (PR #266159, @macroscopeapp)
- **EUID values in ES|QL must be computed via `euid.esql.getEuidEvaluation(...)`, not manual string concatenation** — Hand-built IDs like `CONCAT("user:", user.name)` bypass the canonical EUID path and force extracting far more fields than necessary; the evaluation helper is the canonical, minimal-extraction path. (PR #255418 @JordanSh; PR #262345 @niros1)
- **Empty/garbage target entity IDs must be filtered consistently for every entity-type variant in the ES|QL WHERE clause** — Guarding only one type (e.g. `Device`) while leaving another (e.g. `User`) unguarded produces invalid IDs such as `"user:@entra_id"` from an empty UPN, which is neither filtered nor a valid identity. (PR #262345, @macroscopeapp, `communicates_with/integrations/azure_auditlogs/build_esql_query.ts`)
- **The Task Manager `abortController` signal must be propagated through the entire maintainer run** — TM provides an abort controller when creating the task; ignoring it means the task cannot be cancelled cleanly. (PR #255418, @pmuellr, `accesses/index.ts`)
- **The maintainer registry must throw on an unknown ID, never return `undefined`** — A silent `undefined` from `get`/`getLifecycle` hides bugs and makes "not registered" indistinguishable from "not yet initialised". (PR #262317, @chennn1990, `entity_maintainers_registry.ts`)
- **The namespace must be validated against `NAMESPACE_PATTERN` at the engine boundary before any index-pattern interpolation** — `assertValidNamespace` runs at the top of `runRelationshipMaintainer` (`engine/run_relationship_maintainer.ts:281`; pattern `/^[a-z0-9][a-z0-9_-]{0,99}$/` in `engine/validate_namespace.ts`); skipping it would interpolate an unvalidated namespace into ES index patterns.
  > **[VERIFY]:** Is `assertValidNamespace` intended as a security boundary against index-pattern injection, or purely a correctness guard? Confirm whether all index-pattern construction paths route through it.
- **The watermark must only advance after a non-aborted run** — `administers`/`supervises` return the new `lastRunTimestamp` on success but return the prior `status.state` unchanged on abort (`administers/index.ts:48`); advancing on an aborted/partial run would skip un-processed entities permanently.
  > **[VERIFY]:** Confirm advancing the watermark requires both "not aborted" AND "no ES|QL error" — given the partial-data invariant above, does a per-integration ES|QL failure prevent watermark advance, or only an abort?

## Common review patterns (learned from real PRs)

- **Omit unchanged relationship fields with `undefined`, not `{ ids: [] }`** — Setting an empty array explicitly clears the field and erases relationships observed in an earlier window but absent in the current one; `undefined` omits the field so prior data is preserved. (@tiansivive, PR #262911, `accesses/update_entities.ts`)
- **Prefer `satisfies SomeType` over `as SomeType`** — `satisfies` validates the object shape without widening it; flagged on update-entity functions. (@tiansivive, PR #262911)
- **Create `esClient` and `cpsEsClient` unconditionally; let each maintainer choose** — Do not gate CPS client creation behind an `isServerless` flag at the execution layer; the decision belongs to each maintainer's data-access intent. (@uri-weisman, PR #269578, `entity_store/server/tasks/entity_maintainers/execution.ts`)
- **One registry map with typed `task` / `lifecycle` sub-properties — not two separate maps** — (@chennn1990, PR #262317, `entity_maintainers_registry.ts`)
- **Fail fast on a missing namespace; do not fall back to `""`** — Keep the `currentStatus?.namespace || currentStatus?.metadata?.namespace` lookup chain and let it surface early. (@chennn1990, PR #262317, `execution.ts`)
- **`autoStart` defaults to `true`; `autoStart: false` is the exceptional, test-only path** — Renamed from a no-default `enabled` flag. (@chennn1990, PR #262317, `utils/validator.ts`)
- **`extends` an existing interface instead of re-declaring its fields** — (@chennn1990, PR #262317, `entity_maintainers_client.ts`)
- **Deduplicate lookback-filter construction into the shared `buildLookbackFilter`** — Used in both `run_relationship_maintainer.ts` and `build_actor_discovery_query.ts`. (@maxcold, PR #272948)
- **Log a run/skip decision once, at the point of decision — not again in the outer loop** — (@alexreal1314, PR #269578, `engine/run_relationship_maintainer.ts`)
- **Comments explain _why_ for non-obvious decisions; "future work" comments must link a ticket** — (@maxcold, PR #272948, `administers/configs.ts`)
- **Keep synchronous-run API execution separate from Task Manager task code** — Extract `executeMaintainerRun` / `runSync` into a dedicated `execution.ts`; the API route calls it directly, bypassing TM status/licensing checks that don't apply to sync API calls. (@chennn1990, PR #262317, `entity_store/server/tasks/entity_maintainers/index.ts`)

## Security considerations

- **Namespace input is validated against `NAMESPACE_PATTERN` before interpolation into ES index patterns** (`engine/validate_namespace.ts`, enforced at `engine/run_relationship_maintainer.ts:281`).
  > **[VERIFY]:** Confirm this validation is the intended defense against index-pattern/injection abuse via a caller-controlled namespace, and that no maintainer constructs an index pattern from the namespace before this guard runs.
- **Account-exclusion gaps are a known data-quality (not yet security-enforced) backlog** — Windows machine accounts (`WORKSTATION$`), Linux service accounts (root, bin, daemon, sshd, etc.), and network logon type 3 (machine-to-machine) are not currently excluded from accesses queries; authors deferred these. A reviewer adding a new integration should consider whether non-human/service identities pollute relationship data. (PR #255418, @niros1)
  > **[VERIFY]:** Should machine/service account exclusion be a hard requirement for new accesses/communicates_with integrations, or remain per-integration discretion?

## Performance constraints

- **Step 1 pages actors via composite aggregation at `COMPOSITE_PAGE_SIZE = 3500` per page** (`engine/constants.ts`, `engine/build_actor_discovery_query.ts`); each page becomes an OR-of-`terms` DSL filter narrowing the Step 2 ES|QL query (`build_actor_discovery_query.ts:142`). Adding actor fields or relaxing actor-presence filters widens the candidate set and increases ES|QL load per page.
  > **[VERIFY]:** Are `COMPOSITE_PAGE_SIZE` (3500) and `MAX_ITERATIONS` tuned against a known entity-volume ceiling? What is the expected actor count per namespace before pagination cost becomes a concern?
- **An ES|QL failure for one integration currently stops the entire maintainer run** — no subsequent integration writes its results; per-integration error isolation was suggested but is unresolved. (PR #255418, @niros1)

## Historical catches

- [PR #266159](https://github.com/elastic/kibana/pull/266159) — Reviewer caught that an abort-signal error during `esClient.search` fell through to the generic error handler and crashed the maintainer — A generic reviewer would not know abort must be matched _before_ `isIndexNotFound` and treated as a clean exit, not a failure.
- [PR #266159](https://github.com/elastic/kibana/pull/266159) — Reviewer caught that `break`-on-ES|QL-failure wrote already-collected records while returning success metrics — A generic reviewer would not realize the function reports success with no signal that the write was partial.
- [PR #262345](https://github.com/elastic/kibana/pull/262345) — Reviewer caught that an empty UPN produced an invalid `"user:@entra_id"` target ID because the empty-field guard covered only `Device`, not `User` — A generic reviewer would not know each entity-type branch needs its own empty-field guard in the ES|QL WHERE clause.
- [PR #262317](https://github.com/elastic/kibana/pull/262317) — Reviewer held firm that the maintainer registry must throw on an unknown ID rather than return `undefined` — A generic reviewer would not see why distinguishing "not registered" from "not yet initialised" matters for this lifecycle.
- [PR #266159](https://github.com/elastic/kibana/pull/266159) — `customActor` configs were silently filtered to zero buckets because the Step 1 base filter still required standard `user.*` ECS fields (notably `azure_auditlogs`) — A generic reviewer would not know that supplying `config.customActor` must bypass the ECS actor-presence filter, or the maintainer silently writes nothing.

## Documentation

Links to existing documentation for this domain (Confluence, wikis, ADRs, READMEs):

- RFC — watermark / entities-v2 traversal strategy: https://docs.google.com/document/d/1_yzHvWVsMXC2vJxCgaukz_XyEkbMWVhdBmWBvfuzzvo
- In-tree: `x-pack/solutions/security/plugins/security_solution/server/lib/entity_analytics/maintainers/administers/CONTEXT.md`
- In-tree: `x-pack/solutions/security/plugins/security_solution/server/lib/entity_analytics/maintainers/supervises/CONTEXT.md`
- In-tree: `x-pack/solutions/security/plugins/security_solution/server/lib/entity_analytics/maintainers/supervises/SUPERVISES_MAINTAINER_HANDOFF.md`
- CPS support: [PR #269578](https://github.com/elastic/kibana/pull/269578)
- administers maintainer: investigation #266374, implementation #272943, [PR #272948](https://github.com/elastic/kibana/pull/272948)
- supervises maintainer: investigation #274248, implementation #274249, ticket #266369

## Who to contact

- Architecture / data model questions: @seanrathier, @alexreal1314
- Engine / registry questions: @chennn1990
- Performance / ES|QL query questions: @romulets
