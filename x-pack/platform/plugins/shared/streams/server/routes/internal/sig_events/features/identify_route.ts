/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from '@kbn/zod/v4';
import {
  getStreamTypeFromDefinition,
  STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  STREAMS_SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
} from '@kbn/streams-schema';
import { isInferenceProviderError } from '@kbn/inference-common';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { resolveConnectorForFeature } from '../../../utils/resolve_connector_for_feature';
import { getRequestAbortSignal } from '../../../utils/get_request_abort_signal';
import { formatInferenceProviderError } from '../../../utils/create_connector_sse_error';
import {
  MS_PER_DAY,
  buildTelemetry,
  identifyInferredFeatures,
  identifyComputedFeatures,
} from '../../../../lib/sig_events/features';
import { shouldIdentifyFeatures } from '../../../../lib/sig_events/features/should_identify_features';
import { isSignificantEventsSemanticCodeSearchGroundingEnabled } from '../../../../lib/semantic_code_search_grounding/is_significant_events_semantic_code_search_grounding_enabled';

// ---------------------------------------------------------------------------
// Route 1: Identify inferred features (one iteration: sample + infer + reconcile)
// ---------------------------------------------------------------------------

const identifyInferredFeaturesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/features/_identify/inferred',
  options: {
    access: 'internal',
    summary: 'Sample documents, run LLM inference, and reconcile KI features for one iteration',
    timeout: { idleSocket: 300_000 },
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string() }),
    body: z
      .object({
        connectorId: z.string().optional(),
        start: z.number().optional(),
        end: z.number().optional(),
        runId: z.string().optional(),
        iteration: z.number().optional(),
        sampleSize: z.number().optional(),
        entityFilteredRatio: z.number().min(0).max(1).optional(),
        diverseRatio: z.number().min(0).max(1).optional(),
        maxEntityFilters: z.number().optional(),
        maxExcludedFeaturesInPrompt: z.number().optional(),
        maxPreviouslyIdentifiedFeatures: z.number().optional(),
        diverseOffset: z.number().min(0).optional(),
      })
      .nullable()
      .optional(),
  }),
  handler: async ({ params, request, getScopedClients, server, logger, telemetry }) => {
    const {
      scopedClusterClient,
      getKnowledgeIndicatorClient,
      streamsClient,
      inferenceClient,
      soClient,
      tuningConfig,
      licensing,
      uiSettingsClient,
    } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { streamName } = params.path;
    const routeLogger = logger.get('features_identification', 'inferred', streamName);
    const now = Date.now();
    const {
      start = now - MS_PER_DAY,
      end = now,
      connectorId: connectorIdOverride,
      runId = uuidv4(),
      iteration,
      sampleSize = tuningConfig.sample_size,
      entityFilteredRatio = tuningConfig.entity_filtered_ratio,
      diverseRatio = tuningConfig.diverse_ratio,
      maxEntityFilters = tuningConfig.max_entity_filters,
      maxExcludedFeaturesInPrompt = tuningConfig.max_excluded_features_in_prompt,
      maxPreviouslyIdentifiedFeatures,
      diverseOffset,
    } = params.body ?? {};

    const [connectorId, stream, kiClient] = await Promise.all([
      connectorIdOverride
        ? Promise.resolve(connectorIdOverride)
        : resolveConnectorForFeature({
            searchInferenceEndpoints: server.searchInferenceEndpoints,
            featureId: STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
            featureName: 'knowledge indicator extraction',
            request,
          }),
      streamsClient.getStream(streamName),
      getKnowledgeIndicatorClient(),
    ]);

    const streamType = getStreamTypeFromDefinition(stream);

    try {
      const result = await identifyInferredFeatures({
        esClient: scopedClusterClient.asCurrentUser,
        kiClient,
        soClient,
        inferenceClient: inferenceClient.bindTo({
          connectorId,
          metadata: {
            connectorTelemetry: {
              pluginId: STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
              aggregateBy: STREAMS_SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
            },
          },
        }),
        connectorId,
        logger: routeLogger,
        signal: getRequestAbortSignal(request),
        streamName,
        streamType,
        start,
        end,
        runId,
        iteration,
        tuning: {
          sample_size: sampleSize,
          entity_filtered_ratio: entityFilteredRatio,
          diverse_ratio: diverseRatio,
          max_entity_filters: maxEntityFilters,
          max_excluded_features_in_prompt: maxExcludedFeaturesInPrompt,
          maxPreviouslyIdentifiedFeatures,
        },
        diverseOffset,
        trackFeaturesIdentified: (data) => telemetry.trackFeaturesIdentified(data),
      });
      return { ...result, connectorId };
    } catch (error) {
      routeLogger.error(
        `Inferred feature identification failed for stream [${streamName}]: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      telemetry.trackFeaturesIdentified(
        buildTelemetry(
          {
            run_id: runId,
            connector_id: connectorId,
            iteration: iteration ?? 1,
            stream_name: streamName,
            stream_type: streamType,
            docs_count: 0,
            excluded_features_count: 0,
            total_filters: 0,
            filters_capped: false,
            has_filtered_documents: false,
          },
          Date.now() - now,
          { state: 'failure' }
        )
      );

      if (isInferenceProviderError(error)) {
        const connector = await inferenceClient
          .getConnectorById(connectorId)
          .catch(() => undefined);
        if (connector) {
          throw new Error(formatInferenceProviderError(error, connector));
        }
      }

      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// Route 2: Identify computed features (generate and persist computed KI features)
// ---------------------------------------------------------------------------

const identifyComputedFeaturesRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{streamName}/features/_identify/computed',
  options: {
    access: 'internal',
    summary: 'Generate and persist computed KI features for a stream',
    timeout: { idleSocket: 300_000 },
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string() }),
    body: z
      .object({
        start: z.number().optional(),
        end: z.number().optional(),
        runId: z.string().optional(),
      })
      .nullable()
      .optional(),
  }),
  handler: async ({ params, request, getScopedClients, server, logger, telemetry }) => {
    const {
      scopedClusterClient,
      getKnowledgeIndicatorClient,
      streamsClient,
      licensing,
      uiSettingsClient,
    } = await getScopedClients({ request });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { streamName } = params.path;
    const routeLogger = logger.get('features_identification', 'computed', streamName);
    const now = Date.now();
    const { start = now - MS_PER_DAY, end = now, runId = uuidv4() } = params.body ?? {};

    const [kiClient, stream] = await Promise.all([
      getKnowledgeIndicatorClient(),
      streamsClient.getStream(streamName),
    ]);

    // Enable code_analysis grounding only when the feature flag is on and Agent
    // Builder is available; otherwise the provider is omitted and the computed
    // feature is skipped.
    const codeGroundingEnabled =
      Boolean(server.agentBuilder?.tools) &&
      (await isSignificantEventsSemanticCodeSearchGroundingEnabled(server.core.featureFlags));

    try {
      const computedFeatures = await identifyComputedFeatures({
        stream,
        streamName,
        start,
        end,
        esClient: scopedClusterClient.asCurrentUser,
        kiClient,
        logger: routeLogger,
        runId,
        ...(codeGroundingEnabled
          ? { agentBuilderTools: server.agentBuilder?.tools, request, telemetry }
          : {}),
      });

      return {
        computedFeatures,
        computedFeaturesCount: computedFeatures.length,
      };
    } catch (error) {
      routeLogger.error(
        `Computed feature identification failed for stream [${streamName}]: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// Route 3: Check whether features identification should run
// ---------------------------------------------------------------------------

const shouldIdentifyRoute = createServerRoute({
  endpoint: 'GET /internal/streams/{streamName}/features/_should_identify',
  options: {
    access: 'internal',
    summary: 'Check whether KI features identification should run for a stream',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    path: z.object({ streamName: z.string() }),
    query: z.object({
      thresholdHours: z.coerce.number().min(0),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server }) => {
    const { getKnowledgeIndicatorClient, licensing, uiSettingsClient } = await getScopedClients({
      request,
    });

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const kiClient = await getKnowledgeIndicatorClient();
    return shouldIdentifyFeatures({
      kiClient,
      streamName: params.path.streamName,
      thresholdHours: params.query.thresholdHours,
    });
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const identifyFeaturesRoutes = {
  ...identifyInferredFeaturesRoute,
  ...identifyComputedFeaturesRoute,
  ...shouldIdentifyRoute,
};
