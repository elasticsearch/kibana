/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import { CheckEngineEnabledStep } from './check_engine_enabled_step';
import { createDispatcherPipelineState } from '../fixtures/test_utils';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';
import {
  createSettingsService,
  type MockUiSettingsClient,
} from '../../services/settings_service/settings_service.mock';

describe('CheckEngineEnabledStep', () => {
  let step: CheckEngineEnabledStep;
  let mockUiSettingsClient: MockUiSettingsClient;

  beforeEach(() => {
    const { loggerService } = createLoggerService();
    const { settingsService, mockUiSettingsClient: client } = createSettingsService();
    mockUiSettingsClient = client;
    step = new CheckEngineEnabledStep(loggerService, settingsService);
  });

  it('continues when alerting is enabled', async () => {
    mockUiSettingsClient.get.mockResolvedValue(true);

    const state = createDispatcherPipelineState();
    const result = await step.execute(state);

    expect(result).toEqual({ type: 'continue' });
    expect(mockUiSettingsClient.get).toHaveBeenCalledWith(ALERTING_V2_ENABLED_SETTING_ID);
  });

  it('halts with engine_disabled when alerting is disabled', async () => {
    mockUiSettingsClient.get.mockResolvedValue(false);

    const state = createDispatcherPipelineState();
    const result = await step.execute(state);

    expect(result).toEqual({ type: 'halt', reason: 'engine_disabled' });
  });

  it('propagates errors from the settings service', async () => {
    const error = new Error('failed to read setting');
    mockUiSettingsClient.get.mockRejectedValue(error);

    const state = createDispatcherPipelineState();

    await expect(step.execute(state)).rejects.toThrow('failed to read setting');
  });
});
