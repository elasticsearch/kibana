/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_STREAM_NAME_LENGTH } from '@kbn/streams-schema';
import {
  KIsOnboardingStep,
  SignificantEventsWorkflowStatus,
  type KIsOnboardingStatusResult,
  type SignificantEventsWorkflowStatusResult,
} from '@kbn/significant-events-schema';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { FeatureNotEnabledError } from '../../../../lib/streams/errors/feature_not_enabled_error';
import {
  MAX_STREAMS_PER_QUERY,
  type StreamsKIsOnboardingInputs,
} from '../../../../lib/workflows/onboarding_workflow_client';

const timestampFromString = z.string().transform((input) => new Date(input).getTime());

const mapStepsToSkipFlags = (
  steps: KIsOnboardingStep[]
): { skipFeatures: boolean; skipQueries: boolean } => ({
  skipFeatures: !steps.includes(KIsOnboardingStep.FeaturesIdentification),
  skipQueries: !steps.includes(KIsOnboardingStep.QueriesGeneration),
});

export const onboardingExecuteRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/onboarding/_execute',
  options: {
    access: 'internal',
    summary: 'Onboard stream',
    description:
      'Generate features and queries for a stream as part of the significant events discovery workflow.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string() }),
    body: z.discriminatedUnion('action', [
      z.object({
        action: z.literal('schedule').describe('Schedule a new onboarding workflow run'),
        from: timestampFromString,
        to: timestampFromString,
        steps: z
          .array(z.enum(KIsOnboardingStep))
          .optional()
          .default([KIsOnboardingStep.FeaturesIdentification, KIsOnboardingStep.QueriesGeneration])
          .describe(
            'Optional list of steps to perform as part of stream onboarding in the specified sequence. By default it will execute all steps.'
          ),
        connectors: z
          .object({
            features: z
              .string()
              .max(255)
              .optional()
              .describe('Connector ID for features identification.'),
            queries: z
              .string()
              .max(255)
              .optional()
              .describe('Connector ID for queries generation.'),
          })
          .optional()
          .describe(
            'Optional per-step connector overrides. When omitted the server resolves connectors from the inference feature registry.'
          ),
      }),
      z.object({
        action: z.literal('cancel').describe('Cancel an in-progress onboarding workflow'),
      }),
    ]),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    workflowClients,
  }): Promise<KIsOnboardingStatusResult> => {
    const { streamsKIsOnboardingClient } = workflowClients;
    if (!streamsKIsOnboardingClient) {
      throw new FeatureNotEnabledError('Workflows management is not available');
    }

    const { licensing, uiSettingsClient } = await getScopedClients({ request });
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { streamName },
      body,
    } = params;

    if (body.action === 'schedule') {
      const { skipFeatures, skipQueries } = mapStepsToSkipFlags(body.steps);

      const inputs: StreamsKIsOnboardingInputs = {
        streamName,
        features: {
          skip: skipFeatures,
          start: body.from,
          end: body.to,
          ...(body.connectors?.features && { connectorId: body.connectors.features }),
        },
        queries: {
          skip: skipQueries,
          ...(body.connectors?.queries && { connectorId: body.connectors.queries }),
        },
      };

      const { executionId } = await streamsKIsOnboardingClient.run({ inputs, request });

      return { status: SignificantEventsWorkflowStatus.InProgress, executionId };
    }

    // action === 'cancel'
    // Cancellation may be a no-op (nothing running, or already terminal), so we
    // return the real post-cancel status rather than assuming `canceled`.
    await streamsKIsOnboardingClient.cancel({ streamName, request });

    return streamsKIsOnboardingClient.getStatus({ streamName });
  },
});

export const onboardingStatusRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{streamName}/onboarding/_status',
  options: {
    access: 'internal',
    summary: 'Check the status of stream onboarding',
    description: 'Check the status of onboarding progress for a stream',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string() }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    workflowClients,
  }): Promise<KIsOnboardingStatusResult> => {
    const { streamsKIsOnboardingClient } = workflowClients;
    if (!streamsKIsOnboardingClient) {
      throw new FeatureNotEnabledError('Workflows management is not available');
    }

    const { licensing, uiSettingsClient } = await getScopedClients({ request });
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      path: { streamName },
    } = params;

    return streamsKIsOnboardingClient.getStatus({ streamName });
  },
});

export const onboardingBulkStatusRoute = createServerRoute({
  endpoint: 'POST /internal/streams/onboarding/_bulk_status',
  options: {
    access: 'internal',
    summary: 'Check the onboarding status of multiple streams',
    description:
      'Check the status of onboarding progress for a list of streams in a single request.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      streamNames: z
        .array(z.string().max(MAX_STREAM_NAME_LENGTH))
        .min(1)
        .max(MAX_STREAMS_PER_QUERY),
    }),
  }),
  handler: async ({
    params,
    request,
    getScopedClients,
    server,
    workflowClients,
  }): Promise<Record<string, SignificantEventsWorkflowStatusResult>> => {
    const { streamsKIsOnboardingClient } = workflowClients;
    if (!streamsKIsOnboardingClient) {
      throw new FeatureNotEnabledError('Workflows management is not available');
    }

    const { licensing, uiSettingsClient } = await getScopedClients({ request });
    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const {
      body: { streamNames },
    } = params;

    return streamsKIsOnboardingClient.getStatuses({ streamNames });
  },
});

export const internalOnboardingRoutes = {
  ...onboardingExecuteRoute,
  ...onboardingStatusRoute,
  ...onboardingBulkStatusRoute,
};
