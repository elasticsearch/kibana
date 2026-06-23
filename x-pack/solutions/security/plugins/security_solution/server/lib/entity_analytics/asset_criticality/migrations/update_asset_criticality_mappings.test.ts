/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { updateAssetCriticalityMappings } from './update_asset_criticality_mappings';
import type { Logger } from '@kbn/core/server';

const mockisMappingsMigrationRequired = jest.fn();
const mockmigrateMappings = jest.fn();

jest.mock('../asset_criticality_migration_client', () => ({
  AssetCriticalityMigrationClient: jest.fn().mockImplementation(() => ({
    isMappingsMigrationRequired: () => mockisMappingsMigrationRequired(),
    migrateMappings: () => mockmigrateMappings(),
  })),
}));

describe('updateAssetCriticalityMappings', () => {
  const mockLogger = { info: jest.fn(), error: jest.fn() } as unknown as Logger;
  const mockGetStartServices = jest
    .fn()
    .mockResolvedValue([{ elasticsearch: { client: { asInternalUser: {} } } }]);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should migrate mappings if migration is required', async () => {
    mockisMappingsMigrationRequired.mockResolvedValue(true);

    await updateAssetCriticalityMappings({
      auditLogger: undefined,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockLogger.info).toHaveBeenCalledWith('Migrating Asset Criticality mappings');
    expect(mockmigrateMappings).toHaveBeenCalled();
  });

  it('should not migrate mappings if migration is not required', async () => {
    mockisMappingsMigrationRequired.mockResolvedValue(false);

    await updateAssetCriticalityMappings({
      auditLogger: undefined,
      logger: mockLogger,
      getStartServices: mockGetStartServices,
      kibanaVersion: '8.0.0',
      hasEncryptionKey: true,
    });

    expect(mockisMappingsMigrationRequired).toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalledWith('Migrating Asset Criticality mappings');
  });
});
