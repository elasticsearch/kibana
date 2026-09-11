/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { isContextEngineEnabledInSpace } from './is_context_engine_enabled_in_space';

describe('isContextEngineEnabledInSpace', () => {
  it('reads contextEngine:enabled from the given space, not the default namespace', async () => {
    const spaceClient = savedObjectsClientMock.create();
    const internalClient = savedObjectsClientMock.create();
    internalClient.asScopedToNamespace.mockReturnValue(spaceClient);

    const spaceUiSettings = { get: jest.fn().mockResolvedValue(true) };
    const asScopedToClient = jest.fn().mockReturnValue(spaceUiSettings);

    await expect(
      isContextEngineEnabledInSpace({
        savedObjects: { getUnsafeInternalClient: () => internalClient },
        uiSettings: { asScopedToClient },
        spaceId: 'marketing',
      })
    ).resolves.toBe(true);

    expect(internalClient.asScopedToNamespace).toHaveBeenCalledWith('marketing');
    expect(asScopedToClient).toHaveBeenCalledWith(spaceClient);
    expect(spaceUiSettings.get).toHaveBeenCalledWith(CONTEXT_ENGINE_ENABLED_SETTING_ID);
  });

  it('returns false when the setting is off in that space', async () => {
    const spaceClient = savedObjectsClientMock.create();
    const internalClient = savedObjectsClientMock.create();
    internalClient.asScopedToNamespace.mockReturnValue(spaceClient);

    await expect(
      isContextEngineEnabledInSpace({
        savedObjects: { getUnsafeInternalClient: () => internalClient },
        uiSettings: {
          asScopedToClient: () => ({ get: jest.fn().mockResolvedValue(false) }),
        },
        spaceId: 'marketing',
      })
    ).resolves.toBe(false);
  });
});
