/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { ChangeHistoryAdapter } from '@kbn/change-history-ui';
import { useGlobalUiSetting } from '@kbn/kibana-react-plugin/public';
import { WORKFLOWS_VERSIONING_SETTING_ID } from '@kbn/workflows/common/constants';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';

import { createWorkflowChangeHistoryAdapter } from './workflow_change_history_adapter';
import type { AppDispatch } from '../../entities/workflows/store/store';
import { selectWorkflow } from '../../entities/workflows/store/workflow_detail/selectors';
import { loadWorkflowThunk } from '../../entities/workflows/store/workflow_detail/thunks/load_workflow_thunk';
import { useKibana } from '../../hooks/use_kibana';

export const useWorkflowVersioningEnabled = (): boolean =>
  useGlobalUiSetting<boolean>(WORKFLOWS_VERSIONING_SETTING_ID, false);

export const useWorkflowChangeHistoryEnabled = (): boolean => {
  const isVersioningEnabled = useWorkflowVersioningEnabled();
  const { canReadWorkflow } = useWorkflowsCapabilities();

  return isVersioningEnabled && canReadWorkflow;
};

export const useWorkflowChangeHistoryAdapter = (workflowId: string): ChangeHistoryAdapter => {
  const dispatch = useDispatch<AppDispatch>();
  const { http } = useKibana().services;
  const onWorkflowRestored = useCallback(
    async (objectId: string) => {
      await dispatch(loadWorkflowThunk({ id: objectId || workflowId }));
    },
    [dispatch, workflowId]
  );

  return useMemo(
    () => createWorkflowChangeHistoryAdapter(http, { onWorkflowRestored }),
    [http, onWorkflowRestored]
  );
};

export const useWorkflowChangeHistoryRestoreEligibility = (): boolean => {
  const { canUpdateWorkflow } = useWorkflowsCapabilities();
  const workflow = useSelector(selectWorkflow);

  if (!workflow) {
    return false;
  }

  return Boolean(canUpdateWorkflow && workflow.managed !== true);
};
