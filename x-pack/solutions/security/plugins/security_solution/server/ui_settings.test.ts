/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import {
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
  SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED,
} from '@kbn/management-settings-ids';
import { initUiSettings } from './ui_settings';
import type { ExperimentalFeatures } from '../common/experimental_features';
import { ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING } from '../common/constants';

describe('initUiSettings', () => {
  let mockUiSettings: ReturnType<typeof coreMock.createSetup>['uiSettings'];
  const mockExperimentalFeatures = {
    enableAlertsAndAttacksAlignment: false,
    extendedRuleExecutionLoggingEnabled: false,
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

  it('registers alert validation workflow settings', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toEqual(
      expect.objectContaining({
        [SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_ENABLED]: expect.objectContaining({
          value: true,
          type: 'boolean',
          technicalPreview: true,
        }),
        [SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD]:
          expect.objectContaining({
            value: 0.85,
            type: 'number',
            technicalPreview: true,
          }),
        [SECURITY_SOLUTION_ALERT_VALIDATION_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD]:
          expect.objectContaining({
            value: 1,
            type: 'number',
            technicalPreview: true,
          }),
      })
    );
  });
});
