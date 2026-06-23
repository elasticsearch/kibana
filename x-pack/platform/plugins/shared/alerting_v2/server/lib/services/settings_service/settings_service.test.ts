/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import { ALERTING_V2_ENABLED_SETTING_ID } from '@kbn/alerting-v2-constants';
import { SettingsService } from './settings_service';

describe('SettingsService', () => {
  let mockClient: ReturnType<typeof uiSettingsServiceMock.createClient>;
  let service: SettingsService;

  beforeEach(() => {
    mockClient = uiSettingsServiceMock.createClient();
    service = new SettingsService(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('delegates to uiSettingsClient.get with the provided key', async () => {
      mockClient.get.mockResolvedValue(true);

      const result = await service.get(ALERTING_V2_ENABLED_SETTING_ID);

      expect(mockClient.get).toHaveBeenCalledTimes(1);
      expect(mockClient.get).toHaveBeenCalledWith(ALERTING_V2_ENABLED_SETTING_ID);
      expect(result).toBe(true);
    });

    it('propagates errors from the underlying client', async () => {
      const error = new Error('failed to read setting');
      mockClient.get.mockRejectedValue(error);

      await expect(service.get(ALERTING_V2_ENABLED_SETTING_ID)).rejects.toThrow(
        'failed to read setting'
      );
    });
  });

  describe('set', () => {
    it('delegates to uiSettingsClient.set with the provided key and value', async () => {
      mockClient.set.mockResolvedValue(undefined);

      await service.set(ALERTING_V2_ENABLED_SETTING_ID, false);

      expect(mockClient.set).toHaveBeenCalledTimes(1);
      expect(mockClient.set).toHaveBeenCalledWith(ALERTING_V2_ENABLED_SETTING_ID, false);
    });

    it('propagates errors from the underlying client', async () => {
      const error = new Error('failed to write setting');
      mockClient.set.mockRejectedValue(error);

      await expect(service.set(ALERTING_V2_ENABLED_SETTING_ID, true)).rejects.toThrow(
        'failed to write setting'
      );
    });
  });
});
