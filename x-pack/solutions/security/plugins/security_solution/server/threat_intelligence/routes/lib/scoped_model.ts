/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR } from '@kbn/management-settings-ids';

/**
 * Build a `ScopedModel` for an internal route handler.
 *
 * Mirrors the helper used by `nl_to_esql_route.ts` so the LLM-using
 * threat-intelligence routes (`hunt_behavior`,
 * `generalize_from_telemetry`) bind to the same default GenAI connector
 * resolution rules as ES|QL NL search.
 */
const NO_DEFAULT_CONNECTOR = 'NO_DEFAULT_CONNECTOR';

const resolveConnectorId = async ({
  uiSettingsClient,
  inference,
  request,
}: {
  uiSettingsClient: IUiSettingsClient;
  inference: InferenceServerStart;
  request: KibanaRequest;
}): Promise<string | undefined> => {
  try {
    const defaultSetting = await uiSettingsClient.get<string>(GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR);
    if (defaultSetting && defaultSetting !== NO_DEFAULT_CONNECTOR) {
      return defaultSetting;
    }
  } catch {
    // UI setting may not be registered; fall through to the inference default.
  }

  try {
    const connector = await inference.getDefaultConnector(request);
    return connector?.connectorId;
  } catch {
    // No connectors available.
  }

  return undefined;
};

const buildScopedModel = async ({
  inference,
  request,
  connectorId,
}: {
  inference: InferenceServerStart;
  request: KibanaRequest;
  connectorId: string;
}): Promise<ScopedModel> => {
  const chatModel = await inference.getChatModel({ request, connectorId, chatModelOptions: {} });
  const inferenceClient = inference.getClient({ request, bindTo: { connectorId } });
  const connector = await inference.getConnectorById(connectorId, request);
  return { connector, chatModel, inferenceClient };
};

/**
 * Attempt to build a ScopedModel for the given connector ID.
 * Returns null and emits a warn log on failure so the caller can try the next
 * fallback in the chain.  The greppable `[ti:connector]` prefix + label make
 * each fallback hop queryable in logs — a warn here means silent degradation is
 * happening and the operator should investigate the connector configuration.
 */
const tryBuildScoped = async (
  inference: InferenceServerStart,
  request: KibanaRequest,
  connectorId: string,
  label: string,
  logger: Logger
): Promise<ScopedModel | null> => {
  try {
    return await buildScopedModel({ inference, request, connectorId });
  } catch (err) {
    logger.warn(
      `[ti:connector] ${label} connector='${connectorId}' unavailable — falling through. ` +
        `${(err as Error).message}`
    );
    return null;
  }
};

export type ResolveScopedModelOutcome =
  | { ok: true; model: ScopedModel }
  | { ok: false; reason: 'no_inference_plugin' | 'no_connector'; message: string };

/**
 * Resolves a `ScopedModel` for an LLM-backed threat-intelligence route using
 * an ordered fallback chain.  Returns a structured failure (no throw) when no
 * connector can be built so the caller can surface a 400 / 503.
 *
 * Chain (first successful build wins):
 *   1. `connectorIdOverride` — per-stage uiSetting value (e.g. DIAMOND_GATE_CONNECTOR_SETTING_KEY).
 *      After the uiSetting default change this is non-empty on every call (Haiku / Opus).
 *      Falls through with a `[ti:connector]` warn if the connector is absent on this deployment.
 *   2. `genAi:defaultAIConnector` / `inference.getDefaultConnector` — present on all deployments.
 *      Also guarded so a pathological absent resolved connector falls to `no_connector`, not 500.
 *   3. `no_connector` — returned as a structured failure; no connector is available at all.
 *
 * @param connectorIdOverride - Non-empty value from a per-stage advanced setting.  Falls through
 *   to the genAi:defaultAIConnector chain when absent or when the connector cannot be built.
 * @param logger - Used to emit `[ti:connector]` warn lines on each fallback hop.
 *
 * TODO: blank=absent-override, so an operator can't force-clear a baked uiSetting default
 *   back to the genAi chain via the Advanced Settings UI.  Add a sentinel value (e.g.
 *   `'__default__'`) if that escape hatch is ever needed.
 */
export const resolveScopedModel = async ({
  inference,
  request,
  uiSettingsClient,
  connectorIdOverride,
  logger,
}: {
  inference: InferenceServerStart | undefined;
  request: KibanaRequest;
  uiSettingsClient: IUiSettingsClient;
  connectorIdOverride?: string;
  logger: Logger;
}): Promise<ResolveScopedModelOutcome> => {
  if (!inference) {
    return {
      ok: false,
      reason: 'no_inference_plugin',
      message:
        'The optional `inference` plugin is not available in this Kibana deployment. ' +
        'LLM-backed threat-intelligence routes are unavailable.',
    };
  }

  // 1. Per-stage override (populated by the route reading e.g. DIAMOND_GATE_CONNECTOR_SETTING_KEY).
  //    After the uiSetting default change this is non-empty on every call (Haiku/Opus default).
  //    Falls through with a warn if the connector isn't present on this deployment.
  if (connectorIdOverride) {
    const model = await tryBuildScoped(
      inference,
      request,
      connectorIdOverride,
      'stage-override',
      logger
    );
    if (model) return { ok: true, model };
  }

  // 2. Space-wide genAi:defaultAIConnector / inference.getDefaultConnector.
  //    Present everywhere; also guarded so a pathological absent connector falls to no_connector.
  const fallbackId = await resolveConnectorId({ inference, request, uiSettingsClient });
  if (fallbackId) {
    const model = await tryBuildScoped(inference, request, fallbackId, 'genAi-default', logger);
    if (model) return { ok: true, model };
  }

  return {
    ok: false,
    reason: 'no_connector',
    message:
      'No GenAI connector is configured or available. Set `genAi:defaultAIConnector` in ' +
      'advanced settings, or configure a GenAI connector for the current user.',
  };
};
