/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { SigEventsWorkflowStatus } from '@kbn/streams-schema';
import { ExecutionStatus } from '@kbn/workflows';
import { StreamsKIsOnboardingClient } from '../../../lib/workflows/onboarding_workflow_client';
import { cancelKiIdentificationToolHandler } from './handler';

describe('cancelKiIdentificationToolHandler', () => {
  it('cancels the latest workflow execution and returns cancel status', async () => {
    const managementApi = {
      getWorkflowExecutions: jest.fn().mockResolvedValue({
        results: [{ id: 'exec-1', status: ExecutionStatus.RUNNING }],
      }),
      cancelWorkflowExecution: jest.fn().mockResolvedValue(undefined),
    };
    const telemetry = { trackOnboardingScheduled: jest.fn() } as never;
    const streamsKIsOnboardingClient = new StreamsKIsOnboardingClient({
      managementApi: managementApi as never,
      telemetry,
    });
    const request = httpServerMock.createKibanaRequest();

    const result = await cancelKiIdentificationToolHandler({
      streamName: 'logs.nginx',
      streamsKIsOnboardingClient,
      request,
    });

    expect(managementApi.cancelWorkflowExecution).toHaveBeenCalledWith(
      'exec-1',
      'default',
      request
    );
    expect(result).toEqual({
      stream_name: 'logs.nginx',
      execution_id: 'exec-1',
      status: SigEventsWorkflowStatus.Canceled,
    });
  });

  it('returns cancel status with null execution_id when no execution is found', async () => {
    const managementApi = {
      getWorkflowExecutions: jest.fn().mockResolvedValue({ results: [] }),
      cancelWorkflowExecution: jest.fn(),
    };
    const telemetry = { trackOnboardingScheduled: jest.fn() } as never;
    const streamsKIsOnboardingClient = new StreamsKIsOnboardingClient({
      managementApi: managementApi as never,
      telemetry,
    });
    const request = httpServerMock.createKibanaRequest();

    const result = await cancelKiIdentificationToolHandler({
      streamName: 'logs.nginx',
      streamsKIsOnboardingClient,
      request,
    });

    expect(managementApi.cancelWorkflowExecution).not.toHaveBeenCalled();
    expect(result).toEqual({
      stream_name: 'logs.nginx',
      execution_id: null,
      status: SigEventsWorkflowStatus.Canceled,
    });
  });
});
