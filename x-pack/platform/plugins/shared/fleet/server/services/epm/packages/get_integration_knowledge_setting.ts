/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';

import { appContextService } from '../../app_context';
import { getSettings } from '../../settings';

export async function getIntegrationKnowledgeSetting(
  savedObjectsClient: SavedObjectsClientContract
): Promise<boolean> {
  const config = appContextService.getConfig();

  const integrationKnowledgeConfig: boolean =
    config?.installIntegrationsKnowledge ??
    config?.experimentalFeatures?.integrationKnowledge ??
    appContextService.getExperimentalFeatures().installIntegrationsKnowledge;

  if (!integrationKnowledgeConfig) {
    return false;
  }

  try {
    const { integration_knowledge_enabled: integrationKnowledgeEnabled } = await getSettings(
      savedObjectsClient
    );
    return integrationKnowledgeEnabled ?? integrationKnowledgeConfig;
  } catch (err) {
    appContextService
      .getLogger()
      .warn(
        'Error while trying to load integration knowledge flag from settings, defaulting to feature flag',
        err
      );
  }
  return integrationKnowledgeConfig;
}
