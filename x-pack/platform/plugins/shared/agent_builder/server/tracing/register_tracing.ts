/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { tracing } from '@elastic/opentelemetry-node/sdk';
import { SavedObjectsClient } from '@kbn/core/server';
import { buildOtelResources } from '@kbn/telemetry';
import {
  ElasticsearchOtlpExporter,
  LateBindingSpanProcessor,
  EvalSpanProcessor,
} from '@kbn/tracing';
import {
  initInferenceTracerProvider,
  shutdownInferenceTracerProvider,
  EXECUTION_ID_BAGGAGE_KEY,
  EVAL_EXPERIMENT_ID_BAGGAGE_KEY,
} from '@kbn/inference-tracing';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
} from '@kbn/management-settings-ids';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import type { TracingPrivacySettings } from './agent_builder_span_processor';
import type { AgentBuilderConfig } from '../config';
import { AgentBuilderSpanProcessor } from './agent_builder_span_processor';
import { GlobalBridgeProcessor } from './global_bridge_processor';
import { OpikDistributedTracingSpanProcessor } from './opik_distributed_tracing';
import { DATA_STREAM_NAMESPACE_ATTR, SPACE_ID_BAGGAGE_KEY } from './agent_builder_context';

const SETTING_CACHE_TTL_MS = 30_000;

/**
 * Returns a synchronous `getSettings()` function that polls all tracing privacy
 * uiSettings on a fixed interval. The span processor hot-path requires synchronous
 * access, so we refresh in the background every {@link SETTING_CACHE_TTL_MS} ms.
 */
const createCachedTracingSettings = async (
  core: CoreStart,
  logger: Logger
): Promise<{ getSettings: () => TracingPrivacySettings; stopPolling: () => void }> => {
  let settings: TracingPrivacySettings = {
    enabled: false,
    includeUserPrompts: false,
    includeLlmResponses: false,
    includeToolDetails: false,
    includeSystemPrompt: false,
    includeRealNames: false,
    includeRealIds: false,
  };

  const refresh = async () => {
    try {
      const internalRepo = core.savedObjects.createInternalRepository();
      const internalClient = new SavedObjectsClient(internalRepo);
      const client = core.uiSettings.asScopedToClient(internalClient);
      const [
        enabled,
        experimentalFeaturesEnabled,
        includeUserPrompts,
        includeLlmResponses,
        includeToolDetails,
        includeSystemPrompt,
        includeRealNames,
        includeRealIds,
      ] = await Promise.all([
        client.get<boolean>(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID),
        client.get<boolean>(AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID),
      ]);
      settings = {
        enabled: enabled && experimentalFeaturesEnabled,
        includeUserPrompts,
        includeLlmResponses,
        includeToolDetails,
        includeSystemPrompt,
        includeRealNames,
        includeRealIds,
      };
    } catch (error) {
      logger.error(`Failed to fetch tracing settings: ${error.message}`);
    }
  };

  await refresh();
  const intervalId = setInterval(refresh, SETTING_CACHE_TTL_MS);

  return {
    getSettings: () => settings,
    stopPolling: () => clearInterval(intervalId),
  };
};

export const registerTracingExporter = async ({
  core,
  tracingConfig,
  logger,
}: {
  core: CoreStart;
  tracingConfig: AgentBuilderConfig['tracing'];
  logger: Logger;
}): Promise<(() => Promise<void>) | undefined> => {
  const { getSettings, stopPolling } = await createCachedTracingSettings(core, logger);

  // Always include the ES exporter so that enabling the uiSetting takes effect
  // within the next polling cycle, without requiring a server restart.
  const allExporters: tracing.SpanExporter[] = [
    new ElasticsearchOtlpExporter(core.elasticsearch.client.asInternalUser),
    ...tracingConfig.exporters.map(
      ({ url, headers }) =>
        new OTLPTraceExporter({
          url,
          ...(headers ? { headers } : {}),
        })
    ),
  ];

  const processors: tracing.SpanProcessor[] = [
    ...(tracingConfig.opik_distributed_tracing ? [new OpikDistributedTracingSpanProcessor()] : []),
    ...allExporters.map(
      (exporter) =>
        new AgentBuilderSpanProcessor({
          exporter,
          scheduledDelayMillis: tracingConfig.scheduledDelay,
          getSettings,
        })
    ),
  ];

  processors.push(
    new EvalSpanProcessor([
      { baggageKey: EXECUTION_ID_BAGGAGE_KEY },
      { baggageKey: EVAL_EXPERIMENT_ID_BAGGAGE_KEY },
      { baggageKey: SPACE_ID_BAGGAGE_KEY, attributeKey: DATA_STREAM_NAMESPACE_ATTR },
    ])
  );

  const lateBindingProcessor = LateBindingSpanProcessor.get();
  if (lateBindingProcessor) {
    processors.push(new GlobalBridgeProcessor(lateBindingProcessor));
  }

  const resource = buildOtelResources();
  await resource.waitForAsyncAttributes?.();

  initInferenceTracerProvider({
    processors,
    resource,
  });

  return async () => {
    stopPolling();
    await shutdownInferenceTracerProvider();
  };
};
