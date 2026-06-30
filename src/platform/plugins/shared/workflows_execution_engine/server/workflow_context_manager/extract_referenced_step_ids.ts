/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { extractPropertyPathsFromKql, scanForTemplateVariables } from '@kbn/workflows/common/utils';
import type { GraphNodeUnion } from '@kbn/workflows/graph';

const STEPS_PREFIX = 'steps.';

/**
 * Node types whose `condition` field can be a bare KQL string referencing step
 * outputs. For these we must KQL-parse the condition (not just Liquid-scan it),
 * otherwise an evicted referenced output is never rehydrated.
 */
const CONDITION_BEARING_NODE_TYPES = new Set<GraphNodeUnion['type']>([
  'enter-if',
  'enter-while',
  'exit-while',
  'enter-continue',
  'enter-then-branch',
  'enter-else-branch',
]);

/**
 * Reads a condition-bearing node's condition string regardless of where the
 * shape stores it: `configuration.condition` (enter-if, enter-while,
 * enter-continue) or a top-level `condition` (exit-while, condition branches).
 * Returns `undefined` when absent or non-string (e.g. a boolean
 * `enter-continue` condition).
 */
function getNodeConditionString(node: GraphNodeUnion): string | undefined {
  if (!CONDITION_BEARING_NODE_TYPES.has(node.type)) {
    return undefined;
  }
  const configuration = (node as { configuration?: { condition?: unknown } }).configuration;
  const fromConfiguration = configuration?.condition;
  if (typeof fromConfiguration === 'string') {
    return fromConfiguration;
  }
  const topLevel = (node as { condition?: unknown }).condition;
  if (typeof topLevel === 'string') {
    return topLevel;
  }
  return undefined;
}

/**
 * Per-node cache. Graph nodes are immutable for the lifetime of an execution,
 * and a single node can be analysed many times across loop iterations and
 * retries — memoising keyed by node reference removes the redundant scans
 * without retaining anything once the graph is GC'd.
 */
const referencedStepIdsCache = new WeakMap<GraphNodeUnion, Set<string> | null>();

/**
 * Extracts the set of step IDs referenced by a node's template expressions.
 *
 * Returns:
 * - `Set<string>` of referenced step IDs when all references can be statically resolved
 * - `null` when static analysis is ambiguous (e.g. dynamic bracket access like
 *    `steps[variables.x].output`) — caller should fall back to all predecessors
 *
 * For condition-bearing nodes (enter-if, enter-while, exit-while, enter-continue,
 * condition branches), condition strings are also analyzed via `extractPropertyPathsFromKql`
 * so bare-KQL references (no `{{ }}`) are discovered. The full node is scanned, not just
 * `configuration`, because some graph nodes render top-level fields or declare
 * `templateDependencies` for values rendered by their implementation.
 *
 * Result is memoised per-node — see {@link referencedStepIdsCache}.
 */
export function extractReferencedStepIds(node: GraphNodeUnion): Set<string> | null {
  if (referencedStepIdsCache.has(node)) {
    return referencedStepIdsCache.get(node) as Set<string> | null;
  }
  const result = computeReferencedStepIds(node);
  referencedStepIdsCache.set(node, result);
  return result;
}

function computeReferencedStepIds(node: GraphNodeUnion): Set<string> | null {
  try {
    const variables: string[] = [];

    // Condition strings (enter-if, enter-while, exit-while, enter-continue,
    // condition branches) can be authored as KQL that references step outputs
    // WITHOUT Liquid `{{ }}` markers — e.g. `steps.foo.output.status: "done"`.
    // `scanForTemplateVariables` only sees Liquid expressions, so such bare-KQL
    // conditions would otherwise be invisible to the rehydration planner,
    // leaving an evicted source un-rehydrated (blank render -> wrong control
    // flow). `extractPropertyPathsFromKql` handles both KQL field paths and any
    // embedded `{{ }}` templates, so it is safe to apply to every condition.
    const condition = getNodeConditionString(node);
    if (condition !== undefined) {
      variables.push(...extractPropertyPathsFromKql(condition));
    }

    // Scan the full graph node so template-bearing fields outside `configuration`
    // (for example exit-while.condition) are included automatically.
    variables.push(...scanForTemplateVariables(node));

    return extractReferencedStepIdsFromVariables(variables);
  } catch {
    // If template parsing fails for any reason, fall back to all predecessors
    return null;
  }
}

export function extractReferencedStepIdsFromVariables(variables: string[]): Set<string> | null {
  const referencedStepIds = new Set<string>();

  for (const variable of variables) {
    if (variable === 'steps') {
      // Bare `steps` reference means the path was truncated at a dynamic bracket access
      // (e.g. `steps[variables.name].output`). We cannot determine the step ID statically.
      return null;
    }

    if (variable.startsWith(STEPS_PREFIX)) {
      // Extract step ID: `steps.myStep.output.field` → `myStep`
      const dotIndex = variable.indexOf('.', STEPS_PREFIX.length);
      const stepId =
        dotIndex === -1
          ? variable.slice(STEPS_PREFIX.length)
          : variable.slice(STEPS_PREFIX.length, dotIndex);

      if (stepId) {
        referencedStepIds.add(stepId);
      }
    }
  }

  return referencedStepIds;
}
