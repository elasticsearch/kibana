/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core/public/mocks';
import { InstallationService } from './installation_service';
import { STATUS_API_PATH, INSTALL_API_PATH, UNINSTALL_API_PATH } from '../../../common';

describe('InstallationService', () => {
  let http: ReturnType<typeof httpServiceMock.createSetupContract>;
  let service: InstallationService;

  beforeEach(() => {
    http = httpServiceMock.createSetupContract();
    service = new InstallationService({ http });
  });

  describe('#getInstallationStatus', () => {
    it('calls the endpoint with the right parameters', async () => {
      await service.getInstallationStatus();
      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith(STATUS_API_PATH);
    });
    it('returns the value from the server', async () => {
      const expected = { stubbed: true };
      http.get.mockResolvedValue(expected);

      const response = await service.getInstallationStatus();
      expect(response).toEqual(expected);
    });
  });
  describe('#install', () => {
    beforeEach(() => {
      http.post.mockResolvedValue({ status: 'installed' });
    });

    it('calls the endpoint with the right parameters', async () => {
      await service.install();

      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith(INSTALL_API_PATH);
    });
    it('returns the value from the server', async () => {
      const expected = { status: 'installed' };
      http.post.mockResolvedValue(expected);

      const response = await service.install();
      expect(response).toEqual(expected);
    });
  });
  describe('#uninstall', () => {
    it('calls the endpoint with the right parameters', async () => {
      await service.uninstall();
      expect(http.delete).toHaveBeenCalledTimes(1);
      expect(http.delete).toHaveBeenCalledWith(UNINSTALL_API_PATH);
    });
  });
});
