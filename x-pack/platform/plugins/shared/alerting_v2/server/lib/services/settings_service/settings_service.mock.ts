/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/server';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { SettingsService } from './settings_service';

export type MockUiSettingsClient = jest.Mocked<IUiSettingsClient>;

export function createSettingsService(): {
  settingsService: SettingsService;
  mockUiSettingsClient: MockUiSettingsClient;
} {
  const mockUiSettingsClient = uiSettingsServiceMock.createClient();
  const settingsService = new SettingsService(mockUiSettingsClient);
  return { settingsService, mockUiSettingsClient };
}
