/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type BaseStepDefinition, getBuiltInStepDefinition } from '@kbn/workflows';
import type { WorkflowGraph } from '@kbn/workflows/graph';

type SyncWorkflowGraph = Pick<WorkflowGraph, 'getNode' | 'topologicalOrder'>;

type GetExtensionStepDefinition = (stepType: string) => BaseStepDefinition | undefined;

export const validateSyncWorkflow = (
  workflowGraph: SyncWorkflowGraph,
  getExtensionStepDefinition: GetExtensionStepDefinition
): void => {
  for (const nodeId of workflowGraph.topologicalOrder) {
    const node = workflowGraph.getNode(nodeId);
    if (node?.stepType) {
      const definition =
        getBuiltInStepDefinition(node.stepType) ?? getExtensionStepDefinition(node.stepType);
      if (definition?.supportedExecutionModes?.includes('sync') === false) {
        throw new Error(
          `Step "${node.stepId}" (${node.stepType}) is not supported in synchronous workflows`
        );
      }
    }
  }
};
