/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/api';
import { ExecutionStatus } from '@kbn/workflows/types/latest';
import type { ApiClient } from '../fixtures';
import { apiTest, tags, testData, waitForExecution } from '../fixtures';

// Inline IDs to avoid pulling in @kbn/workflows, which imports YAML files that
// Playwright's esbuild transform cannot load (same convention as the
// significant_events managed-workflows spec).
const RULE_PREVIEW_WORKFLOW_ID = 'system-security-rule-preview';
const DARK_CTH_WORKFLOW_ID = 'system-security-dark-continuous-threat-hunt';

// The workflow.output step persists its rendered `with:` object as the step's
// own `output`. Each step produces two entries in stepExecutions — an "enter"
// record (output: null) and a "result" record (output: data) — so read the
// emit_result result record, never the execution-level DTO (which has no output).
const EMIT_RESULT_STEP_ID = 'emit_result';

type Execution = Awaited<ReturnType<typeof waitForExecution>>;

const emitResultOutput = (execution: Execution): Record<string, unknown> => {
  const emit = (execution.stepExecutions ?? []).find(
    (s) => s.stepId === EMIT_RESULT_STEP_ID && s.output != null
  );
  return (emit?.output ?? {}) as Record<string, unknown>;
};

// A valid ESQL rule preview that matches nothing, so it exercises the real
// enforcing surface (kibana.request → detection_engine/rules/preview → the
// .preview alert index) and reports a finite (zero) count.
const happyPathPreviewBody = () => ({
  type: 'esql',
  language: 'esql',
  name: 'AlertZero preview smoke',
  description: 'Matches nothing; verifies the preview workflow reports a finite alert count.',
  query: 'FROM logs-* | WHERE false',
  severity: 'low',
  risk_score: 21,
  invocationCount: 1,
  timeframeEnd: new Date().toISOString(),
});

const runManagedWorkflow = async (
  apiClient: ApiClient,
  headers: Record<string, string>,
  workflowId: string,
  inputs: Record<string, unknown>
): Promise<Execution> => {
  const res = await apiClient.post(`/api/workflows/workflow/${workflowId}/run`, {
    headers,
    responseType: 'json',
    body: { inputs },
  });
  expect(res).toHaveStatusCode(200);
  const executionId = (res.body as { workflowExecutionId: string }).workflowExecutionId;
  return waitForExecution(apiClient, headers, executionId);
};

apiTest.describe(
  'AlertZero managed detection-rule workflows',
  { tag: [...tags.stateful.classic] },
  () => {
    apiTest('rule_preview: is installed and valid', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('editor');
      await expect
        .poll(
          async () => {
            const response = await apiClient.get(
              `api/workflows/workflow/${RULE_PREVIEW_WORKFLOW_ID}`,
              { headers: { ...cookieHeader, ...testData.COMMON_HEADERS }, responseType: 'json' }
            );
            return response.statusCode === 200 ? response.body.valid : false;
          },
          { timeout: 20_000, intervals: [1_000] }
        )
        .toBe(true);
    });

    apiTest(
      'rule_preview: succeeds and returns a finite alert count',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asInteractiveUser('editor');
        const headers = { ...cookieHeader, ...testData.COMMON_HEADERS };

        const execution = await runManagedWorkflow(apiClient, headers, RULE_PREVIEW_WORKFLOW_ID, {
          preview_body: happyPathPreviewBody(),
          space_id: 'default',
        });

        expect(execution.status).toBe(ExecutionStatus.COMPLETED);
        const outputs = emitResultOutput(execution);
        expect(outputs.succeeded).toBe(true);
        // The count must be a finite number — this is the value callers diff
        // tuning proposals on, so NaN/-1/missing is a coverage regression.
        expect(Number.isFinite(outputs.alert_count as number)).toBe(true);
        expect(outputs.error_text ?? '').toBe('');
      }
    );

    apiTest(
      'dark_continuous_threat_hunt: stays a stub until real coverage exists',
      async ({ apiClient, samlAuth }) => {
        // Guard against #290148-style landings: if this workflow ever stops
        // being a console stub, this assertion fails and forces a real
        // executing test (and eval suite) to be added in the same PR.
        const { cookieHeader } = await samlAuth.asInteractiveUser('editor');
        const response = await apiClient.get(`api/workflows/workflow/${DARK_CTH_WORKFLOW_ID}`, {
          headers: { ...cookieHeader, ...testData.COMMON_HEADERS },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        const yaml = (response.body as { yaml?: string }).yaml ?? '';
        expect(yaml).toContain('type: console');
      }
    );
  }
);
