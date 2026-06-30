# `graph_layout/` — Workflow logical-graph construction

This directory builds the **logical graph** used by the read-only visualisation editor.
It is framework-free (no React, no Redux) and accepts a raw `WorkflowYaml` definition as input.

See [`CONTEXT.md`](../CONTEXT.md) for domain terminology (logical graph, node refs, bypass lane
nodes, topology fingerprint, etc.).

---

## Layout pipeline

```
WorkflowYaml
  → transformWorkflowToGraph()     # domain → logical graph  (nodes, edges, nodeRefs)
  → dagLayout()                    # logical graph → positioned graph   (@kbn/dag-layout)
  → useWorkflowLayout()            # positioned graph → ReactFlow nodes + edges
  → WorkflowGraphCanvas            # ReactFlow render
```

---

## Adding a new flow-control (structural) step type

Structural steps (control-flow steps such as `if`, `foreach`, `switch`, …) require updates
across **ten touch-points** to keep the graph, topology fingerprint, traversal, and execution
semantics in sync. Work top-down through this checklist.

### 1 · Schema — `spec/schema.ts`

Declare `XStepSchema` (the zod shape) and a `getXStepSchema(stepSchema, loose)` builder, then
add the new type to the `StepSchema` union (~line 687). The `Step` type (line 709 of that file)
derives from the union.

### 2 · Types — `graph_layout/types.ts`

- Add to `FLOW_CONTROL_STEP_TYPES` (line 16) — the canonical set used by icon pickers and
  graph renderers to decide "is this structural?".
- If the step renders as a **container group** (like `foreach`/`while`): add to
  `CONTAINER_STEP_TYPES` (line 34).
- If it introduces new visual node kinds beyond `'step' | 'trigger' | 'foreachGroup'`:
  extend `PreLayoutNodeBase.type` (line 52).
- If it needs new edge branch-label semantics: extend `EdgeBranchType` (line 43).

### 3 · Child-slot traversal — `graph_layout/walk_step_tree.ts`

Add the new child-property slot to `visitStepChildren` (line 18). This function is the
single source of truth for "which properties hold nested steps". Without it, the transform
and the fingerprint won't recurse into the new step's children.

### 4 · Topology fingerprint — `graph_layout/compute_topology_fingerprint.ts`

Add the **same** child-property slot to `walkStepsWithSlot` (line 36). This is a deliberate
duplicate of step 3 — the fingerprint hashes each slot with a prefix so that moving a step
between branches changes the hash. **Steps 3 and 4 must be kept in sync manually.**

### 5 · Graph transform — `graph_layout/transform_workflow_to_graph.ts`

Choose one of two paths based on the step's rendering model:

| Rendering model | Where to add |
|---|---|
| **Container group** (step body shown as an EUI panel, children laid out inside) — like `foreach`/`while` | Add type to `CONTAINER_STEP_TYPES` (step 2); `transformInternal` recurses automatically. |
| **Diamond / branching** — like `if`/`switch`/`parallel` | Add an explicit `else if (step.type === 'x')` arm after line 391, defining: edge labels, `branchType`, bypass-lane synthesis for missing branches. |

Bypass-lane nodes (1×1 invisible nodes) are synthesised by `synthesizeBypassLane` (line 237)
when a branch has no steps. They keep dagre's lane allocation balanced. Always synthesise one
for each missing optional branch.

### 6 · Step icon — `workflows_management/.../get_step_icon_type.ts`

Add icon case(s) to the "flow control nodes" block (line 71). This covers the execution-engine
`enter-*`/`exit-*` node kinds that the debug graph emits. Key execution-engine variants follow
the pattern `enter-{type}` / `exit-{type}`.

### 7 · Node icon map — `kbn-workflows-ui/.../workflow_graph_node.tsx`

Add an entry to `STEP_TYPE_ICON` (line 58). This is a **second, independent** icon map used
exclusively by the visualisation editor — it does **not** share code with step 6. Icon keys
follow `stepType.split('.')[0]` (see `getNodeIcon`, line 73).

### 8 · Container group renderer — `kbn-workflows-ui/.../workflow_graph_foreach_group_node.tsx`

If the new step is a container group (step 2), the `refresh` icon is currently **hard-coded**
at line 118. Consider parameterising it (e.g., derive from `data.stepType`) so your new type
renders with the correct icon rather than the foreach icon.

### 9 · ReactFlow node registry — `kbn-workflows-ui/.../workflow_graph_canvas.tsx`

If you introduced a new visual node `type` in step 2 (beyond `step`, `trigger`,
`foreachGroup`, `bypassLane`), register its React component in `NODE_TYPES` (line 77).

### 10 · Execution-engine graph — `graph/build_execution_graph/build_execution_graph.ts`

A structural step with real execution semantics needs `Enter*`/`Exit*` node kinds in the
separate **execution-engine IR** (this graph is distinct from the logical graph — see
`CONTEXT.md`). The ~25 existing enter/exit imports (lines 41-60) show the pattern.

---

## Notes for the future

Steps **3, 4, 5** share hand-duplicated child-slot logic across three files, and steps **6, 7**
are two independent icon maps. A future **step-type registry** of the shape
`{ childSlots, renderKind, icon, edgeLabelStrategy, isContainer }` could collapse them into a
single declaration per type, with `FLOW_CONTROL_STEP_TYPES` / `CONTAINER_STEP_TYPES` derived
automatically. This is out of scope today — the checklist above is the lightweight interim that
keeps the ten touch-points discoverable.
