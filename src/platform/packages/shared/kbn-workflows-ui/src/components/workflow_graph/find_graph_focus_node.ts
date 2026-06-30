/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WORKFLOW_GRAPH_FOCUS_TRIGGER } from '@kbn/workflows';

export interface GraphFocusNode {
  readonly id: string;
  readonly type?: string;
  readonly data?: { readonly label?: string };
}

/**
 * Resolves which graph node to centre on for an initial viewport focus.
 * Matches by node id or step label; `WORKFLOW_GRAPH_FOCUS_TRIGGER` maps to the
 * first trigger node.
 */
export function findGraphFocusNode<N extends GraphFocusNode>(
  nodes: readonly N[],
  focusStepId: string
): N | undefined {
  const byIdOrLabel = nodes.find((n) => {
    const label = n.data?.label;
    return n.id === focusStepId || label === focusStepId;
  });
  if (byIdOrLabel) {
    return byIdOrLabel;
  }
  if (focusStepId === WORKFLOW_GRAPH_FOCUS_TRIGGER) {
    return nodes.find((n) => n.type === 'trigger');
  }
  return undefined;
}
