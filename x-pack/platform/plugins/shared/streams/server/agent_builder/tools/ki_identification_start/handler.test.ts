/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { startKiIdentificationToolHandler } from './handler';
import { StreamsKIsOnboardingStep } from '@kbn/streams-schema';
import { StreamsKIsOnboardingClient } from '../../../lib/workflows/onboarding_workflow_client';

describe('startKiIdentificationToolHandler', () => {
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
    const telemetry = { trackOnboardingScheduled: jest.fn() } as never;
    const streamsKIsOnboardingClient = new StreamsKIsOnboardingClient({
      managementApi: managementApi as never,
      telemetry,
    });

    return {
      managementApi,
      streamsKIsOnboardingClient,
      request: httpServerMock.createKibanaRequest(),
    };
  };

  it('triggers onboarding workflow and returns tracking Kibana path', async () => {
    const { managementApi, streamsKIsOnboardingClient, request } = setup();

    const result = await startKiIdentificationToolHandler({
      streamName: 'logs.nginx',
      steps: [
        StreamsKIsOnboardingStep.FeaturesIdentification,
        StreamsKIsOnboardingStep.QueriesGeneration,
      ],
      streamsKIsOnboardingClient,
      request,
    });

    expect(result).toEqual({
      kibanaPath: '/app/streams/logs.nginx/management/significantEvents',
    });

    expect(managementApi.getWorkflow).toHaveBeenCalledWith('system-streams-ki-onboarding', '*');
    expect(managementApi.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'system-streams-ki-onboarding' }),
      'default',
      expect.objectContaining({
        streamName: 'logs.nginx',
        skipFeatures: false,
        skipQueries: false,
      }),
      request
    );
  });

  it('throws when workflow is not found', async () => {
    const { managementApi, streamsKIsOnboardingClient, request } = setup();
    managementApi.getWorkflow.mockResolvedValue(null);

    await expect(
      startKiIdentificationToolHandler({
        streamName: 'logs.nginx',
        steps: [StreamsKIsOnboardingStep.FeaturesIdentification],
        streamsKIsOnboardingClient,
        request,
      })
    ).rejects.toThrow(/Workflow .+ not found/);
  });
});
