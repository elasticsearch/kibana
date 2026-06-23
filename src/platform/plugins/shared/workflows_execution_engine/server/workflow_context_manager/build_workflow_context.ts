/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core/server';
import type { EsWorkflowExecution, WorkflowContext } from '@kbn/workflows';
import {
  applyInputDefaults,
  getInputsFromDefinition,
} from '@kbn/workflows/spec/lib/field_conversion';
import type { ContextDependencies } from './types';
import { buildWorkflowExecutionUrl, getKibanaUrl } from '../utils';

export type WorkflowExecutionForInputRendering = Partial<EsWorkflowExecution> &
  Pick<EsWorkflowExecution, 'id' | 'workflowId' | 'spaceId' | 'createdAt'>;

export function buildInputDefaultRenderContext(
  workflowExecution: WorkflowExecutionForInputRendering,
  coreStart?: CoreStart,
  dependencies?: ContextDependencies
): WorkflowContext {
  const startedAt = workflowExecution.startedAt ?? workflowExecution.createdAt;
  const kibanaUrl = getKibanaUrl(coreStart, dependencies?.cloudSetup);
  const executionUrl = buildWorkflowExecutionUrl(
    kibanaUrl,
    workflowExecution.spaceId,
    workflowExecution.workflowId,
    workflowExecution.id
  );
  const parentWorkflowId = workflowExecution.context?.parentWorkflowId as string | undefined;
  const parentWorkflowExecutionId = workflowExecution.context?.parentWorkflowExecutionId as
    | string
    | undefined;
  const parentDepth = workflowExecution.context?.parentDepth as number | undefined;
  const metadata = (workflowExecution.metadata ??
    (workflowExecution.context?.metadata as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined;

  return {
    execution: {
      id: workflowExecution.id,
      isTestRun: !!workflowExecution.isTestRun,
      startedAt: new Date(startedAt),
      url: executionUrl,
      executedBy: workflowExecution.executedBy ?? 'unknown',
      triggeredBy: workflowExecution.triggeredBy,
      usage: workflowExecution.usage,
    },
    workflow: {
      id: workflowExecution.workflowId,
      name: workflowExecution.workflowDefinition?.name ?? '',
      enabled: workflowExecution.workflowDefinition?.enabled ?? false,
      spaceId: workflowExecution.spaceId,
    },
    kibanaUrl,
    consts: workflowExecution.workflowDefinition?.consts ?? {},
    event: workflowExecution.context?.event,
    inputs: workflowExecution.context?.inputs as Record<string, unknown> | undefined,
    output: workflowExecution.context?.output,
    now: new Date(),
    parent:
      parentWorkflowId && parentWorkflowExecutionId
        ? {
            workflowId: parentWorkflowId,
            executionId: parentWorkflowExecutionId,
            depth: parentDepth !== undefined ? parentDepth + 1 : 0,
          }
        : undefined,
    metadata,
  };
}

export function buildWorkflowContext(
  workflowExecution: EsWorkflowExecution,
  coreStart?: CoreStart,
  dependencies?: ContextDependencies
): WorkflowContext {
  const normalizedInputsSchema = getInputsFromDefinition(workflowExecution.workflowDefinition);
  const renderContext = buildInputDefaultRenderContext(workflowExecution, coreStart, dependencies);
  const inputsWithDefaults = applyInputDefaults(renderContext.inputs, normalizedInputsSchema);

  return {
    ...renderContext,
    inputs: inputsWithDefaults,
  };
}
