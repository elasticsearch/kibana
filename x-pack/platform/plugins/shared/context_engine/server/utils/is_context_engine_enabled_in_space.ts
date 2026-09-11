/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';

interface IsContextEngineEnabledInSpaceParams {
  savedObjects: {
    getUnsafeInternalClient: () => SavedObjectsClientContract;
  };
  uiSettings: {
    asScopedToClient: (client: SavedObjectsClientContract) => {
      get: (key: string) => Promise<boolean>;
    };
  };
  spaceId: string;
}

/** Reads the space-scoped `contextEngine:enabled` setting for `spaceId`. */
export const isContextEngineEnabledInSpace = async ({
  savedObjects,
  uiSettings,
  spaceId,
}: IsContextEngineEnabledInSpaceParams): Promise<boolean> => {
  const soClient = savedObjects.getUnsafeInternalClient().asScopedToNamespace(spaceId);
  const spaceUiSettings = uiSettings.asScopedToClient(soClient);
  return (await spaceUiSettings.get(CONTEXT_ENGINE_ENABLED_SETTING_ID)) ?? false;
};
