/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { KIsOnboardingStep } from '@kbn/significant-events-schema';
import { getStreamsLocation } from '../../../../common/get_streams_location/get_streams_location';
import type {
  StreamsKIsOnboardingClient,
  StreamsKIsOnboardingInputs,
} from '../../../lib/workflows/onboarding_workflow_client';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface StartKiIdentificationHandlerParams {
  streamName: string;
  steps: KIsOnboardingStep[];
  connectors?: {
    features?: string;
    queries?: string;
  };
  streamsKIsOnboardingClient: StreamsKIsOnboardingClient;
  request: KibanaRequest;
}

interface StartKiIdentificationHandlerResult {
  kibanaPath: string;
}

export async function startKiIdentificationToolHandler({
  streamName,
  steps,
  connectors,
  streamsKIsOnboardingClient,
  request,
}: StartKiIdentificationHandlerParams): Promise<StartKiIdentificationHandlerResult> {
  const now = Date.now();
  const skipFeatures = !steps.includes(KIsOnboardingStep.FeaturesIdentification);
  const skipQueries = !steps.includes(KIsOnboardingStep.QueriesGeneration);

  const inputs: StreamsKIsOnboardingInputs = {
    streamName,
    features: {
      skip: skipFeatures,
      start: now - DEFAULT_LOOKBACK_MS,
      end: now,
      ...(connectors?.features && { connectorId: connectors.features }),
    },
    queries: {
      skip: skipQueries,
      ...(connectors?.queries && { connectorId: connectors.queries }),
    },
  };

  await streamsKIsOnboardingClient.run({ inputs, request });

  const location = getStreamsLocation({
    name: streamName,
    managementTab: 'significantEvents',
  });

  return {
    kibanaPath: `/app/${location.app}${location.path}`,
  };
}
