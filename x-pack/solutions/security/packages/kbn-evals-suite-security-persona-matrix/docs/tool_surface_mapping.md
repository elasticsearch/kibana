# Tool-surface mapping: original EIS benchmark → current eval stacks

The original benchmark (June 2026, `eis-benchmark` handoff bundle) ran against a
different agent harness and tool surface than the current persona-matrix suite
(August 2026, golden cluster). Tool-trail comparison between the two requires
this mapping — a raw string diff is meaningless without it.

## Renamed / replaced tools

| Original tool | Current equivalent | Notes |
|---|---|---|
| `create.case` | `platform.core.cases.manage` | Cases tooling rebuilt; `security_solution_setup.create_case` alias also seen |
| `create.channel`, `check.on.call.schedule`, `get.time` | `platform.core.generate_workflow` inputs | Workflow authoring folds these primitives into generated workflow steps |
| `filestore.read /skills/<name>.md` | `platform.core.load_skill` + `platform.core.search_relevant_skills` | Skill activation moved from raw file reads to a first-class tool |
| `entity.store.search` / `entity.store.get_analytics` | `platform.core.search` (`.entities.v1.latest.*`) or ES|QL via `generate_esql`/`execute_esql` | Entities query surface consolidated |
| `attack_discovery.analyze` | Attack-discovery skill flow | Moved behind skill instructions |

## Absent on current eval stacks

| Original tool | Status |
|---|---|
| `vt.hash.lookup` | VirusTotal connector not provisioned on eval stacks (230 calls in the original run) |

## New on current eval stacks (no original counterpart)

| Current tool | Purpose |
|---|---|
| `platform.core.write_todos` | Agent framework todo tracking (321 calls in the 2026-08-21 sweep) |
| `platform.core.execute_api` / `discover_apis` / `describe_api` | Generic API discovery layer (197 calls combined) |
| `platform.core.sml_search` | Semantic search |
| `platform.core.run_subagent` | Sub-agent fan-out |
| `platform.core.list_files`, `platform.core.list_attachments` | Listing primitives |

## Known divergences caused by the surface change

1. **Tool-set similarity between benchmark generations is structurally low**
   (mean Jaccard ≈ 0.13 across 315 paired cells). This is expected and does not
   indicate model regression.
2. **Categories hitting `vt.*` flows** (alert-analysis, threat-hunting) lose an
   enrichment step on current stacks. ExpectedTools annotations must reference
   the current surface, not the original one.
3. **Skill-load accounting**: original `filestore.read /skills/...` and current
   `load_skill` must both be treated as skill activation when comparing
   SkillInvoked-style metrics across generations.

Fixture provenance for the current generation is pinned via
`provenance.fixtureFingerprint` in `persona_matrix.config.json`.
