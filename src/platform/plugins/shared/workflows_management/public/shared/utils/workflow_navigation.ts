/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApplicationStart } from '@kbn/core/public';
import { PLUGIN_ID } from '../../../common';

export interface WorkflowDetailRouteState {
  workflowsListSearch?: string;
}

export const getWorkflowDetailRouteState = (
  workflowsListSearch: string
): WorkflowDetailRouteState | undefined => {
  return workflowsListSearch ? { workflowsListSearch } : undefined;
};

export const getWorkflowsListPathFromDetailRouteState = (
  state: WorkflowDetailRouteState | undefined
): string | undefined => {
  const workflowsListSearch = state?.workflowsListSearch;

  if (!workflowsListSearch) {
    return undefined;
  }

  return workflowsListSearch.startsWith('?') ? workflowsListSearch : `?${workflowsListSearch}`;
};

export const navigateToWorkflowsList = (
  application: ApplicationStart,
  state: WorkflowDetailRouteState | undefined
): Promise<void> => {
  const workflowsListPath = getWorkflowsListPathFromDetailRouteState(state);

  return application.navigateToApp(
    PLUGIN_ID,
    workflowsListPath ? { path: workflowsListPath } : undefined
  );
};
