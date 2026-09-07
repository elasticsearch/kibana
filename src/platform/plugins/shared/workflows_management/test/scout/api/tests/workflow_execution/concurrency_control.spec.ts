/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { randomUUID } from 'node:crypto';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { WorkflowExecutionDto } from '@kbn/workflows/types/latest';
import { ExecutionStatus } from '@kbn/workflows/types/latest';
import type { WorkflowsApiService } from '../../../common/apis/workflows';
import { spaceTest } from '../../fixtures';

const getConcurrencyWorkflowYaml = (strategy: string, isolationKey: string) => `
name: Scout API Test Workflow
enabled: true
description: Temporary workflow created by Scout API tests
triggers:
  - type: manual
    inputs:
      type: object
      properties:
        env:
          type: string
        problem:
          type: string
settings:
  concurrency:
    key: "{{inputs.env}}-{{inputs.problem}}-${isolationKey}"
    strategy: "${strategy}"


steps:
  - name: hello_world_step_1
    type: console
    with:
      message: "Hello from Scout API test 1"
  - name: wait_step_1
    type: wait
    with:
      # Stay under the 5s engine threshold so waits sleep in-process instead of
      # parking on a workflow:resume Task Manager task (see handleExecutionDelay).
      duration: 2s
  - name: wait_step_2
    type: wait
    with:
      duration: 2s
  - name: hello_world_step_2
    type: console
    with:
      message: "Hello from Scout API test 2"
`;

spaceTest.describe(
  'Workflow execution concurrency control',
  { tag: tags.deploymentAgnostic },
  () => {
    spaceTest.afterAll(async ({ apiServices }) => {
      await apiServices.workflowsApi.deleteAll();
    });

    async function runConcurrencyWorkflow(
      workflowsApi: WorkflowsApiService,
      workflowId: string,
      isolationKey: string,
      { waitTimeout = 20_000 }: { waitTimeout?: number } = {}
    ) {
      const events = [
        { env: 'dev', problem: 'issue-1' },
        { env: 'prod', problem: 'issue-2' },
        { env: 'dev', problem: 'issue-1' },
        { env: 'dev', problem: 'issue-3' },
        { env: 'dev', problem: 'issue-1' },
      ];

      const scheduledExecutions: { workflowExecutionId: string; concurrencyKey: string }[] = [];

      for (const event of events) {
        const response = await workflowsApi.run(workflowId, event);

        scheduledExecutions.push({
          workflowExecutionId: response.workflowExecutionId,
          concurrencyKey: `${event.env}-${event.problem}-${isolationKey}`,
        });
      }

      const terminalExecutions = await Promise.all(
        scheduledExecutions.map((scheduledExecution) =>
          workflowsApi
            .waitForTermination({
              workflowExecutionId: scheduledExecution.workflowExecutionId,
              timeout: waitTimeout,
            })
            .then((execution) => ({
              execution,
              concurrencyKey: scheduledExecution.concurrencyKey,
            }))
        )
      );

      const groupedByConcurrencyKey = terminalExecutions.reduce(
        (acc, { execution, concurrencyKey }) => {
          acc[concurrencyKey] = acc[concurrencyKey] || [];

          if (execution) {
            acc[concurrencyKey].push(execution);
          }
          return acc;
        },
        {} as Record<string, WorkflowExecutionDto[]>
      );

      return groupedByConcurrencyKey;
    }

    // Failing: https://github.com/elastic/kibana/issues/270988
    spaceTest.skip(
      'cancel-in-progress strategy cancels previous executions and completes the latest',
      async ({ apiServices }) => {
        const isolationKey = randomUUID();
        const createdWorkflow = await apiServices.workflowsApi.create(
          getConcurrencyWorkflowYaml('cancel-in-progress', isolationKey)
        );

        const groupedExecutionsByConcurrencyKey = await runConcurrencyWorkflow(
          apiServices.workflowsApi,
          createdWorkflow.id,
          isolationKey
        );

        Object.entries(groupedExecutionsByConcurrencyKey).forEach(([, executions]) => {
          expect(executions.length).toBeGreaterThan(0);

          // Check that all executions except the last one are cancelled
          executions
            .filter((execution) => execution.status !== ExecutionStatus.COMPLETED)
            .forEach((execution) => {
              expect(execution?.status).toBe(ExecutionStatus.CANCELLED);
            });

          // Check that the last execution is completed
          const completedExecution = executions.filter(
            (execution) => execution.status === ExecutionStatus.COMPLETED
          );
          expect(completedExecution.at(0)?.status).toBe(ExecutionStatus.COMPLETED);
          expect(completedExecution.at(0)?.stepExecutions).toHaveLength(4);
        });
      }
    );

    // Failing: https://github.com/elastic/kibana/issues/257103
    spaceTest.skip(
      'drop strategy drops new executions until there is an already running execution',
      async ({ apiServices }) => {
        const isolationKey = randomUUID();
        const createdWorkflow = await apiServices.workflowsApi.create(
          getConcurrencyWorkflowYaml('drop', isolationKey)
        );

        const groupedExecutionsByConcurrencyKey = await runConcurrencyWorkflow(
          apiServices.workflowsApi,
          createdWorkflow.id,
          isolationKey
        );

        Object.entries(groupedExecutionsByConcurrencyKey).forEach(([, executions]) => {
          expect(executions.length).toBeGreaterThan(0);

          executions
            .filter((execution) => execution.status !== ExecutionStatus.COMPLETED)
            .forEach((execution) => {
              expect(execution?.status).toBe(ExecutionStatus.SKIPPED);
              expect(execution?.stepExecutions).toHaveLength(0);
            });

          const completedExecution = executions.filter(
            (execution) => execution.status === ExecutionStatus.COMPLETED
          );
          expect(completedExecution).toHaveLength(1);
          expect(completedExecution.at(0)?.status).toBe(ExecutionStatus.COMPLETED);
          expect(completedExecution.at(0)?.stepExecutions).toHaveLength(4);
        });
      }
    );

    // Failing: https://github.com/elastic/kibana/issues/285504
    spaceTest.skip(
      'queue strategy queues new executions and runs them sequentially until all complete',
      async ({ apiServices }) => {
        // Scout's default test timeout is 60s. Queue serialises 3 ~4s runs for
        // the same key (~12s), so 90s leaves CI headroom for Task Manager pickup.
        spaceTest.setTimeout(90_000);

        const isolationKey = randomUUID();
        const createdWorkflow = await apiServices.workflowsApi.create(
          getConcurrencyWorkflowYaml('queue', isolationKey)
        );

        // The queue strategy serialises executions per concurrency key. Waits are 2s
        // (under the 5s in-process vs workflow:resume threshold) so 3 queued runs
        // finish in ~12s without parking on Task Manager. 60s is still enough
        // headroom if the initial workflow:run claim is slow.
        const groupedExecutionsByConcurrencyKey = await runConcurrencyWorkflow(
          apiServices.workflowsApi,
          createdWorkflow.id,
          isolationKey,
          { waitTimeout: 60_000 }
        );

        Object.entries(groupedExecutionsByConcurrencyKey).forEach(([, executions]) => {
          expect(executions.length).toBeGreaterThan(0);

          // All executions must complete — none are skipped or cancelled
          executions.forEach((execution) => {
            expect(execution?.status).toBe(ExecutionStatus.COMPLETED);
            expect(execution?.stepExecutions).toHaveLength(4);
          });

          // Executions must be strictly sequential: no two runs for the same
          // concurrency key may overlap in time. Sort by startedAt and verify
          // that each run began only after the previous one finished.
          const sortedByStart = [...executions].sort(
            (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          );

          for (let i = 1; i < sortedByStart.length; i++) {
            const prev = sortedByStart[i - 1];
            const curr = sortedByStart[i];
            expect(new Date(curr.startedAt).getTime()).toBeGreaterThanOrEqual(
              new Date(prev.finishedAt).getTime()
            );
          }
        });
      }
    );
  }
);
