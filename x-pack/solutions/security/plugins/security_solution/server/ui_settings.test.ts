/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import {
  SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AGENT_ID,
  SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD,
  SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD,
  SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_ENABLED,
} from '@kbn/management-settings-ids';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { initUiSettings } from './ui_settings';
import type { ExperimentalFeatures } from '../common/experimental_features';
import {
  ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING,
  ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING,
  ENABLE_ASSET_INVENTORY_SETTING,
  ENABLE_NEW_FLYOUT_SETTING,
} from '../common/constants';

describe('initUiSettings', () => {
  let mockUiSettings: ReturnType<typeof coreMock.createSetup>['uiSettings'];
  const mockExperimentalFeatures = {
    enableAlertsAndAttacksAlignment: false,
    extendedRuleExecutionLoggingEnabled: false,
    newFlyoutSystemDisabled: false,
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
        value: true,
        type: 'boolean',
      })
    );
  });

  it('registers ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING synchronously', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toHaveProperty(ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING);
  });

  it('registers ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING with value false (off by default)', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings[ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING].value).toBe(false);
  });

  it('registers ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING as editable (not readonly)', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings[ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING].readonly).toBeUndefined();
  });

  it('positions ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING immediately after ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING when alignment is enabled', () => {
    const enabledFeatures = { ...mockExperimentalFeatures, enableAlertsAndAttacksAlignment: true };

    initUiSettings(mockUiSettings, enabledFeatures, false);

    const keys = Object.keys((mockUiSettings.register as jest.Mock).mock.calls[0][0]);
    expect(keys.indexOf(ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING)).toBe(
      keys.indexOf(ENABLE_ALERTS_AND_ATTACKS_ALIGNMENT_SETTING) + 1
    );
  });

  it('positions ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING immediately before ENABLE_ASSET_INVENTORY_SETTING when alignment is disabled', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const keys = Object.keys((mockUiSettings.register as jest.Mock).mock.calls[0][0]);
    expect(keys.indexOf(ENABLE_ASSET_INVENTORY_SETTING)).toBe(
      keys.indexOf(ENABLE_ATTACK_DISCOVERY_WORKFLOWS_SETTING) + 1
    );
  });

  it('registers alert analysis workflow settings', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toEqual(
      expect.objectContaining({
        [SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_ENABLED]: expect.objectContaining({
          value: true,
          type: 'boolean',
          technicalPreview: true,
        }),
        [SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MIN_THRESHOLD]:
          expect.objectContaining({
            value: 0.85,
            type: 'number',
            technicalPreview: true,
          }),
        [SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AUTO_CLOSE_CONFIDENCE_SCORE_MAX_THRESHOLD]:
          expect.objectContaining({
            value: 1,
            type: 'number',
            technicalPreview: true,
          }),
      })
    );
  });

  it('registers the alert analysis workflow agent setting defaulting to the default agent', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings[SECURITY_SOLUTION_ALERT_ANALYSIS_WORKFLOW_AGENT_ID]).toEqual(
      expect.objectContaining({
        value: agentBuilderDefaultAgentId,
        type: 'string',
        sensitive: true,
        technicalPreview: true,
      })
    );
  });

  it('registers ENABLE_NEW_FLYOUT_SETTING when newFlyoutSystemDisabled flag is disabled', () => {
    initUiSettings(mockUiSettings, mockExperimentalFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).toHaveProperty(ENABLE_NEW_FLYOUT_SETTING);
    expect(registeredSettings[ENABLE_NEW_FLYOUT_SETTING]).toEqual(
      expect.objectContaining({
        name: 'Enable new flyout',
        value: true,
        type: 'boolean',
        requiresPageReload: true,
      })
    );
  });

  it('does NOT register ENABLE_NEW_FLYOUT_SETTING when newFlyoutSystemDisabled flag is enabled', () => {
    const disabledFeatures = {
      ...mockExperimentalFeatures,
      newFlyoutSystemDisabled: true,
    };

    initUiSettings(mockUiSettings, disabledFeatures, false);

    const registeredSettings = (mockUiSettings.register as jest.Mock).mock.calls[0][0];
    expect(registeredSettings).not.toHaveProperty(ENABLE_NEW_FLYOUT_SETTING);
  });
});
