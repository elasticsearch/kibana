/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, SavedObjectsClientContract } from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import {
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
} from '@kbn/management-settings-ids';

export async function getTracingFeaturesEnabled(
  coreStart: Pick<CoreStart, 'savedObjects' | 'uiSettings'>,
  savedObjectsClient?: SavedObjectsClientContract
): Promise<boolean> {
  const client =
    savedObjectsClient ?? new SavedObjectsClient(coreStart.savedObjects.createInternalRepository());
  const uiSettingsClient = coreStart.uiSettings.asScopedToClient(client);

  const [tracingEnabled, experimentalFeaturesEnabled] = await Promise.all([
    uiSettingsClient.get<boolean>(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID),
    uiSettingsClient.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
  ]);

  return tracingEnabled && experimentalFeaturesEnabled;
}
