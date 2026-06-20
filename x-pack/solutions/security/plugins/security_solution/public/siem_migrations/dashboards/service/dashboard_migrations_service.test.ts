/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * SiemDashboardMigrationsService.test.ts
 *
 * This file tests the SiemDashboardMigrationsService class.
 * We use Jest for assertions and mocking. We also use Jest’s fake timers to simulate the polling loop.
 */

import type { CoreStart } from '@kbn/core/public';
import * as api from '../api';
import { createTelemetryServiceMock } from '../../../common/lib/telemetry/telemetry_service.mock';
import { SiemMigrationTaskStatus } from '../../../../common/siem_migrations/constants';
import type { StartPluginsDependencies } from '../../../types';
import * as i18n from './translations';
import {
  CREATE_MIGRATION_BODY_BATCH_SIZE,
  SiemDashboardMigrationsService,
} from './dashboard_migrations_service';
import type { CreateDashboardMigrationDashboardsRequestBody } from '../../../../common/siem_migrations/model/api/dashboards/dashboard_migration.gen';
import { getMissingCapabilitiesChecker } from '../../common/service/capabilities';
import { ExperimentalFeaturesService } from '../../../common/experimental_features_service';
import { licenseService } from '../../../common/hooks/use_license';
import type { ExperimentalFeatures } from '../../../../common';
import { MigrationSource } from '../../common/types';

jest.mock('../api', () => ({
  createDashboardMigration: jest.fn(),
  deleteDashboardMigration: jest.fn(),
  upsertDashboardMigrationResources: jest.fn(),
  startDashboardMigration: jest.fn(),
  stopDashboardMigration: jest.fn(),
  getDashboardMigrationStats: jest.fn(),
  getDashboardMigrationAllStats: jest.fn(),
  addDashboardsToDashboardMigration: jest.fn(),
}));

jest.mock('../../common/service/capabilities', () => {
  return {
    ...jest.requireActual('../../common/service/capabilities'),
    getMissingCapabilitiesChecker: jest.fn(() => []),
  };
});

const mockGetMissingCapabilitiesChecker = getMissingCapabilitiesChecker as jest.MockedFunction<
  typeof getMissingCapabilitiesChecker
>;

jest.mock('../../../common/experimental_features_service', () => ({
  ExperimentalFeaturesService: {
    get: jest.fn(() => ({ automaticDashboardsMigration: true, siemMigrationsDisabled: false })),
  },
}));

jest.mock('../../../common/hooks/use_license', () => ({
  licenseService: {
    isEnterprise: jest.fn(() => true),
  },
}));

jest.mock('./notification/success_notification', () => ({
  getSuccessToast: jest.fn().mockReturnValue({ title: 'Success' }),
}));

jest.mock('../../common/service/notifications/no_connector_notification', () => ({
  getNoConnectorToast: jest.fn().mockReturnValue({ title: 'No Connector' }),
}));

jest.mock('../../common/service/notifications/missing_capabilities_notification', () => ({
  getMissingCapabilitiesToast: jest.fn().mockReturnValue({ title: 'Missing Capabilities' }),
}));

const mockGetDashboardMigrationStats = api.getDashboardMigrationStats as jest.Mock;
const mockGetDashboardMigrationAllStats = api.getDashboardMigrationAllStats as jest.Mock;
const mockStartDashboardMigration = api.startDashboardMigration as jest.Mock;
const mockStopDashboardMigration = api.stopDashboardMigration as jest.Mock;
const mockAddDashboardsToDashboardMigration = api.addDashboardsToDashboardMigration as jest.Mock;
const mockCreateDashboardMigration = api.createDashboardMigration as jest.Mock;
const mockDeleteDashboardMigration = api.deleteDashboardMigration as jest.Mock;
const mockUpsertDashboardMigrationResources = api.upsertDashboardMigrationResources as jest.Mock;

const defaultMigrationStats = {
  id: 'mig-1',
  status: SiemMigrationTaskStatus.READY,
  vendor: MigrationSource.SPLUNK,
  name: 'Test Migration',
  items: { total: 100, pending: 100, processing: 0, completed: 0, failed: 0 },
  created_at: '2025-01-01T00:00:00Z',
  last_updated_at: '2025-01-01T01:00:00Z',
};

describe('SiemDashboardMigrationsService', () => {
  let service: SiemDashboardMigrationsService;
  let mockCore: CoreStart;
  let mockPlugins: StartPluginsDependencies;
  let mockNotifications: CoreStart['notifications'];
  const mockTelemetry = createTelemetryServiceMock();
  const mockExperimentalFeaturesSpy = jest.spyOn(ExperimentalFeaturesService, 'get');
  const mockLicenseServiceIsEnterpriseSpy = jest.spyOn(licenseService, 'isEnterprise');

  beforeEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();

    mockExperimentalFeaturesSpy.mockReturnValue({
      automaticDashboardsMigration: true,
      siemMigrationsDisabled: false,
    } as unknown as ExperimentalFeatures);

    mockNotifications = {
      toasts: { add: jest.fn(), addError: jest.fn(), addSuccess: jest.fn() },
    } as unknown as CoreStart['notifications'];
    mockCore = {
      application: { capabilities: {} },
      notifications: mockNotifications,
    } as CoreStart;
    mockPlugins = {
      spaces: {
        getActiveSpace: jest.fn().mockResolvedValue({ id: 'test-space' }),
      },
    } as unknown as StartPluginsDependencies;
    mockGetDashboardMigrationStats.mockResolvedValue(defaultMigrationStats);
    mockGetDashboardMigrationAllStats.mockResolvedValue([]);
    mockStartDashboardMigration.mockResolvedValue({ started: true });
    mockStopDashboardMigration.mockResolvedValue({ stopped: true });
    mockGetMissingCapabilitiesChecker.mockReturnValue(() => []);
    service = new SiemDashboardMigrationsService(mockCore, mockPlugins, mockTelemetry);
    await Promise.resolve();
  });

  describe('isAvailable', () => {
    it('should return false when experimental `automaticDashboardsMigration` feature is disabled', () => {
      mockExperimentalFeaturesSpy.mockReturnValue({
        automaticDashboardsMigration: false,
        siemMigrationsDisabled: false,
      } as unknown as ExperimentalFeatures);

      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when experimental `siemMigrationsDisabled` feature is true', () => {
      mockExperimentalFeaturesSpy.mockReturnValue({
        automaticDashboardsMigration: true,
        siemMigrationsDisabled: true,
      } as unknown as ExperimentalFeatures);

      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when license is not enterprise', () => {
      mockLicenseServiceIsEnterpriseSpy.mockReturnValue(false);

      expect(service.isAvailable()).toBe(false);
    });

    it('should return false if there are missing capabilities ', () => {
      mockGetMissingCapabilitiesChecker.mockReturnValue(() => [
        { capability: 'cap', description: 'desc' },
      ]);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('createDashboardMigration', () => {
    it('should throw an error when body is empty', async () => {
      await expect(
        service.createDashboardMigration([], 'test', MigrationSource.SPLUNK)
      ).rejects.toThrow(i18n.EMPTY_DASHBOARDS_ERROR);
    });

    it('should create migration with a single batch', async () => {
      const body = [
        { result: { id: 'dashboard1', title: 'Some Title', 'eai:data': '<empty/>' } },
      ] as CreateDashboardMigrationDashboardsRequestBody;
      const name = 'test';
      mockCreateDashboardMigration.mockResolvedValue({ migration_id: 'mig-1' });
      mockAddDashboardsToDashboardMigration.mockResolvedValue(undefined);
      const migrationId = await service.createDashboardMigration(
        body,
        name,
        MigrationSource.SPLUNK
      );
      expect(mockCreateDashboardMigration).toHaveBeenCalledTimes(1);
      expect(mockCreateDashboardMigration).toHaveBeenCalledWith({ name });
      expect(mockAddDashboardsToDashboardMigration).toHaveBeenCalledWith({
        migrationId: 'mig-1',
        body,
      });
      expect(migrationId).toBe('mig-1');
    });

    it('should create migration in batches if body length exceeds the batch size', async () => {
      const body = new Array(CREATE_MIGRATION_BODY_BATCH_SIZE + 1).fill({
        dashboard: 'dashboard',
      });
      const name = 'test';
      mockCreateDashboardMigration.mockResolvedValueOnce({ migration_id: 'mig-1' });
      mockAddDashboardsToDashboardMigration.mockResolvedValue(undefined);
      const migrationId = await service.createDashboardMigration(
        body,
        name,
        MigrationSource.SPLUNK
      );
      expect(mockCreateDashboardMigration).toHaveBeenCalledTimes(1);
      expect(mockAddDashboardsToDashboardMigration).toHaveBeenCalledTimes(2);
      expect(mockAddDashboardsToDashboardMigration).toHaveBeenNthCalledWith(1, {
        migrationId: 'mig-1',
        body: body.slice(0, CREATE_MIGRATION_BODY_BATCH_SIZE),
      });
      expect(mockAddDashboardsToDashboardMigration).toHaveBeenNthCalledWith(2, {
        migrationId: 'mig-1',
        body: body.slice(CREATE_MIGRATION_BODY_BATCH_SIZE),
      });
      expect(migrationId).toBe('mig-1');
    });

    it('should delete migration when a batch fails, after all parallel batches have settled', async () => {
      const body = new Array(CREATE_MIGRATION_BODY_BATCH_SIZE * 3).fill({
        dashboard: 'dashboard',
      });
      const batchError = new Error('Invalid dashboard data');
      mockCreateDashboardMigration.mockResolvedValueOnce({ migration_id: 'mig-1' });
      mockDeleteDashboardMigration.mockResolvedValue(undefined);

      let resolveBatch2: () => void;
      const batch2Promise = new Promise<void>((resolve) => {
        resolveBatch2 = resolve;
      });

      let callCount = 0;
      mockAddDashboardsToDashboardMigration.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(batchError);
        }
        if (callCount === 2) {
          return batch2Promise;
        }
        return Promise.resolve(undefined);
      });

      const createPromise = service.createDashboardMigration(body, 'test', MigrationSource.SPLUNK);

      // Batch 2 is still in-flight; resolve it now to let allSettled complete
      resolveBatch2!();

      await expect(createPromise).rejects.toThrow('Invalid dashboard data');
      expect(mockDeleteDashboardMigration).toHaveBeenCalledWith({ migrationId: 'mig-1' });
      expect(mockAddDashboardsToDashboardMigration).toHaveBeenCalledTimes(3);
    });
  });

  describe('upsertMigrationResources', () => {
    it('should throw an error when body is empty', async () => {
      await expect(
        service.upsertMigrationResources({
          migrationId: defaultMigrationStats.id,
          vendor: defaultMigrationStats.vendor,
          body: [],
        })
      ).rejects.toThrow(i18n.EMPTY_DASHBOARDS_ERROR);
    });

    it('should upsert resources in batches', async () => {
      const body = new Array(CREATE_MIGRATION_BODY_BATCH_SIZE + 1).fill({
        resource: 'res',
      });
      mockUpsertDashboardMigrationResources.mockResolvedValue({});
      await service.upsertMigrationResources({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
        body,
      });
      expect(mockUpsertDashboardMigrationResources).toHaveBeenCalledTimes(2);
      expect(mockUpsertDashboardMigrationResources.mock.calls[0][0]).toEqual({
        migrationId: 'mig-1',
        body: body.slice(0, CREATE_MIGRATION_BODY_BATCH_SIZE),
      });
      expect(mockUpsertDashboardMigrationResources.mock.calls[1][0]).toEqual({
        migrationId: 'mig-1',
        body: body.slice(CREATE_MIGRATION_BODY_BATCH_SIZE),
      });
    });
  });

  describe('startDashboardMigration', () => {
    it('should notify and not start migration if missing capabilities exist', async () => {
      mockGetMissingCapabilitiesChecker.mockReturnValue(() => [
        { capability: 'cap', description: 'desc' },
      ]);
      const result = await service.startDashboardMigration({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
      });
      expect(mockNotifications.toasts.add).toHaveBeenCalled();
      expect(result).toEqual({ started: false });
    });

    it('should notify and not start migration if connectorId is missing', async () => {
      jest.spyOn(service, 'getMissingCapabilities').mockReturnValue([]);
      jest.spyOn(service.connectorIdStorage, 'get').mockReturnValue(undefined);
      const result = await service.startDashboardMigration({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
      });
      expect(mockNotifications.toasts.add).toHaveBeenCalled();
      expect(result).toEqual({ started: false });
    });

    it('should start migration successfully when capabilities and connectorId are present', async () => {
      jest.spyOn(service, 'getMissingCapabilities').mockReturnValue([]);
      jest.spyOn(service.connectorIdStorage, 'get').mockReturnValue('connector-123');
      mockStartDashboardMigration.mockResolvedValue({ started: true });
      let statsCalls = 0;
      mockGetDashboardMigrationStats.mockImplementation(async () => {
        statsCalls++;
        if (statsCalls < 2) {
          return { ...defaultMigrationStats, status: SiemMigrationTaskStatus.READY };
        }
        return { ...defaultMigrationStats, status: SiemMigrationTaskStatus.RUNNING };
      });
      const startPollingSpy = jest.spyOn(service, 'startPolling');
      /* @ts-expect-error spying on protected property */
      const migrationStatsTaskPollUntilSpy = jest.spyOn(service, 'migrationTaskPollingUntil');
      const result = await service.startDashboardMigration({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
      });
      expect(mockStartDashboardMigration).toHaveBeenCalledWith({
        migrationId: 'mig-1',
        settings: { connectorId: 'connector-123' },
      });
      expect(startPollingSpy).toHaveBeenCalled();
      expect(migrationStatsTaskPollUntilSpy).toHaveBeenCalled();
      expect(mockGetDashboardMigrationStats).toHaveBeenCalledTimes(statsCalls);
      expect(result).toEqual({ started: true });
    });
  });

  describe('stopDashboardMigration', () => {
    it('should notify and not stop migration if missing capabilities exist', async () => {
      jest
        .spyOn(service, 'getMissingCapabilities')
        .mockReturnValue([{ capability: 'cap', description: 'desc' }]);
      const result = await service.stopDashboardMigration({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
      });
      expect(mockNotifications.toasts.add).toHaveBeenCalled();
      expect(result).toEqual({ stopped: false });
    });

    it('should stop migration successfully', async () => {
      jest.spyOn(service, 'getMissingCapabilities').mockReturnValue([]);
      mockStopDashboardMigration.mockResolvedValue({ stopped: true });
      let statsCalls = 0;
      mockGetDashboardMigrationStats.mockImplementation(async () => {
        statsCalls++;
        if (statsCalls < 2) {
          return { ...defaultMigrationStats, status: SiemMigrationTaskStatus.RUNNING };
        }
        return { ...defaultMigrationStats, status: SiemMigrationTaskStatus.FINISHED };
      });
      /* @ts-expect-error Spying on protecting property */
      const migrationStatsTaskPollUntilSpy = jest.spyOn(service, 'migrationTaskPollingUntil');
      const result = await service.stopDashboardMigration({
        migrationId: defaultMigrationStats.id,
        vendor: defaultMigrationStats.vendor,
      });
      expect(mockStopDashboardMigration).toHaveBeenCalledWith({ migrationId: 'mig-1' });
      expect(migrationStatsTaskPollUntilSpy).toHaveBeenCalled();
      expect(mockGetDashboardMigrationStats).toHaveBeenCalledTimes(statsCalls);
      expect(result).toEqual({ stopped: true });
    });
  });

  describe('getDashboardMigrationAllStats', () => {
    it('should fetch and update latest stats', async () => {
      const statsArray = [
        { id: 'mig-1', status: SiemMigrationTaskStatus.RUNNING, name: 'test 1' },
        { id: 'mig-2', status: SiemMigrationTaskStatus.FINISHED, name: 'test 2' },
      ];
      mockGetDashboardMigrationAllStats.mockResolvedValue(statsArray);
      /* @ts-expect-error accessing protected property */
      const result = await service.fetchMigrationsStatsAll();
      expect(api.getDashboardMigrationAllStats).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test 1');
      expect(result[1].name).toBe('test 2');
    });
  });
});
