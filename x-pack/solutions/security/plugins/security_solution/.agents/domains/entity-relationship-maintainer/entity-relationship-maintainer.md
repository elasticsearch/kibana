# Domain: Entity Relationship Maintainer

> **This is a DRAFT.** No expert interview was conducted. Every section below is inferred from
> the code-architecture scan and the PR-mining report. Items needing expert confirmation are
> marked with `> **[VERIFY]:**` callouts. @seanrathier and @alexreal1314 should review, correct,
> and remove the callouts.

## What every reviewer must know

This domain covers the **relationship maintainers** (`accesses_frequently` / `accesses_infrequently` and `communicates_with`) plus the automated-resolution maintainer — not the broader entity store framework. A maintainer is a background Task Manager task (default `1d` interval) that discovers entity-to-entity relationships from log indices and writes them onto entities in the entity store. The relationship engine runs in two steps: a composite-aggregation **actor discovery** pass (`buildActorDiscoveryQuery`, paginated up to `MAX_ITERATIONS=1000` × `COMPOSITE_PAGE_SIZE=3500`), then a per-actor **ES|QL targets** query (`buildTargetsPerActorQuery`), whose rows are parsed into `EntityRelationshipRecord[]` and written via `crudClient.bulkUpdateEntity()`. The single most important invisible rule: relationship arrays are written as a **full array replacement, not append/merge** (`engine/update_entities.ts`), so any code path that produces more than one update for the same `entityId`, or that writes `{ ids: [] }` for a window with no data, will silently erase relationships discovered in earlier runs.

## Architectural invariants

> **[VERIFY]:** These invariants were extracted from PR review threads where the fix landed, but
> none has been confirmed by an expert as a standing domain rule. Confirm each still holds.

- **Relationship writes are full-array replacement, so records for the same `entityId` must be merged before bulk write** — Producing separate bulk update objects for the same EUID from different integrations or pages means the last write wins and overwrites earlier targets. Merge (union the target sets) per `entityId` before building bulk objects. (https://github.com/elastic/kibana/pull/258656 · @niros1 · `communicates_with/update_entities.ts`)
- **The abort signal must be wired through every ES / ES|QL call and every loop-iteration guard** — Accepting `abortController` in the task runner but not passing `abortController.signal` to ES calls (and not checking `abortController?.signal.aborted` at loop boundaries) means the task cannot actually be cancelled. (https://github.com/elastic/kibana/pull/258656, https://github.com/elastic/kibana/pull/255418 · @pmuellr · `communicates_with/index.ts`, `accesses/index.ts`)
- **Abort-triggered errors must break gracefully, not fall through the generic error handler** — When the abort signal fires during `esClient.search`, the error does not match `isIndexNotFound`, falls through to the re-throw path, and loses all already-collected records, failing the whole maintainer. Handle abort at the search call site with a `break`, consistent with the ES|QL abort path. (https://github.com/elastic/kibana/pull/266159 · @macroscopeapp · `engine/run_maintainer.ts`)
- **ES|QL partial failures must throw, not log-and-continue** — Catching an ES|QL query failure and `break`ing produces partial relationship data while the caller still logs success metrics ("Completed run"). Throw to stop execution, matching the composite-aggregation failure behavior, so incomplete data is never persisted as if complete. (https://github.com/elastic/kibana/pull/266159 · @macroscopeapp · `engine/run_maintainer.ts`)
- **When `config.customActor` is set, the base actor-presence filter must use the custom actor fields, not the hardcoded standard user-EUID filter** — Calling `euid.dsl.getEuidDocumentsContainsIdFilter('user')` as the base gate while a `customActor` is configured silently excludes documents that only carry the custom actor fields. Derive the gate from `customActor.fields` when set. (https://github.com/elastic/kibana/pull/266159 · @macroscopeapp · `engine/build_actor_discovery_query.ts`, `build_targets_per_actor_query.ts`)
- **`entity.namespace` derivation in integration ES|QL must use the EUID helper, not hardcoded strings** — Hardcoding `| EVAL entity.namespace = "entra_id"` / `"jamf_pro"` diverges from the CloudTrail/Okta pattern; use `euid.esql.getFieldEvaluations('user')`. (https://github.com/elastic/kibana/pull/258656 · @niros1 · `communicates_with/integrations/azure_signinlogs/build_esql_query.ts`)
- **`entityType` must flow from the integration config through the pipeline, never hardcoded to `'user'`** — Relationships may be host→host (or other types) in the future, so `entityType` belongs in the integration config and must be threaded through `postprocessEsqlResults` / `run_maintainer.ts` into `update_entities.ts` as `r.entityType`. (https://github.com/elastic/kibana/pull/258656 · @niros1 · `communicates_with/update_entities.ts`)
- **Entity id must be computed inside the ES|QL query via `euid.esql.getEuidEvaluation('user', { withTypeId: false })`, not post-hoc via `getEuidFromObject`** — Post-hoc derivation forces the query to extract many individual identity fields; computing the EUID in the `EVAL` clause and extracting a single field is the established pattern. (https://github.com/elastic/kibana/pull/255418 · @JordanSh · `maintainers/accesses/postprocess_records.ts`)
- **Internal EUID helpers must not be exposed beyond the EUID facade** — Do not export raw internals from `euid_helpers.ts`; use the facade (e.g. `euid.getEuidSourceFields('user').requiresOneOf`) and validate both IDP and non-IDP user-entity scenarios. (https://github.com/elastic/kibana/pull/258656 · @chennn1990 · `entity_store/common/euid_helpers.ts`)
- **The CPS ES client (`cpsEsClient`) must be created unconditionally, not gated on `isServerless`** — On ECH, core strips `projectRouting` from outgoing requests, so the extra client is a safe no-op; gating it on `isServerless` forces every downstream maintainer to re-implement the branching. (https://github.com/elastic/kibana/pull/269578 · @uri-weisman · `entity_store/server/tasks/entity_maintainers/execution.ts`)

## Common review patterns (learned from real PRs)

> **[VERIFY]:** These are recurring reviewer preferences within the maintainer code. Confirm they
> reflect the team's current expectations.

- **Empty windows must omit the relationship field (`undefined`), not clear it (`[]`)** — Because the write is full-array replacement, setting `{ ids: [] }` for a relationship the current sliding window produced no data for would erase prior-window data; `undefined` omits the field from the update doc entirely. Accepted by reviewer after explanation. (https://github.com/elastic/kibana/pull/262911 · @tiansivive · `maintainers/accesses/update_entities.ts`)
- **Run-loop logic should be linear and decomposed into small named steps** — Nested mutation loops with branching are hard to read; prefer explicit steps (filter valid records → group by `entityId` → merge ids → apply precedence) via `.map`/`.filter`/`.reduce` or small named functions. The `runMaintainer` function should read as a slim orchestrator that delegates per-integration processing (e.g. `processIntegration`). (https://github.com/elastic/kibana/pull/262911 · @tiansivive; https://github.com/elastic/kibana/pull/258656 · @CAWilson94)
- **Prefer `satisfies` over `as` for object-shape validation** — `as` suppresses excess-property checks; `satisfies` is a stronger ascription. (https://github.com/elastic/kibana/pull/262911 · @tiansivive · `maintainers/accesses/update_entities.ts`)
- **Use the `EntityType` enum from `@kbn/entity-store/common` consistently for `entityType`** — Do not type it as `string` in one maintainer's `MergedEntity` while using the enum in another. (https://github.com/elastic/kibana/pull/262911 · @CAWilson94 · `maintainers/communicates_with/update_entities.ts`)
- **Name relationship config constants after the relationship, not generically** — Use `COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS` (matching the `RelationshipIntegrationConfig[]` type), not `COMMUNICATES_WITH_ENGINE_CONFIGS`, which reads as engine-level overrides. (https://github.com/elastic/kibana/pull/266159 · @JordanSh · `maintainers/communicates_with/index.ts`)
- **`euid.esql.getEuidEvaluation` is preferred for `actorUserId`, but only where all referenced fields are mapped** — Hand-written `CONCAT("user:", ...)` is discouraged in favor of the centralized helper for indices like Okta where all fields are mapped. However, CloudTrail, Azure, and Jamf must keep manual CONCAT: `getEuidEvaluation` emits a CASE over all identity fields (`user.email`, `user.domain`, `host.id`), and ES|QL validates column references at compile time, so unmapped fields cause `verification_exception`. This is a correctness constraint, not a style choice. (https://github.com/elastic/kibana/pull/258656, https://github.com/elastic/kibana/pull/262345 · @JordanSh, @niros1)
- **Expected task-type lists in registration tests must stay alphabetically sorted** — The actual list is sorted at runtime, so an unsorted expected array fails. (https://github.com/elastic/kibana/pull/255418 · @macroscopeapp · `task_manager/check_registered_task_types.ts`)

> **[VERIFY]:** A cluster of Scout API test-structure preferences was raised on PR #255418 by
> @csr and @MadameSheema (use `kbnClient` for setup/teardown vs `apiClient` for assertions; extract
> helpers/constants/types to fixture files; one spec file per integration; use `expect.poll` for
> async retries; defensive cleanup in `beforeAll`; no try/catch in test bodies). Per the mining
> report these threads were left **unresolved and marked outdated** and the author did not act on
> them in that PR. Confirm whether these are now the team's standing Scout conventions for
> maintainer tests before treating them as review rules.

## Security considerations

> **[VERIFY]:** No security-specific guidance was confirmed by an expert. The items below are
> inferred from the code shape; confirm whether they are real constraints a reviewer must check.

- **Namespace must be validated before it reaches index names and EUID derivation** — Maintainers interpolate `{namespace}` into index patterns (e.g. `logs-aws.cloudtrail-{namespace}`) and CRUDClient construction is namespace-scoped. `engine/validate_namespace.ts` exists for this; confirm every entry path (scheduled task and the HTTP routes `init`/`run`/`start`/`stop`) routes through it so a malformed or cross-tenant namespace cannot reach ES. (`engine/validate_namespace.ts`; `tasks/entity_maintainers/execution.ts:137`)
  > **[VERIFY]:** Is namespace validation enforced on the HTTP route inputs as well as the scheduled path, and what is the trust boundary for the `fakeRequest` used by scheduled tasks?
- **Read queries use a cross-project-space-routed scoped ES client (`cpsEsClient`)** — `coreStart.elasticsearch.client.asScoped(request, { projectRouting: 'space' })` is used for relationship read queries. Confirm this routing cannot read across space/project boundaries the caller is not entitled to. (`tasks/entity_maintainers/execution.ts`)
  > **[VERIFY]:** Does `projectRouting: 'space'` widen read scope in any deployment, and is that intended for relationship discovery?
- **License is checked before each run** — A license gate runs before the maintainer body (`tasks/entity_maintainers/execution.ts:49`).
  > **[VERIFY]:** Which license tier is required, and is the gate enforced on the synchronous HTTP `runSync` path as well as the scheduled path?

> **[VERIFY]:** Are there signal-poisoning concerns where untrusted log content (e.g. attacker-controlled `user.name`) flows into relationship targets, and does that need sanitization?

## Performance constraints

> **[VERIFY]:** The numeric anchors below are real (from `engine/constants.ts` and configs), but
> their adequacy and the data-size assumptions behind them were not expert-confirmed.

- **Actor discovery is bounded by `MAX_ITERATIONS=1000` × `COMPOSITE_PAGE_SIZE=3500`** — The composite-aggregation pass paginates up to ~3.5M actor buckets per integration before stopping. Adding integrations or relationship types that produce more actors than this silently truncates discovery. (`engine/constants.ts:9`; `engine/run_relationship_maintainer.ts:71`)
  > **[VERIFY]:** Is 1000×3500 sufficient headroom for the largest expected deployments, and what happens (truncation vs error) when the cap is hit?
- **The discovery lookback window is fixed at `now-30d` (`LOOKBACK_WINDOW`)** — Relationships older than 30 days are not rediscovered; combined with full-array-replacement, a relationship that stops appearing in the 30-day window will eventually be dropped on the next run that writes that entity. (`engine/constants.ts:8`)
  > **[VERIFY]:** Is the 30-day lookback the intended retention semantics for relationships, and is it configurable per integration?
- **ES|QL uses `SET unmapped_fields="nullify"` (`ESQL_ENGINE_PREAMBLE`)** — This preamble affects how unmapped fields behave in the targets query. (`engine/constants.ts:27`)
- **Relationship target arrays are capped (the `relationship_ids` array size)** — A self-note flagged whether 50 is sufficient for the `relationship_ids` array. Exceeding the cap means relationship targets are dropped. (https://github.com/elastic/kibana/pull/258656 · @seanrathier · `entity_store/common/domain/definitions/common_fields.ts`)
  > **[VERIFY]:** What is the current `relationship_ids` array cap, is 50 sufficient, and how are overflow targets selected/dropped?
- **The default maintainer run interval is `1d`** — Relationship freshness is bounded by this interval; on-demand `run`/`runSync` exists for immediate execution. (`code-architecture.md` data-flow; `tasks/entity_maintainers/index.ts`)

## Historical catches

> **[VERIFY]:** These are the highest-signal landed catches from PR mining, included so the expert
> can confirm they are representative of the domain knowledge a reviewer needs.

- [PR #258656](https://github.com/elastic/kibana/pull/258656) — Reviewer caught that the same user EUID appearing from multiple integrations produced separate bulk updates, so the full-array-replacement write made the last integration overwrite earlier `communicates_with` targets — A generic reviewer would not know the write is full-array replacement (not append/merge) and would treat the per-integration loop as safe.
- [PR #266159](https://github.com/elastic/kibana/pull/266159) — Reviewer caught that an abort during `esClient.search` did not match `isIndexNotFound`, fell through the generic handler, and re-threw — failing the whole maintainer and losing all already-collected records — A generic reviewer would not know the ES|QL path already handles abort with a graceful `break` and that the composite-search path must mirror it.
- [PR #266159](https://github.com/elastic/kibana/pull/266159) — Reviewer caught that with `config.customActor` set, the base filter still required standard `user.*` fields to exist, silently excluding documents that only carry the custom actor fields — A generic reviewer would not know that the actor-presence gate is the discovery entry point and that custom-actor integrations have no `user.*` fields.
- [PR #255418](https://github.com/elastic/kibana/pull/255418) / [PR #258656](https://github.com/elastic/kibana/pull/258656) — Reviewer caught that `abortController` was accepted in the task runner signature but never passed to ES/ES|QL calls or loop guards, so the task could not be cancelled — A generic reviewer would assume accepting the controller implied it was wired through.
- [PR #258656](https://github.com/elastic/kibana/pull/258656) — Reviewer caught hardcoded `entity.namespace` strings (`"entra_id"`, `"jamf_pro"`) in integration ES|QL instead of the `euid.esql.getFieldEvaluations('user')` helper — A generic reviewer would not know the EUID helper is the single source of truth for namespace derivation across integrations.

> **[VERIFY]:** Several signal-quality concerns were raised but deferred to follow-up PRs and may
> still be open. Confirm their status:
> - accesses_frequently threshold: is the frequency-bucket threshold `>= 4`? (currently `4` in `accesses/configs.ts:19`) (https://github.com/elastic/kibana/pull/255418 · @niros1)
> - Windows machine accounts (e.g. `WORKSTATION$`) are not excluded via `NOT user.name LIKE "*$"` in the system_security integration, inflating access counts (https://github.com/elastic/kibana/pull/255418 · @niros1)
> - Network logon (type 3) includes SMB/file-share/machine-to-machine activity that may need exclusion (https://github.com/elastic/kibana/pull/255418 · @niros1)
> - Service accounts (root, bin, daemon, …) are not excluded in elastic_defend and system_auth (https://github.com/elastic/kibana/pull/255418 · @niros1)
> - One integration's ES|QL failure stops all integrations — should each integration be isolated in try/catch and continue? (https://github.com/elastic/kibana/pull/255418 · @niros1)
> - Does the engine only ever create `user`-type records, or should the type be `user | host | service`? (https://github.com/elastic/kibana/pull/266159 · @JordanSh)
> - Entity store v1→v2 index migration: is the decision still "keep under v2, no v1 migration planned"? (https://github.com/elastic/kibana/pull/247815 · @alexreal1314)

## Documentation

Links to existing documentation for this domain (Confluence, wikis, ADRs, READMEs):

_(none provided)_

> **[VERIFY]:** No existing docs were supplied. If there is a Confluence/ADR page for the
> relationship maintainers or the entity store v2 relationship model, add it here.

## Who to contact

- Relationship maintainer architecture / data model questions: @seanrathier
- Relationship maintainer architecture / data model questions: @alexreal1314
- Owning teams (from CODEOWNERS): @elastic/contextual-security-apps, @elastic/security-entity-analytics (security_solution maintainers), @elastic/core-analysis (entity_store plugin)

> **[VERIFY]:** Owners were derived from `.github/CODEOWNERS` path matches and not validated.
> Confirm which team is the primary point of contact for the relationship maintainers vs the
> entity store task/route framework, and whether the right routing is architecture → @seanrathier,
> ES|QL/EUID → @alexreal1314 (or otherwise).
