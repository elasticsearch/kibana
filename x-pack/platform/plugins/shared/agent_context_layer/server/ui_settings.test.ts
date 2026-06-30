/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { registerUISettings } from './ui_settings';

describe('registerUISettings', () => {
  it('registers the Context Engine setting, disabled by default', () => {
    const { uiSettings } = coreMock.createSetup();

    registerUISettings({ uiSettings });

    const registeredSettings = (uiSettings.register as jest.Mock).mock.calls[0][0];

    expect(registeredSettings).toHaveProperty(CONTEXT_ENGINE_ENABLED_SETTING_ID);
    expect(registeredSettings[CONTEXT_ENGINE_ENABLED_SETTING_ID]).toEqual(
      expect.objectContaining({
        name: 'Context Engine',
        value: false,
        experimental: true,
      })
    );
  });
});
