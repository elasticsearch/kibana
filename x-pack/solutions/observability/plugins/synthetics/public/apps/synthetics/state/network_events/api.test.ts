/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fetchNetworkEvents } from './api';
import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import { apiService } from '../../../../utils/api_service';

jest.mock('../../../../utils/api_service', () => ({
  apiService: { get: jest.fn() },
}));

describe('fetchNetworkEvents remoteName plumbing', () => {
  const mockGet = apiService.get as jest.Mock;

  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ events: [], total: 0 });
  });

  it('omits the remoteName query param for local monitors', async () => {
    await fetchNetworkEvents({ checkGroup: 'cg-1', stepIndex: 2 });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.NETWORK_EVENTS,
      { checkGroup: 'cg-1', stepIndex: 2 },
      expect.anything()
    );
  });

  it('forwards remoteName to apiService.get when present', async () => {
    await fetchNetworkEvents({ checkGroup: 'cg-1', stepIndex: 2, remoteName: 'remote-a' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.NETWORK_EVENTS,
      { checkGroup: 'cg-1', stepIndex: 2, remoteName: 'remote-a' },
      expect.anything()
    );
  });

  it('forwards timestamp to apiService.get when present', async () => {
    await fetchNetworkEvents({
      checkGroup: 'cg-1',
      stepIndex: 2,
      timestamp: '2023-01-01T00:00:00.000Z',
    });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.NETWORK_EVENTS,
      { checkGroup: 'cg-1', stepIndex: 2, timestamp: '2023-01-01T00:00:00.000Z' },
      expect.anything()
    );
  });
});
