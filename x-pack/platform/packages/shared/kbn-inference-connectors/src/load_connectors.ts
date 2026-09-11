/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { ApiInferenceConnector } from '@kbn/inference-common';
import { fetchConnectorsForFeature } from './fetch_connectors_for_feature';
import { isOpenAiProviderType } from './openai_provider_type_guard';
import type { AIConnector } from './types';

export const toAIConnector = (connector: ApiInferenceConnector): AIConnector => ({
  id: connector.connectorId,
  name: connector.name,
  actionTypeId: connector.type,
  config: connector.config,
  secrets: {},
  isEis: connector.isEis,
  isPreconfigured: connector.isPreconfigured,
  isSystemAction: false,
  isDeprecated: connector.isDeprecated ?? false,
  isConnectorTypeDeprecated: connector.isConnectorTypeDeprecated ?? false,
  isMissingSecrets: connector.isMissingSecrets ?? false,
  isRecommended: connector.isRecommended,
  metadata: connector.metadata,
  apiProvider:
    !connector.isPreconfigured &&
    connector.config?.apiProvider !== undefined &&
    isOpenAiProviderType(connector.config.apiProvider)
      ? connector.config.apiProvider
      : undefined,
});

/**
 * Fetches AI connectors for a given feature from the search_inference_endpoints backend
 * and maps them to {@link AIConnector}. The backend route applies feature resolution,
 * default-connector UI settings, and recommended-endpoint flagging.
 *
 * @param settings - Deprecated; no longer read. Default-connector UI settings are applied
 *                   server-side. Kept for call-site compatibility.
 */
export const loadConnectors = async ({
  http,
  featureId,
}: {
  http: HttpSetup;
  featureId: string;
  settings?: SettingsStart;
}): Promise<AIConnector[]> => {
  const { connectors } = await fetchConnectorsForFeature(http, featureId);
  return connectors.map(toAIConnector);
};
