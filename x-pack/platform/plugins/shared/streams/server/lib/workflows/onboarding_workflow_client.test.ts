/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { httpServerMock } from '@kbn/core/server/mocks';
import { SigEventsWorkflowStatus } from '@kbn/streams-schema';
import { ExecutionStatus } from '@kbn/workflows';
import {
  getManagedWorkflowDefinition,
  STREAMS_KI_ONBOARDING_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import {
  StreamsKIsOnboardingClient,
  buildConcurrencyKey,
  parseStreamNameFromConcurrencyKey,
} from './onboarding_workflow_client';
const createMockManagementApi = (overrides: Record<string, jest.Mock> = {}) => ({
  getWorkflow: jest.fn().mockResolvedValue({
    id: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
    name: 'onboarding',
    enabled: true,
    definition: {},
    yaml: '',
  }),
  runWorkflow: jest.fn().mockResolvedValue('execution-id'),
  getWorkflowExecutions: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  getWorkflowExecution: jest.fn().mockResolvedValue(null),
  cancelWorkflowExecution: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createClient = (overrides: Record<string, jest.Mock> = {}) => {
  const managementApi = createMockManagementApi(overrides);
  const telemetry = { trackOnboardingScheduled: jest.fn() } as never;
  const client = new StreamsKIsOnboardingClient({
    managementApi: managementApi as never,
    telemetry,
  });
  return { client, managementApi, telemetry };
};

describe('StreamsKIsOnboardingClient', () => {
  describe('buildConcurrencyKey', () => {
    it('prepends the prefix to the stream name', () => {
      expect(buildConcurrencyKey('my-stream')).toBe('streams-ki-onboarding-my-stream');
    });
  });

  describe('parseStreamNameFromConcurrencyKey', () => {
    it('extracts the stream name from a valid key', () => {
      expect(parseStreamNameFromConcurrencyKey('streams-ki-onboarding-my-stream')).toBe(
        'my-stream'
      );
    });

    it('returns null for keys with a different prefix', () => {
      expect(parseStreamNameFromConcurrencyKey('other-prefix-my-stream')).toBeNull();
    });

    it('round-trips with buildConcurrencyKey', () => {
      const streamName = 'logs.nginx';
      expect(parseStreamNameFromConcurrencyKey(buildConcurrencyKey(streamName))).toBe(streamName);
    });
  });

  describe('concurrency key sync with onboarding YAML', () => {
    it('buildConcurrencyKey produces keys that match the YAML concurrency template', () => {
      const definition = getManagedWorkflowDefinition(STREAMS_KI_ONBOARDING_WORKFLOW_ID);
      expect(definition).toBeDefined();
      expect(definition!.yaml).toBeDefined();

      const parsed = parse(definition!.yaml!) as {
        settings: { concurrency: { key: string } };
      };
      const yamlTemplate = parsed.settings.concurrency.key;

      const streamName = 'test-stream';
      const expectedKey = yamlTemplate.replace('{{ inputs.streamName }}', streamName);

      expect(buildConcurrencyKey(streamName)).toBe(expectedKey);
    });
  });

  describe('run', () => {
    it('fetches the workflow definition and runs it and returns executionId', async () => {
      const { client, managementApi } = createClient();
      const request = httpServerMock.createKibanaRequest();

      const result = await client.run({
        inputs: {
          streamName: 'logs.nginx',
          features: { skip: false, start: 1000, end: 2000 },
          queries: { skip: false },
        },
        request,
      });

      expect(result).toEqual({ executionId: 'execution-id' });
      expect(managementApi.getWorkflow).toHaveBeenCalledWith(
        STREAMS_KI_ONBOARDING_WORKFLOW_ID,
        '*'
      );
      expect(managementApi.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ id: STREAMS_KI_ONBOARDING_WORKFLOW_ID }),
        'default',
        expect.objectContaining({ streamName: 'logs.nginx' }),
        request
      );
    });

    it('throws when the workflow is not found', async () => {
      const { client } = createClient({
        getWorkflow: jest.fn().mockResolvedValue(null),
      });
      const request = httpServerMock.createKibanaRequest();

      await expect(
        client.run({
          inputs: {
            streamName: 'logs.nginx',
            features: { skip: false, start: 1000, end: 2000 },
            queries: { skip: false },
          },
          request,
        })
      ).rejects.toThrow(/not found/);
    });

    it('throws when the workflow has no definition', async () => {
      const { client } = createClient({
        getWorkflow: jest.fn().mockResolvedValue({ id: 'wf', definition: null }),
      });
      const request = httpServerMock.createKibanaRequest();

      await expect(
        client.run({
          inputs: {
            streamName: 'logs.nginx',
            features: { skip: false, start: 1000, end: 2000 },
            queries: { skip: false },
          },
          request,
        })
      ).rejects.toThrow(/not found/);
    });
  });

  describe('getStatus', () => {
    it('returns NotStarted when no executions exist', async () => {
      const { client } = createClient();

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({ status: SigEventsWorkflowStatus.NotStarted, executionId: null });
    });

    it('returns InProgress for a running execution', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }],
        }),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.InProgress,
        executionId: 'exec-1',
      });
    });

    it('returns Completed with output details for a completed execution', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.COMPLETED }],
        }),
        getWorkflowExecution: jest.fn().mockResolvedValue({
          context: {
            output: {
              featuresSkipped: false,
              discoveredFeatures: ['f1', 'f2'],
              featuresConnectorUsed: 'connector-1',
              featuresTokensUsed: { prompt: 100, completion: 50 },
              queriesSkipped: true,
              persistedQueries: [],
              queriesConnectorUsed: '',
              queriesTokensUsed: {},
            },
          },
        }),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.Completed,
        executionId: 'exec-1',
        features: {
          skipped: false,
          discovered: ['f1', 'f2'],
          connectorUsed: 'connector-1',
          tokensUsed: { prompt: 100, completion: 50 },
        },
        queries: {
          skipped: true,
          persisted: [],
          connectorUsed: '',
          tokensUsed: {},
        },
      });
    });

    it('returns Completed with defaults when full execution fetch returns null', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.COMPLETED }],
        }),
        getWorkflowExecution: jest.fn().mockResolvedValue(null),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.Completed,
        executionId: 'exec-1',
        features: {
          skipped: false,
          discovered: [],
          connectorUsed: '',
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        },
        queries: {
          skipped: false,
          persisted: [],
          connectorUsed: '',
          tokensUsed: { prompt: 0, completion: 0, total: 0 },
        },
      });
    });

    it('returns Failed with error message for a failed execution', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [
            {
              id: 'exec-1',
              status: ExecutionStatus.FAILED,
              error: { message: 'something broke' },
            },
          ],
        }),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.Failed,
        executionId: 'exec-1',
        error: 'something broke',
      });
    });

    it('returns Failed with timeout message for a timed-out execution', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.TIMED_OUT, error: null }],
        }),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.Failed,
        executionId: 'exec-1',
        error: 'Workflow system-streams-ki-onboarding timed out',
      });
    });

    it('returns Canceled for a cancelled execution', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.CANCELLED }],
        }),
      });

      const result = await client.getStatus({ streamName: 'logs.nginx' });

      expect(result).toEqual({
        status: SigEventsWorkflowStatus.Canceled,
        executionId: 'exec-1',
      });
    });

    it('queries with the correct concurrency group key', async () => {
      const { client, managementApi } = createClient();

      await client.getStatus({ streamName: 'logs.nginx' });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          concurrencyGroupKey: 'streams-ki-onboarding-logs.nginx',
          size: 1,
        }),
        'default'
      );
    });
  });

  describe('getStatuses', () => {
    it('returns an empty map and skips the query for no stream names', async () => {
      const { client, managementApi } = createClient();

      const result = await client.getStatuses({ streamNames: [] });

      expect(result).toEqual({});
      expect(managementApi.getWorkflowExecutions).not.toHaveBeenCalled();
    });

    it('fetches executions collapsed by concurrencyGroupKey in a single query', async () => {
      const { client, managementApi } = createClient();

      await client.getStatuses({ streamNames: ['logs.nginx', 'logs.apache'] });

      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledTimes(1);
      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
          size: 10000,
          sortField: 'createdAt',
          sortOrder: 'desc',
          collapse: 'concurrencyGroupKey',
        }),
        'default'
      );
    });

    it('maps each execution to a status summary and fills missing streams with NotStarted', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [
            {
              id: 'exec-1',
              status: ExecutionStatus.RUNNING,
              concurrencyGroupKey: 'streams-ki-onboarding-logs.nginx',
            },
            {
              id: 'exec-2',
              status: ExecutionStatus.COMPLETED,
              concurrencyGroupKey: 'streams-ki-onboarding-logs.apache',
            },
            {
              id: 'exec-3',
              status: ExecutionStatus.FAILED,
              error: { message: 'boom' },
              concurrencyGroupKey: 'streams-ki-onboarding-logs.haproxy',
            },
          ],
        }),
      });

      const result = await client.getStatuses({
        streamNames: ['logs.nginx', 'logs.apache', 'logs.haproxy', 'logs.envoy'],
      });

      expect(result).toEqual({
        'logs.nginx': { status: SigEventsWorkflowStatus.InProgress, executionId: 'exec-1' },
        'logs.apache': { status: SigEventsWorkflowStatus.Completed, executionId: 'exec-2' },
        'logs.haproxy': {
          status: SigEventsWorkflowStatus.Failed,
          executionId: 'exec-3',
          error: 'boom',
        },
        'logs.envoy': { status: SigEventsWorkflowStatus.NotStarted, executionId: null },
      });
    });

    it('does not fetch the completed output for completed executions', async () => {
      const getWorkflowExecution = jest.fn().mockResolvedValue(null);
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [
            {
              id: 'exec-1',
              status: ExecutionStatus.COMPLETED,
              concurrencyGroupKey: 'streams-ki-onboarding-logs.nginx',
            },
          ],
        }),
        getWorkflowExecution,
      });

      const result = await client.getStatuses({ streamNames: ['logs.nginx'] });

      expect(result).toEqual({
        'logs.nginx': { status: SigEventsWorkflowStatus.Completed, executionId: 'exec-1' },
      });
      expect(getWorkflowExecution).not.toHaveBeenCalled();
    });

    it('ignores executions whose concurrency group key is unknown or unrequested', async () => {
      const { client } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [
            { id: 'exec-1', status: ExecutionStatus.RUNNING, concurrencyGroupKey: undefined },
            {
              id: 'exec-2',
              status: ExecutionStatus.RUNNING,
              concurrencyGroupKey: 'streams-ki-onboarding-not-requested',
            },
          ],
        }),
      });

      const result = await client.getStatuses({ streamNames: ['logs.nginx'] });

      expect(result).toEqual({
        'logs.nginx': { status: SigEventsWorkflowStatus.NotStarted, executionId: null },
      });
    });
  });

  describe('cancel', () => {
    it('cancels the latest execution for the stream', async () => {
      const { client, managementApi } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }],
        }),
      });
      const request = httpServerMock.createKibanaRequest();

      await client.cancel({ streamName: 'logs.nginx', request });

      expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledWith(
        'exec-1',
        'default',
        request
      );
    });

    it('does nothing when no execution exists', async () => {
      const { client, managementApi } = createClient();
      const request = httpServerMock.createKibanaRequest();

      await client.cancel({ streamName: 'logs.nginx', request });

      expect(managementApi.cancelWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('cancelAllRunning', () => {
    it('cancels all non-terminal onboarding executions', async () => {
      const { client, managementApi } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({
          results: [
            { id: 'exec-1', status: ExecutionStatus.RUNNING },
            { id: 'exec-2', status: ExecutionStatus.PENDING },
          ],
        }),
      });
      const request = httpServerMock.createKibanaRequest();

      await client.cancelAllRunning({ request });

      expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledTimes(2);
      expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledWith(
        'exec-1',
        'default',
        request
      );
      expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledWith(
        'exec-2',
        'default',
        request
      );
    });

    it('does nothing when no running executions exist', async () => {
      const { client, managementApi } = createClient();
      const request = httpServerMock.createKibanaRequest();

      await client.cancelAllRunning({ request });

      expect(managementApi.cancelWorkflowExecution).not.toHaveBeenCalled();
    });
  });

  describe('getRecentExecutions', () => {
    it('returns one execution per stream collapsed by concurrencyGroupKey', async () => {
      const executions = [
        { id: 'exec-1', status: ExecutionStatus.COMPLETED },
        { id: 'exec-2', status: ExecutionStatus.RUNNING },
      ];
      const { client, managementApi } = createClient({
        getWorkflowExecutions: jest.fn().mockResolvedValue({ results: executions }),
      });

      const result = await client.getRecentExecutions();

      expect(result).toEqual(executions);
      expect(managementApi.getWorkflowExecutions).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'createdAt',
          sortOrder: 'desc',
          size: 10000,
          collapse: 'concurrencyGroupKey',
        }),
        'default'
      );
    });

    it('returns empty array when no executions exist', async () => {
      const { client } = createClient();

      const result = await client.getRecentExecutions();

      expect(result).toEqual([]);
    });
  });
});
