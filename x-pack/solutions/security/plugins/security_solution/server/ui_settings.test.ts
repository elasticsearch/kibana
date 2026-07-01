/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { initUiSettings } from './ui_settings';
import type { ExperimentalFeatures } from '../common/experimental_features';
import {
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
  ENABLE_NEW_FLYOUT_SETTING,
} from '../common/constants';

describe('initUiSettings', () => {
  let mockUiSettings: ReturnType<typeof coreMock.createSetup>['uiSettings'];
  const mockExperimentalFeatures = {
    enableAlertsAndAttacksAlignment: false,
    extendedRuleExecutionLoggingEnabled: false,
    newFlyoutSystemEnabled: false,
  } as ExperimentalFeatures;

  beforeEach(() => {
    mockUiSettings = coreMock.createSetup().uiSettings;
  });

  it('does NOT register ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING when feature flag is disabled', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).not.toHaveProperty(ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING);
  });

  it('registers ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING when feature flag is enabled', () => {
    const enabledFeatures = {
      ...mockExperimentalFeatures,
      enableAlertsAndAttacksAlignment: true,
    };

    initUiSettings(mockUiSettings, enabledFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toHaveProperty(ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING);
    expect(registeredSettings[ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING]).toEqual(
      expect.objectContaining({
        name: 'Enable alerts and attacks alignment',
        value: false,
        type: 'boolean',
        technicalPreview: true,
      })
    );
  });

  it('does NOT register ENABLE_NEW_FLYOUT_SETTING when newFlyoutSystemEnabled flag is disabled', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).not.toHaveProperty(ENABLE_NEW_FLYOUT_SETTING);
  });

  it('registers ENABLE_NEW_FLYOUT_SETTING when newFlyoutSystemEnabled flag is enabled', () => {
    const enabledFeatures = {
      ...mockExperimentalFeatures,
      newFlyoutSystemEnabled: true,
    };

    initUiSettings(mockUiSettings, enabledFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toHaveProperty(ENABLE_NEW_FLYOUT_SETTING);
    expect(registeredSettings[ENABLE_NEW_FLYOUT_SETTING]).toEqual(
      expect.objectContaining({
        name: 'Enable new flyout',
        value: false,
        type: 'boolean',
        requiresPageReload: true,
      })
    );
  });
});
