/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import type { RunWorkflowExecutor } from '@kbn/workflows-ui';
import type { CaseWorkflowRunOrigin } from '../../../common/types/api';
import { useAppUrl, useHttp, useKibana, useToasts } from '../../common/lib/kibana';
import { useRefreshCaseViewPage } from '../case_view/use_on_refresh_case_view_page';
import { runCaseWorkflow } from './api';
import { buildViewExecutionText } from './use_run_workflow_on_cases';
import * as i18n from './translations';

export interface UseCasesWorkflowExecutorParams {
  caseId: string;
  origin: CaseWorkflowRunOrigin;
}

/**
 * Returns a stable `RunWorkflowExecutor` that routes execution through the
 * Cases-owned endpoint, ensuring authorization, audit logging, and activity
 * recording are all handled server-side.
 *
 * The executor owns the success or activity-write warning toast so the caller
 * can suppress the panel's built-in success toast.
 */
export const useCasesWorkflowExecutor = ({
  caseId,
  origin,
}: UseCasesWorkflowExecutorParams): RunWorkflowExecutor => {
  const http = useHttp();
  const toasts = useToasts();
  const { getAppUrl } = useAppUrl(WORKFLOWS_APP_ID);
  const { rendering } = useKibana().services;
  const refreshCaseViewPage = useRefreshCaseViewPage();

  return useCallback(
    async ({ workflowId, inputs }) => {
      const response = await runCaseWorkflow({
        http,
        workflowId,
        body: {
          caseIds: [caseId],
          inputs,
          origin,
        },
      });

      const executionHref = response.workflowExecutionId
        ? getAppUrl({ path: `${workflowId}?executionId=${response.workflowExecutionId}` })
        : undefined;

      const text =
        executionHref && rendering ? buildViewExecutionText(executionHref, rendering) : undefined;

      if (response.activityStatus === 'failed') {
        toasts.addWarning({ title: i18n.WORKFLOW_ACTIVITY_FAILED, text });
      } else {
        toasts.addSuccess({ title: i18n.RUN_WORKFLOW_STARTED(1), text });
      }
      refreshCaseViewPage();

      return { workflowExecutionId: response.workflowExecutionId };
    },
    [caseId, getAppUrl, http, origin, refreshCaseViewPage, rendering, toasts]
  );
};
