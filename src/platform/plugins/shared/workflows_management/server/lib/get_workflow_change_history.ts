/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowDetailDto } from '@kbn/workflows';
import { WorkflowNotFoundError } from '@kbn/workflows/common/errors';

import { mapWorkflowHistoryItem } from './map_workflow_history_item';
import { WorkflowChangeHistoryDisabledError } from './workflow_change_history_disabled_error';
import type { WorkflowChangesHistoryResponse } from '../../common/lib/workflow_change_history/types';
import type { IWorkflowChangeHistoryService } from '../services/workflow_change_history_types';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;

export interface GetWorkflowChangeHistoryDeps {
  changeHistoryService: IWorkflowChangeHistoryService;
  getWorkflow: (id: string, spaceId: string) => Promise<WorkflowDetailDto | null>;
  workflowVersioningEnabled: boolean;
}

export interface GetHistoryForWorkflowParams {
  workflowId: string;
  spaceId: string;
  page?: number;
  perPage?: number;
}

export const assertWorkflowChangeHistoryEnabled = (
  changeHistoryService: IWorkflowChangeHistoryService,
  workflowVersioningEnabled: boolean
): void => {
  if (!changeHistoryService.isInitialized()) {
    throw new WorkflowChangeHistoryDisabledError('Workflow version history is not available.');
  }

  if (!workflowVersioningEnabled) {
    throw new WorkflowChangeHistoryDisabledError();
  }
};

export const getHistoryForWorkflow = async (
  deps: GetWorkflowChangeHistoryDeps,
  {
    workflowId,
    spaceId,
    page = DEFAULT_PAGE,
    perPage = DEFAULT_PER_PAGE,
  }: GetHistoryForWorkflowParams
): Promise<WorkflowChangesHistoryResponse> => {
  assertWorkflowChangeHistoryEnabled(deps.changeHistoryService, deps.workflowVersioningEnabled);

  const workflow = await deps.getWorkflow(workflowId, spaceId);
  if (!workflow) {
    throw new WorkflowNotFoundError(workflowId);
  }

  const result = await deps.changeHistoryService.getHistory(spaceId, workflowId, {
    from: (page - 1) * perPage,
    size: perPage,
  });

  return {
    page,
    perPage,
    total: result.total,
    items: result.items.map(mapWorkflowHistoryItem),
  };
};
