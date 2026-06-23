/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SigEventsWorkflowStatus } from '@kbn/streams-schema';
import { ExecutionStatus } from '@kbn/workflows';
import { StreamsKIsOnboardingClient } from '../../../lib/workflows/onboarding_workflow_client';
import { createKiIdentificationStatusTool } from './tool';
import { createMockToolContext } from '../../utils/test_helpers';

describe('createKiIdentificationStatusTool', () => {
  const setup = () => {
    const managementApi = {
      getWorkflowExecutions: jest.fn().mockResolvedValue({
        results: [
          {
            id: 'exec-1',
            status: ExecutionStatus.COMPLETED,
            startedAt: '2026-01-01T00:00:00Z',
            finishedAt: '2026-01-01T00:01:00Z',
            error: null,
          },
        ],
      }),
      getWorkflowExecution: jest.fn().mockResolvedValue({
        context: {
          output: {
            featuresSkipped: false,
            discoveredFeatures: ['f1'],
            featuresConnectorUsed: 'c1',
            queriesSkipped: false,
            persistedQueries: ['q1'],
            queriesConnectorUsed: 'c2',
          },
        },
      }),
    };
    const streamsKIsOnboardingClient = new StreamsKIsOnboardingClient({
      managementApi: managementApi as never,
      telemetry: { trackOnboardingScheduled: jest.fn() } as never,
    });

    const tool = createKiIdentificationStatusTool({
      streamsKIsOnboardingClient,
    });
    const context = createMockToolContext();
    return { tool, context, managementApi };
  };

  it('returns onboarding status for stream', async () => {
    const { tool, context } = setup();

    const result = await tool.handler({ stream_name: 'logs.nginx' }, context);

    if ('results' in result) {
      expect(result.results[0].type).toBe('other');
      expect(result.results[0].data).toEqual(
        expect.objectContaining({
          stream_name: 'logs.nginx',
          status: SigEventsWorkflowStatus.Completed,
        })
      );
    }
  });

  it('returns error result when status retrieval fails', async () => {
    const { tool, context, managementApi } = setup();
    managementApi.getWorkflowExecutions.mockRejectedValueOnce(new Error('boom'));

    const result = await tool.handler({ stream_name: 'logs.nginx' }, context);

    if ('results' in result) {
      expect(result.results[0].type).toBe('error');
      const data = result.results[0].data as Record<string, unknown>;
      expect(data.message).toContain('Failed to get KI identification background task status');
      expect(data.operation).toBe('ki_identification_status');
    }
  });
});
