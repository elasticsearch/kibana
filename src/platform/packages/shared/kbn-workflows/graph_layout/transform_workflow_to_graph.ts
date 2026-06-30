/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { IdAllocator } from './id_allocator';
import type {
  ForeachGroup,
  GraphEdge,
  NodeRef,
  PreLayoutBypassLaneNode,
  PreLayoutForeachGroupNode,
  PreLayoutNode,
  PreLayoutStepNode,
  PreLayoutTriggerNode,
  Step,
} from './types';
import { CONTAINER_STEP_TYPES, DEFAULT_NODE_STYLE } from './types';
import { visitStepChildren } from './walk_step_tree';
import type { IfStep, MergeStep, ParallelStep, SwitchStep, WorkflowYaml } from '../spec/schema';

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual',
  alert: 'Alert',
  scheduled: 'Scheduled',
};

function getTriggerLabel(triggerType: string): string {
  return TRIGGER_LABEL[triggerType] ?? triggerType;
}

/** Collapse duplicate exit ids when empty branches fall through via the same gate. */
function dedupeIds(ids: string[]): string[] {
  return ids.length <= 1 ? ids : [...new Set(ids)];
}

export interface TransformResult {
  nodes: PreLayoutNode[];
  edges: GraphEdge[];
  foreachGroups: ForeachGroup[];
  /**
   * Layout-only bypass lane nodes for unbalanced `if`/`switch` branches.
   * Separate from domain `nodes` — callers pass these to the layout engine but
   * must not render them as workflow steps or include them in `nodeRefs`.
   */
  bypassLaneNodes: PreLayoutBypassLaneNode[];
  /**
   * Maps every node id to its source in the workflow definition.
   * The transform is the single place that mints node ids (via `IdAllocator`),
   * so it is the authoritative owner of this mapping — callers must not
   * reconstruct it by reading `node.data`.
   */
  nodeRefs: Record<string, NodeRef>;
}

interface InternalTransformResult extends TransformResult {
  leafIds: string[];
}

/**
 * Transforms the parsed `WorkflowYaml` into a flat list of pre-layout nodes
 * and edges plus an optional list of `foreachGroup` containers (top-level
 * foreach steps render their body inside a visual container).
 *
 * Pure: same input → same output. Safe to memoize on the topology fingerprint.
 */
export function transformWorkflowToGraph(workflow: WorkflowYaml | undefined): TransformResult {
  if (!workflow)
    return { nodes: [], edges: [], foreachGroups: [], bypassLaneNodes: [], nodeRefs: {} };

  const ids = new IdAllocator();
  const { nodes, edges, foreachGroups, bypassLaneNodes, nodeRefs } = transformInternal(
    workflow.triggers ?? [],
    workflow.steps ?? [],
    ids
  );
  return { nodes, edges, foreachGroups, bypassLaneNodes, nodeRefs };
}

function transformInternal(
  triggers: WorkflowYaml['triggers'],
  steps: Step[],
  ids: IdAllocator
): InternalTransformResult {
  const nodes: PreLayoutNode[] = [];
  const bypassLaneNodes: PreLayoutBypassLaneNode[] = [];
  const edges: GraphEdge[] = [];
  const foreachGroups: ForeachGroup[] = [];
  const nodeRefs: Record<string, NodeRef> = {};

  const triggerIds: string[] = [];
  let triggerIndex = 0;
  for (const trigger of triggers) {
    const id = ids.allocate(trigger.type);
    triggerIds.push(id);
    nodeRefs[id] = { kind: 'trigger', triggerIndex, triggerType: trigger.type };
    triggerIndex += 1;
    const triggerNode: PreLayoutTriggerNode = {
      id,
      type: 'trigger',
      data: {
        stepType: trigger.type,
        label: getTriggerLabel(trigger.type),
        isTrigger: true,
      },
      style: { ...DEFAULT_NODE_STYLE },
    };
    nodes.push(triggerNode);
  }

  const stepIds = steps.map((step) => ids.allocate(step.name));

  // Tracks the "live" exit ids at the previous step that the *next* step in
  // the sibling sequence should connect from. For regular steps that's the
  // step's own id; for `if`/`parallel` it's the leaves of every branch so
  // sibling-after-the-if joins both branches together.
  let prevExitIds: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const id = stepIds[i];

    // First step gets connected to all triggers
    if (i === 0) {
      for (const triggerId of triggerIds) {
        edges.push({ id: `${triggerId}:${id}`, source: triggerId, target: id });
      }
    } else {
      // Connect from each exit point of the previous sibling.
      const sources = dedupeIds(prevExitIds);
      for (const sourceId of sources) {
        edges.push({ id: `${sourceId}:${id}`, source: sourceId, target: id });
      }
    }

    // Default exit point for this step is itself; control structures override
    // this with the leaves of their branches.
    let exitIds: string[] = [id];

    // Record the back-pointer from this node id to its source step.  Both
    // `step` and `foreachGroup` node kinds map to the same step name — the
    // foreachGroup container IS that step, just rendered differently.
    nodeRefs[id] = { kind: 'step', stepName: step.name };

    // Container step types (foreach, while) render as a group container node,
    // at any nesting depth. The container is a self-contained "folder": one
    // edge in (from the previous outer step), one edge out (to the next outer
    // step), and inner steps only connect to each other.
    // CONTAINER_STEP_TYPES is the single source of truth for this set — kept
    // in sync with visitStepChildren so the topology fingerprint and the
    // transform always agree on which steps have inner children.
    const isContainerGroup = CONTAINER_STEP_TYPES.has(step.type);

    if (isContainerGroup) {
      // Render the container as a `foreachGroup` node (full-width header +
      // body). The regular step node would overlap with the inner children.
      const groupNode: PreLayoutForeachGroupNode = {
        id,
        type: 'foreachGroup',
        data: { label: step.name, stepType: step.type, step },
        style: { ...DEFAULT_NODE_STYLE },
      };
      nodes.push(groupNode);

      // Use visitStepChildren (the same enumerator as the topology fingerprint)
      // to extract the inner steps — keeps both traversals in sync.
      let childSteps: Step[] = [];
      visitStepChildren(step, (children) => {
        childSteps = children;
      });
      const inner = transformInternal([], childSteps, ids);
      Object.assign(nodeRefs, inner.nodeRefs);
      // inner.bypassLaneNodes stay on the group only — do NOT hoist them to the
      // top-level list. The layout pipeline feeds group bypass nodes separately
      // as compound-group children (workflow_layout_pipeline.ts:65). Hoisting
      // would cause a duplicate node id for unbalanced if/switch inside a
      // foreach/while body.
      foreachGroups.push({
        id,
        innerNodes: inner.nodes,
        innerEdges: inner.edges,
        bypassLaneNodes: inner.bypassLaneNodes,
      });
      foreachGroups.push(...inner.foreachGroups);

      // The group is a self-contained "folder": one edge in (from the
      // previous sibling to the group itself), one edge out (the next sibling
      // joins from the group's id via `exitIds = [id]` below), and the inner
      // steps only connect to each other. Deliberately NOT adding an edge
      // from the group to its first inner step — that line would cross the
      // container boundary and clutter the diagram.
    } else {
      const stepNode: PreLayoutStepNode = {
        id,
        type: 'step',
        data: { label: step.name, stepType: step.type, step },
        style: { ...DEFAULT_NODE_STYLE },
      };
      nodes.push(stepNode);
    }

    if (step.type === 'if') {
      const ifStep = step as IfStep;
      const thenSteps = (ifStep.steps as Step[]) ?? [];
      const elseSteps: Step[] = Array.isArray(ifStep.else) ? (ifStep.else as Step[]) : [];

      const hasThen = thenSteps.length > 0;
      const hasElse = elseSteps.length > 0;

      const branchExits: string[] = [];

      if (hasThen) {
        const inner = transformInternal([], thenSteps, ids);
        Object.assign(nodeRefs, inner.nodeRefs);
        nodes.push(...inner.nodes);
        bypassLaneNodes.push(...inner.bypassLaneNodes);
        edges.push(...inner.edges);
        foreachGroups.push(...inner.foreachGroups);
        const firstId = inner.nodes[0]?.id;
        if (firstId) {
          edges.push({
            id: `${id}:${firstId}-then`,
            source: id,
            target: firstId,
            branchType: 'then',
            label: 'true',
          });
        }
        branchExits.push(...inner.leafIds);
      } else if (hasElse) {
        // No `then` body but `else` is present — synthesize a bypass lane node
        // for the true path so dagre allocates a balanced diamond lane.
        const bypassId = ids.allocate(`${step.name}-then-bypass`);
        bypassLaneNodes.push({ id: bypassId, style: { width: 1, height: 1 } });
        edges.push({
          id: `${id}:${bypassId}-then`,
          source: id,
          target: bypassId,
          branchType: 'then',
          label: 'true',
        });
        branchExits.push(bypassId);
      } else {
        // Both branches empty — the true path falls through via the gate.
        branchExits.push(id);
      }

      if (hasElse) {
        const inner = transformInternal([], elseSteps, ids);
        Object.assign(nodeRefs, inner.nodeRefs);
        nodes.push(...inner.nodes);
        bypassLaneNodes.push(...inner.bypassLaneNodes);
        edges.push(...inner.edges);
        foreachGroups.push(...inner.foreachGroups);
        const firstId = inner.nodes[0]?.id;
        if (firstId) {
          edges.push({
            id: `${id}:${firstId}-else`,
            source: id,
            target: firstId,
            branchType: 'else',
            label: 'false',
          });
        }
        branchExits.push(...inner.leafIds);
      } else if (hasThen) {
        // No `else` body but `then` is present — synthesize a bypass lane node
        // for the false path so dagre allocates a balanced diamond lane.
        const bypassId = ids.allocate(`${step.name}-else-bypass`);
        bypassLaneNodes.push({ id: bypassId, style: { width: 1, height: 1 } });
        edges.push({
          id: `${id}:${bypassId}-else`,
          source: id,
          target: bypassId,
          branchType: 'else',
          label: 'false',
        });
        branchExits.push(bypassId);
      } else {
        // Both branches empty — the false path falls through via the gate.
        // (Already handled in the then arm above; this else is unreachable but
        // kept for symmetry and future-proofing.)
        branchExits.push(id);
      }

      exitIds = dedupeIds(branchExits);
    } else if (step.type === 'parallel') {
      const parallelStep = step as ParallelStep;
      const branches = (parallelStep.branches as Array<{ name?: string; steps: Step[] }>) ?? [];
      const branchExits: string[] = [];
      branches.forEach((branch, idx) => {
        if (!Array.isArray(branch.steps) || branch.steps.length === 0) {
          // Empty branch — fall through via the gate node's id (same semantics as `if`).
          branchExits.push(id);
          return;
        }
        const inner = transformInternal([], branch.steps, ids);
        Object.assign(nodeRefs, inner.nodeRefs);
        nodes.push(...inner.nodes);
        bypassLaneNodes.push(...inner.bypassLaneNodes);
        edges.push(...inner.edges);
        foreachGroups.push(...inner.foreachGroups);
        const firstId = inner.nodes[0]?.id;
        if (firstId) {
          edges.push({
            id: `${id}:${firstId}-branch-${idx}`,
            source: id,
            target: firstId,
            branchIndex: idx,
            label: branch.name ?? `branch ${idx + 1}`,
          });
        }
        branchExits.push(...inner.leafIds);
      });
      if (branchExits.length > 0) exitIds = dedupeIds(branchExits);
    } else if (step.type === 'switch') {
      const switchStep = step as SwitchStep;
      const cases =
        (switchStep.cases as Array<{ match: string | number | boolean; steps: Step[] }>) ?? [];
      const branchExits: string[] = [];

      const defaultSteps = switchStep.default as Step[] | undefined;
      const hasDefault = Array.isArray(defaultSteps) && defaultSteps.length > 0;

      // Rule 1 — one labeled edge per case (label = match value).
      cases.forEach((caseItem, idx) => {
        if (!Array.isArray(caseItem.steps) || caseItem.steps.length === 0) {
          // Defensive: empty case in loose/partial schema — fall through the gate.
          branchExits.push(id);
          return;
        }
        const inner = transformInternal([], caseItem.steps as Step[], ids);
        Object.assign(nodeRefs, inner.nodeRefs);
        nodes.push(...inner.nodes);
        bypassLaneNodes.push(...inner.bypassLaneNodes);
        edges.push(...inner.edges);
        foreachGroups.push(...inner.foreachGroups);
        const firstId = inner.nodes[0]?.id;
        if (firstId) {
          edges.push({
            id: `${id}:${firstId}-case-${idx}`,
            source: id,
            target: firstId,
            branchType: 'switch',
            label: String(caseItem.match),
          });
        }
        branchExits.push(...inner.leafIds);
      });

      // Rule 2 — `default` branch, labeled 'default'.
      if (hasDefault) {
        const inner = transformInternal([], defaultSteps as Step[], ids);
        Object.assign(nodeRefs, inner.nodeRefs);
        nodes.push(...inner.nodes);
        bypassLaneNodes.push(...inner.bypassLaneNodes);
        edges.push(...inner.edges);
        foreachGroups.push(...inner.foreachGroups);
        const firstId = inner.nodes[0]?.id;
        if (firstId) {
          edges.push({
            id: `${id}:${firstId}-default`,
            source: id,
            target: firstId,
            branchType: 'switch',
            label: 'default',
          });
        }
        branchExits.push(...inner.leafIds);
      } else {
        // Rule 3 — no explicit `default`: synthesize a bypass lane node labeled
        // 'default' so the implicit fall-through renders as a balanced, labeled
        // lane aside instead of an unlabeled edge from the gate.
        const bypassId = ids.allocate(`${step.name}-default-bypass`);
        bypassLaneNodes.push({ id: bypassId, style: { width: 1, height: 1 } });
        edges.push({
          id: `${id}:${bypassId}-default`,
          source: id,
          target: bypassId,
          branchType: 'switch',
          label: 'default',
        });
        branchExits.push(bypassId);
      }

      if (branchExits.length > 0) exitIds = dedupeIds(branchExits);
    } else if (step.type === 'merge') {
      const mergeStep = step as MergeStep;
      const childSteps = (mergeStep.steps as Step[]) ?? [];
      const inner = transformInternal([], childSteps, ids);
      Object.assign(nodeRefs, inner.nodeRefs);
      nodes.push(...inner.nodes);
      bypassLaneNodes.push(...inner.bypassLaneNodes);
      edges.push(...inner.edges);
      foreachGroups.push(...inner.foreachGroups);
      const firstId = inner.nodes[0]?.id;
      if (firstId) {
        edges.push({ id: `${id}:${firstId}`, source: id, target: firstId });
      }
      // Single contained body — exit from the wrapping step.
    }

    prevExitIds = exitIds;
  }

  return { nodes, edges, foreachGroups, bypassLaneNodes, nodeRefs, leafIds: prevExitIds };
}
