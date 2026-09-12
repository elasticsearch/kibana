/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButton, EuiFlexGroup } from '@elastic/eui';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { ToMountPointParams } from '@kbn/react-kibana-mount';
import type { RunWorkflowExecutor } from '@kbn/workflows-ui';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import { useToasts, useAppUrl, useKibana, useHttp } from '../../common/lib/kibana';
import type { CasesUI } from '../../containers/types';
import { runCaseWorkflow } from './api';
import * as i18n from './translations';

/** Builds the `text` mount point for the right-aligned "View execution" button. */
export const buildViewExecutionText = (executionHref: string, rendering: ToMountPointParams) =>
  toMountPoint(
    <EuiFlexGroup justifyContent="flexEnd">
      <EuiButton
        size="s"
        href={executionHref}
        target="_blank"
        rel="noopener noreferrer"
        data-test-subj="cases-run-workflow-view-execution-button"
      >
        {i18n.VIEW_WORKFLOW_EXECUTION}
      </EuiButton>
    </EuiFlexGroup>,
    rendering
  );

/**
 * Returns a stable `RunWorkflowExecutor` that handles 1..N selected cases.
 *
 * All selections — single or bulk — fire a single workflow execution against the
 * multi-case endpoint. The server owns `event.caseIds`; the client passes the
 * authorized case ids in `body.caseIds` and the server injects them into the event.
 *
 * The panel's built-in success toast must be suppressed (`showSuccessToast={false}`)
 * because this executor owns all toasting. On API error it rethrows so the
 * panel can show its own error toast.
 */
export const useRunWorkflowOnCases = ({ cases }: { cases: CasesUI }): RunWorkflowExecutor => {
  const http = useHttp();
  const toasts = useToasts();
  const { getAppUrl } = useAppUrl(WORKFLOWS_APP_ID);
  const { rendering } = useKibana().services;

  return useCallback(
    async ({ workflowId, inputs }) => {
      const caseIds = cases.map(({ id }) => id);

      const response = await runCaseWorkflow({
        http,
        workflowId,
        body: {
          caseIds,
          inputs,
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
        toasts.addSuccess({ title: i18n.RUN_WORKFLOW_STARTED(cases.length), text });
      }

      return { workflowExecutionId: response.workflowExecutionId };
    },
    [cases, getAppUrl, http, rendering, toasts]
  );
};
