/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createKiIdentificationStartTool } from './tool';
import { createMockToolContext } from '../../utils/test_helpers';
import { StreamsKIsOnboardingStep } from '@kbn/streams-schema';
import { StreamsKIsOnboardingClient } from '../../../lib/workflows/onboarding_workflow_client';

describe('createKiIdentificationStartTool', () => {
  const telemetry = {
    trackAgentToolKiIdentificationStarted: jest.fn(),
  };

  const setup = () => {
    const managementApi = {
      getWorkflow: jest.fn().mockResolvedValue({
        id: 'system-streams-ki-onboarding',
        name: 'onboarding',
        enabled: true,
        definition: {},
        yaml: '',
      }),
      runWorkflow: jest.fn().mockResolvedValue('execution-id-123'),
    };
    const streamsKIsOnboardingClient = new StreamsKIsOnboardingClient({
      managementApi: managementApi as never,
      telemetry: { trackOnboardingScheduled: jest.fn() } as never,
    });

    const tool = createKiIdentificationStartTool({
      telemetry: telemetry as never,
      streamsKIsOnboardingClient,
    });
    const context = createMockToolContext();

    return { tool, context, managementApi };
  };

  it('triggers onboarding workflow and returns immediately by default', async () => {
    const { tool, context, managementApi } = setup();

    const result = await tool.handler(
      {
        stream_name: 'logs.nginx',
        steps: [
          StreamsKIsOnboardingStep.FeaturesIdentification,
          StreamsKIsOnboardingStep.QueriesGeneration,
        ],
      },
      context
    );

    expect(managementApi.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'system-streams-ki-onboarding' }),
      'default',
      expect.objectContaining({
        streamName: 'logs.nginx',
        skipFeatures: false,
        skipQueries: false,
      }),
      context.request
    );
    if ('results' in result) {
      expect(result.results[0].type).toBe('other');
      expect(result.results[0].data).toEqual({
        kibanaPath: '/app/streams/logs.nginx/management/significantEvents',
      });
    }
  });

  it('returns error result when workflow trigger fails', async () => {
    const { tool, context, managementApi } = setup();
    managementApi.runWorkflow.mockRejectedValueOnce(new Error('version conflict'));

    const result = await tool.handler(
      {
        stream_name: 'logs.nginx',
        steps: [
          StreamsKIsOnboardingStep.FeaturesIdentification,
          StreamsKIsOnboardingStep.QueriesGeneration,
        ],
      },
      context
    );

    if ('results' in result) {
      expect(result.results[0].type).toBe('error');
      const data = result.results[0].data as Record<string, unknown>;
      expect(data.message).toContain('Failed to start KI identification background task');
      expect(data.operation).toBe('ki_identification_start');
    }
  });
});
