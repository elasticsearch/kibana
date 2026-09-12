/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import type { RunCaseWorkflowRequest, RunCaseWorkflowResponse } from '../../../common/types/api';
import { getRunCaseWorkflowUrl } from '../../../common/api';

export const runCaseWorkflow = async ({
  http,
  workflowId,
  body,
}: {
  http: HttpStart;
  workflowId: string;
  body: RunCaseWorkflowRequest;
}): Promise<RunCaseWorkflowResponse> =>
  http.post<RunCaseWorkflowResponse>(getRunCaseWorkflowUrl(workflowId), {
    body: JSON.stringify(body),
  });
