/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { createToolTestMocks } from '../../../__mocks__/test_helpers';
import type { ExperimentalFeatures } from '../../../../../common';
import { getAgentBuilderResourceAvailability } from '../../../utils/get_agent_builder_resource_availability';
import { getWatchlistToolAvailability } from './watchlist_availability';

jest.mock('../../../utils/get_agent_builder_resource_availability', () => ({
  getAgentBuilderResourceAvailability: jest.fn(),
}));

const mockGetAgentBuilderResourceAvailability = getAgentBuilderResourceAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsWatchlistEnabled: true,
  entityAnalyticsEntityStoreV2: true,
} as ExperimentalFeatures;

describe('getWatchlistToolAvailability', () => {
  const { mockCore, mockLogger, mockRequest } = createToolTestMocks();

  const mockHasAtLeast = jest.fn().mockReturnValue(true);
  const mockGetLicense = jest.fn().mockResolvedValue({ hasAtLeast: mockHasAtLeast });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAgentBuilderResourceAvailability.mockResolvedValue({ status: 'available' });
    mockHasAtLeast.mockReturnValue(true);

    const mockCoreStart = coreMock.createStart();
    mockCore.getStartServices.mockResolvedValue([
      mockCoreStart,
      {
        licensing: {
          getLicense: mockGetLicense,
        },
      },
      {},
    ]);
  });

  it('returns available when all checks pass (space OK, FF enabled, Platinum license)', async () => {
    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: mockExperimentalFeatures,
    });

    expect(result.status).toBe('available');
  });

  it('returns unavailable when getAgentBuilderResourceAvailability returns unavailable (space check fails)', async () => {
    mockGetAgentBuilderResourceAvailability.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'not in a security space',
    });

    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: mockExperimentalFeatures,
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('not in a security space');
  });

  it('returns unavailable when entityAnalyticsWatchlistEnabled FF is false', async () => {
    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: {
        ...mockExperimentalFeatures,
        entityAnalyticsWatchlistEnabled: false,
      },
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('watchlists');
  });

  it('returns unavailable when license is below Platinum', async () => {
    mockHasAtLeast.mockReturnValue(false);

    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: mockExperimentalFeatures,
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('Platinum');
  });

  it('returns unavailable when requireEntityStoreV2 is set and entityAnalyticsEntityStoreV2 is false', async () => {
    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: {
        ...mockExperimentalFeatures,
        entityAnalyticsEntityStoreV2: false,
      },
      requireEntityStoreV2: true,
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('Entity Store V2');
  });

  it('returns available when requireEntityStoreV2 is not set even if entityAnalyticsEntityStoreV2 is false', async () => {
    const result = await getWatchlistToolAvailability({
      core: mockCore,
      request: mockRequest,
      logger: mockLogger,
      experimentalFeatures: {
        ...mockExperimentalFeatures,
        entityAnalyticsEntityStoreV2: false,
      },
    });

    expect(result.status).toBe('available');
  });
});
