/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { MonitorConfigRepository } from './monitor_config_repository';
import type { SyntheticsMonitor } from '../../common/runtime_types';
import { ConfigKey } from '../../common/runtime_types';
import * as utils from '../synthetics_service/utils';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { type SavedObjectsFindOptions } from '@kbn/core-saved-objects-api-server';
import {
  legacyMonitorAttributes,
  legacySyntheticsMonitorTypeSingle,
  syntheticsMonitorAttributes,
  syntheticsMonitorSavedObjectType,
} from '../../common/types/saved_objects';
import { MONITOR_SEARCH_FIELDS } from '../routes/common';

// Mock the utils functions
jest.mock('../synthetics_service/utils', () => ({
  formatSecrets: jest.fn((data) => ({ ...data, formattedSecrets: true })),
  normalizeSecrets: jest.fn((data) => ({ ...data, normalizedSecrets: true })),
}));

// Mock the AMP span
jest.mock('@kbn/apm-data-access-plugin/server/utils/with_apm_span', () => ({
  withApmSpan: jest.fn((spanName, fn) => fn()),
}));

describe('MonitorConfigRepository', () => {
  let soClient: jest.Mocked<SavedObjectsClientContract>;
  let encryptedSavedObjectsClient: jest.Mocked<EncryptedSavedObjectsClient>;
  let repository: MonitorConfigRepository;

  beforeEach(() => {
    soClient = savedObjectsClientMock.create();
    encryptedSavedObjectsClient = encryptedSavedObjectsMock
      .createStart()
      .getClient() as jest.Mocked<EncryptedSavedObjectsClient>;
    repository = new MonitorConfigRepository(soClient, encryptedSavedObjectsClient);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should get a monitor by id', async () => {
      const id = 'test-id';
      const mockMonitor = {
        id,
        attributes: { name: 'Test Monitor' },
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };

      soClient.bulkGet.mockResolvedValue({ saved_objects: [mockMonitor] });

      const result = await repository.get(id);

      expect(soClient.bulkGet).toHaveBeenCalledWith([
        { type: 'synthetics-monitor-multi-space', id },
        {
          type: 'synthetics-monitor',
          id,
        },
      ]);
      expect(result).toBe(mockMonitor);
    });

    it('should propagate errors', async () => {
      const id = 'test-id';
      const error = new Error(`Failed to get monitor with id ${id}: Not found`);

      soClient.bulkGet.mockRejectedValue(error);

      await expect(repository.get(id)).rejects.toThrow(
        /Failed to get monitor with id test-id: Not found/
      );
    });
  });

  describe('getAcrossSpaces', () => {
    it('issues a single multi-space lookup and one legacy lookup per namespace', async () => {
      const id = 'test-id';
      const namespaces = ['default', 'space-two'];
      const mockMonitor = {
        id,
        attributes: { name: 'Test Monitor' },
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };
      soClient.bulkGet.mockResolvedValue({ saved_objects: [mockMonitor] });

      const result = await repository.getAcrossSpaces(id, namespaces);

      expect(soClient.bulkGet).toHaveBeenCalledWith([
        { type: syntheticsMonitorSavedObjectType, id, namespaces: ['default', 'space-two'] },
        { type: legacySyntheticsMonitorTypeSingle, id, namespaces: ['default'] },
        { type: legacySyntheticsMonitorTypeSingle, id, namespaces: ['space-two'] },
      ]);
      expect(result).toBe(mockMonitor);
    });

    it('returns the first saved object that has attributes and no error', async () => {
      const id = 'test-id';
      const errored = {
        id,
        type: syntheticsMonitorSavedObjectType,
        attributes: {},
        references: [],
        error: { statusCode: 404, error: 'Not Found', message: 'not found' },
      };
      const found = {
        id,
        type: legacySyntheticsMonitorTypeSingle,
        attributes: { name: 'Legacy' },
        references: [],
      };
      soClient.bulkGet.mockResolvedValue({ saved_objects: [errored as any, found] });

      const result = await repository.getAcrossSpaces(id, ['default']);

      expect(result).toBe(found);
    });

    it('throws not-found when no namespace has the monitor', async () => {
      const id = 'missing-id';
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            id,
            type: syntheticsMonitorSavedObjectType,
            error: { statusCode: 404, error: 'Not Found', message: 'not found' },
          },
        ],
      } as any);

      await expect(repository.getAcrossSpaces(id, ['default'])).rejects.toMatchObject({
        output: { statusCode: 404 },
      });
    });

    it('deduplicates the namespaces array', async () => {
      const id = 'dup-id';
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          { id, type: syntheticsMonitorSavedObjectType, attributes: {}, references: [] },
        ],
      } as any);

      await repository.getAcrossSpaces(id, ['default', 'default', 'space-two']);

      const calledWith = soClient.bulkGet.mock.calls[0][0];
      expect(calledWith).toEqual([
        { type: syntheticsMonitorSavedObjectType, id, namespaces: ['default', 'space-two'] },
        { type: legacySyntheticsMonitorTypeSingle, id, namespaces: ['default'] },
        { type: legacySyntheticsMonitorTypeSingle, id, namespaces: ['space-two'] },
      ]);
    });

    it('uses the supplied saved objects client when provided', async () => {
      const id = 'test-id';
      const altClient = savedObjectsClientMock.create();
      altClient.bulkGet.mockResolvedValue({
        saved_objects: [
          { id, type: syntheticsMonitorSavedObjectType, attributes: {}, references: [] },
        ],
      } as any);

      await repository.getAcrossSpaces(id, ['default'], altClient);

      expect(altClient.bulkGet).toHaveBeenCalledTimes(1);
      expect(soClient.bulkGet).not.toHaveBeenCalled();
    });
  });

  describe('getDecrypted', () => {
    it('should get and decrypt a monitor by id and space', async () => {
      const id = 'test-id';
      const spaceId = 'test-space';
      const mockDecryptedMonitor = {
        id,
        attributes: { name: 'Test Monitor', secrets: 'decrypted' },
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };

      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(
        mockDecryptedMonitor
      );
      (utils.normalizeSecrets as jest.Mock).mockReturnValue({
        ...mockDecryptedMonitor,
      });

      const result = await repository.getDecrypted(id, spaceId);

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        syntheticsMonitorSavedObjectType,
        id,
        { namespace: spaceId }
      );
      expect(utils.normalizeSecrets).toHaveBeenCalledWith(mockDecryptedMonitor);
      expect(result).toEqual({
        decryptedMonitor: mockDecryptedMonitor,
        normalizedMonitor: mockDecryptedMonitor,
      });
    });
  });

  describe('create', () => {
    it('should create a monitor with an id', async () => {
      const id = 'test-id';
      const normalizedMonitor = {
        name: 'Test Monitor',
        [ConfigKey.CUSTOM_HEARTBEAT_ID]: 'custom-id',
      } as unknown as SyntheticsMonitor;

      const mockCreatedMonitor = {
        id,
        attributes: { name: 'Test Monitor' },
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };
      soClient.create.mockResolvedValue(mockCreatedMonitor);

      const result = await repository.create({
        id,
        normalizedMonitor,
        spaceId: 'default',
      });

      expect(utils.formatSecrets).toHaveBeenCalledWith({
        ...normalizedMonitor,
        [ConfigKey.MONITOR_QUERY_ID]: 'custom-id',
        [ConfigKey.CONFIG_ID]: id,
        revision: 1,
        spaces: ['default'],
      });

      expect(soClient.create).toHaveBeenCalledWith(
        syntheticsMonitorSavedObjectType,
        {
          ...normalizedMonitor,
          [ConfigKey.MONITOR_QUERY_ID]: 'custom-id',
          [ConfigKey.CONFIG_ID]: id,
          revision: 1,
          formattedSecrets: true,
          spaces: ['default'],
        },
        { id, overwrite: true, initialNamespaces: ['default'] }
      );

      expect(result).toBe(mockCreatedMonitor);
    });

    it('should create a monitor without an id', async () => {
      const normalizedMonitor = {
        name: 'Test Monitor',
      } as unknown as SyntheticsMonitor;

      const mockCreatedMonitor = {
        id: 'generated-id',
        attributes: { name: 'Test Monitor' },
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };
      soClient.create.mockResolvedValue(mockCreatedMonitor);

      const result = await repository.create({
        id: 'test',
        normalizedMonitor,
        spaceId: 'default',
      });

      expect(utils.formatSecrets).toHaveBeenCalledWith({
        ...normalizedMonitor,
        [ConfigKey.MONITOR_QUERY_ID]: 'test',
        [ConfigKey.CONFIG_ID]: 'test',
        revision: 1,
        spaces: ['default'],
      });

      expect(soClient.create).toHaveBeenCalledWith(
        syntheticsMonitorSavedObjectType,
        {
          ...normalizedMonitor,
          [ConfigKey.MONITOR_QUERY_ID]: 'test',
          [ConfigKey.CONFIG_ID]: 'test',
          revision: 1,
          formattedSecrets: true,
          spaces: ['default'],
        },
        { id: 'test', overwrite: true, initialNamespaces: ['default'] }
      );

      expect(result).toBe(mockCreatedMonitor);
    });
  });

  describe('createBulk', () => {
    it('should create multiple monitors in bulk', async () => {
      const monitors = [
        {
          id: 'test-id-1',
          monitor: {
            name: 'Test Monitor 1',
            [ConfigKey.CUSTOM_HEARTBEAT_ID]: 'custom-id-1',
          },
        },
        {
          id: 'test-id-2',
          monitor: {
            name: 'Test Monitor 2',
          },
        },
      ] as any;

      const mockBulkCreateResult = {
        saved_objects: [
          {
            id: 'test-id-1',
            attributes: { name: 'Test Monitor 1' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
          {
            id: 'test-id-2',
            attributes: { name: 'Test Monitor 2' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };

      soClient.bulkCreate.mockResolvedValue(mockBulkCreateResult);

      const result = await repository.createBulk({ monitors });

      expect(soClient.bulkCreate).toHaveBeenCalledWith([
        {
          id: 'test-id-1',
          type: syntheticsMonitorSavedObjectType,
          attributes: {
            name: 'Test Monitor 1',
            [ConfigKey.CUSTOM_HEARTBEAT_ID]: 'custom-id-1',
            [ConfigKey.MONITOR_QUERY_ID]: 'custom-id-1',
            [ConfigKey.CONFIG_ID]: 'test-id-1',
            revision: 1,
            formattedSecrets: true,
          },
        },
        {
          id: 'test-id-2',
          type: syntheticsMonitorSavedObjectType,
          attributes: {
            name: 'Test Monitor 2',
            [ConfigKey.MONITOR_QUERY_ID]: 'test-id-2',
            [ConfigKey.CONFIG_ID]: 'test-id-2',
            revision: 1,
            formattedSecrets: true,
          },
        },
      ]);

      expect(result).toBe(mockBulkCreateResult.saved_objects);
    });
  });

  describe('update', () => {
    it('fully replaces attributes (mergeAttributes: false) so removed map-field keys are deleted', async () => {
      const id = 'test-id';
      const decryptedPreviousMonitor = {
        id,
        type: syntheticsMonitorSavedObjectType,
        namespaces: ['default'],
        attributes: {
          name: 'Test Monitor',
          [ConfigKey.LABELS]: { a: '1', b: '2', team: 'obs' },
        },
        references: [],
      } as any;

      // New attributes drop the `a` and `b` labels, keeping only `team`. A deep-merge
      // would silently restore the removed keys (see #274387).
      const data = {
        name: 'Test Monitor',
        [ConfigKey.LABELS]: { team: 'obs' },
        spaces: ['default'],
      } as any;

      const mockUpdatedMonitor = {
        id,
        attributes: data,
        type: syntheticsMonitorSavedObjectType,
        references: [],
      };
      soClient.update.mockResolvedValue(mockUpdatedMonitor as any);

      const result = await repository.update(id, data, decryptedPreviousMonitor);

      expect(soClient.update).toHaveBeenCalledWith(syntheticsMonitorSavedObjectType, id, data, {
        references: undefined,
        mergeAttributes: false,
      });
      expect(result).toBe(mockUpdatedMonitor);
    });

    it('recreates the saved object when spaces change instead of updating', async () => {
      const id = 'test-id';
      const decryptedPreviousMonitor = {
        id,
        type: syntheticsMonitorSavedObjectType,
        namespaces: ['default'],
        attributes: {},
        references: [],
      } as any;
      const data = { name: 'Test Monitor', spaces: ['space-2'] } as any;

      soClient.delete.mockResolvedValue({} as any);
      const mockCreated = { id, attributes: data, type: syntheticsMonitorSavedObjectType };
      soClient.create.mockResolvedValue(mockCreated as any);

      const result = await repository.update(id, data, decryptedPreviousMonitor);

      expect(soClient.delete).toHaveBeenCalledWith(syntheticsMonitorSavedObjectType, id, {
        force: true,
      });
      expect(soClient.create).toHaveBeenCalledWith(syntheticsMonitorSavedObjectType, data, {
        id,
        initialNamespaces: ['space-2'],
        references: undefined,
      });
      expect(result).toBe(mockCreated);
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple monitors in bulk', async () => {
      const monitors = [
        {
          id: 'test-id-1',
          attributes: {
            name: 'Updated Monitor 1',
          },
          previousMonitor: { type: 'synthetics-monitor-multi-space' },
        },
        {
          id: 'test-id-2',
          attributes: {
            name: 'Updated Monitor 2',
          },
          previousMonitor: { type: 'synthetics-monitor' },
        },
      ] as any;

      const mockBulkUpdateResult = {
        saved_objects: [
          {
            id: 'test-id-1',
            attributes: { name: 'Updated Monitor 1' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
          {
            id: 'test-id-2',
            attributes: { name: 'Updated Monitor 2' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };

      soClient.bulkUpdate.mockResolvedValue(mockBulkUpdateResult);

      const result = await repository.bulkUpdate({ monitors });

      expect(soClient.bulkUpdate).toHaveBeenCalledWith([
        {
          type: syntheticsMonitorSavedObjectType,
          id: 'test-id-1',
          attributes: { name: 'Updated Monitor 1' },
          mergeAttributes: false,
        },
        {
          type: 'synthetics-monitor',
          id: 'test-id-2',
          attributes: { name: 'Updated Monitor 2' },
          mergeAttributes: false,
        },
      ]);

      expect(result).toEqual(mockBulkUpdateResult);
    });

    it('should update multiple monitors in bulk when spaces do not change', async () => {
      const monitors = [
        {
          id: 'test-id-1',
          attributes: {
            name: 'Updated Monitor 1',
            spaces: ['default'],
          },
          soType: syntheticsMonitorSavedObjectType,
          previousMonitor: {
            id: 'test-id-1',
            type: syntheticsMonitorSavedObjectType,
            namespaces: ['default'],
            attributes: {},
            references: [],
          },
        },
        {
          id: 'test-id-2',
          attributes: {
            name: 'Updated Monitor 2',
            spaces: ['default'],
          },
          soType: syntheticsMonitorSavedObjectType,
          previousMonitor: {
            id: 'test-id-2',
            type: syntheticsMonitorSavedObjectType,
            namespaces: ['default'],
            attributes: {},
            references: [],
          },
        },
      ] as any;

      const mockBulkUpdateResult = {
        saved_objects: [
          {
            id: 'test-id-1',
            attributes: { name: 'Updated Monitor 1' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
          {
            id: 'test-id-2',
            attributes: { name: 'Updated Monitor 2' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };

      soClient.bulkUpdate.mockResolvedValue(mockBulkUpdateResult);

      const result = await repository.bulkUpdate({ monitors });

      expect(soClient.bulkUpdate).toHaveBeenCalledWith([
        {
          type: syntheticsMonitorSavedObjectType,
          id: 'test-id-1',
          attributes: { name: 'Updated Monitor 1', spaces: ['default'] },
          mergeAttributes: false,
        },
        {
          type: syntheticsMonitorSavedObjectType,
          id: 'test-id-2',
          attributes: { name: 'Updated Monitor 2', spaces: ['default'] },
          mergeAttributes: false,
        },
      ]);

      expect(result).toEqual({
        saved_objects: mockBulkUpdateResult.saved_objects,
      });
    });

    it('should delete legacy monitor and recreate in new type if spaces change', async () => {
      const monitors = [
        {
          id: 'legacy-id',
          attributes: {
            name: 'Monitor With Changed Spaces',
            spaces: ['space-2'],
          },
          soType: legacySyntheticsMonitorTypeSingle,
          previousMonitor: {
            id: 'legacy-id',
            type: legacySyntheticsMonitorTypeSingle,
            namespaces: ['space-1'],
            attributes: {},
            references: [],
          },
        },
      ] as any;

      const mockBulkCreateResult = {
        saved_objects: [
          {
            id: 'legacy-id',
            attributes: { name: 'Monitor With Changed Spaces', spaces: ['space-2'] },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };
      soClient.bulkDelete.mockResolvedValue({} as any);
      soClient.bulkCreate.mockResolvedValue(mockBulkCreateResult);

      const result = await repository.bulkUpdate({ monitors });

      expect(soClient.bulkDelete).toHaveBeenCalledWith(
        [{ id: 'legacy-id', type: legacySyntheticsMonitorTypeSingle }],
        { force: true }
      );
      expect(soClient.bulkCreate).toHaveBeenCalledWith([
        {
          id: 'legacy-id',
          type: syntheticsMonitorSavedObjectType,
          attributes: { name: 'Monitor With Changed Spaces', spaces: ['space-2'] },
          initialNamespaces: ['space-2'],
        },
      ]);
      expect(result).toEqual({
        saved_objects: mockBulkCreateResult.saved_objects,
      });
    });

    it('should handle mixed updates and recreations', async () => {
      const monitors = [
        {
          id: 'legacy-id',
          attributes: {
            name: 'Monitor With Changed Spaces',
            spaces: ['space-2'],
          },
          soType: legacySyntheticsMonitorTypeSingle,
          previousMonitor: {
            id: 'legacy-id',
            type: legacySyntheticsMonitorTypeSingle,
            namespaces: ['space-1'],
            attributes: {},
            references: [],
          },
        },
        {
          id: 'test-id-2',
          attributes: {
            name: 'Updated Monitor 2',
            spaces: ['default'],
          },
          soType: syntheticsMonitorSavedObjectType,
          previousMonitor: {
            id: 'test-id-2',
            type: syntheticsMonitorSavedObjectType,
            namespaces: ['default'],
            attributes: {},
            references: [],
          },
        },
      ] as any;

      soClient.bulkDelete.mockResolvedValue({} as any);
      const mockBulkCreateResult = {
        saved_objects: [
          {
            id: 'legacy-id',
            attributes: { name: 'Monitor With Changed Spaces', spaces: ['space-2'] },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };
      soClient.bulkCreate.mockResolvedValue(mockBulkCreateResult);
      const mockBulkUpdateResult = {
        saved_objects: [
          {
            id: 'test-id-2',
            attributes: { name: 'Updated Monitor 2', spaces: ['default'] },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      };
      soClient.bulkUpdate.mockResolvedValue(mockBulkUpdateResult);

      const result = await repository.bulkUpdate({ monitors });

      expect(soClient.bulkDelete).toHaveBeenCalledWith(
        [{ id: 'legacy-id', type: legacySyntheticsMonitorTypeSingle }],
        { force: true }
      );
      expect(soClient.bulkCreate).toHaveBeenCalledWith([
        {
          id: 'legacy-id',
          type: syntheticsMonitorSavedObjectType,
          attributes: { name: 'Monitor With Changed Spaces', spaces: ['space-2'] },
          initialNamespaces: ['space-2'],
        },
      ]);
      expect(soClient.bulkUpdate).toHaveBeenCalledWith([
        {
          type: syntheticsMonitorSavedObjectType,
          id: 'test-id-2',
          attributes: { name: 'Updated Monitor 2', spaces: ['default'] },
          mergeAttributes: false,
        },
      ]);
      expect(result).toEqual({
        saved_objects: [
          {
            id: 'test-id-2',
            attributes: { name: 'Updated Monitor 2', spaces: ['default'] },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
          {
            id: 'legacy-id',
            attributes: { name: 'Monitor With Changed Spaces', spaces: ['space-2'] },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
      });
    });
  });

  describe('find', () => {
    it('should find monitors with options', async () => {
      const options = {
        search: 'test',
        page: 1,
        perPage: 10,
        sortField: 'name',
        sortOrder: 'asc' as const,
        filter: `${syntheticsMonitorAttributes}.enabled:true`,
      };

      const mockFindResult = {
        saved_objects: [
          {
            id: 'test-id-1',
            attributes: { name: 'Test Monitor 1' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
          {
            id: 'test-id-2',
            attributes: { name: 'Test Monitor 2' },
            type: syntheticsMonitorSavedObjectType,
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      } as any;

      soClient.find.mockImplementation((opts: SavedObjectsFindOptions) => {
        if (opts.type !== syntheticsMonitorSavedObjectType) {
          return {
            saved_objects: [],
            total: 0,
            per_page: 0,
            page: 1,
          };
        }
        return mockFindResult;
      });

      const result = await repository.find(options);

      expect(soClient.find).toHaveBeenCalledWith({
        type: syntheticsMonitorSavedObjectType,
        ...options,
        perPage: 10000,
      });

      expect(soClient.find).toHaveBeenLastCalledWith({
        type: legacySyntheticsMonitorTypeSingle,
        ...{ ...options, filter: 'synthetics-monitor.attributes.enabled:true', perPage: 10000 },
      });

      expect(result).toStrictEqual(mockFindResult);
    });

    it('should use default perPage if not provided', async () => {
      const options = {
        search: 'test',
      };

      const mockFindResult = {
        saved_objects: [],
        total: 0,
        per_page: 5000,
        page: 1,
      };

      soClient.find.mockResolvedValue(mockFindResult);

      await repository.find(options);

      expect(soClient.find).toHaveBeenCalledWith({
        type: syntheticsMonitorSavedObjectType,
        search: 'test',
        perPage: 10000,
        page: 1,
      });
    });
  });

  describe('findDecryptedMonitors', () => {
    it('should find decrypted monitors by space id and filter', async () => {
      const spaceId = 'test-space';
      const filter = 'attributes.name:test';

      const mockDecryptedMonitors = [
        {
          id: 'test-id-1',
          attributes: { name: 'Test Monitor 1', secrets: 'decrypted' },
          type: syntheticsMonitorSavedObjectType,
          references: [],
        },
        {
          id: 'test-id-2',
          attributes: { name: 'Test Monitor 2', secrets: 'decrypted' },
          type: syntheticsMonitorSavedObjectType,
          references: [],
        },
      ];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockDecryptedMonitors };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      } as any;

      encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser.mockReturnValue(
        pointInTimeFinderMock
      );

      const result = await repository.findDecryptedMonitors({ spaceId, filter });

      expect(
        encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser
      ).toHaveBeenCalledWith({
        filter,
        type: syntheticsMonitorSavedObjectType,
        perPage: 500,
        namespaces: [spaceId],
      });

      expect(pointInTimeFinderMock.find).toHaveBeenCalled();
      expect(pointInTimeFinderMock.close).toHaveBeenCalled();
      expect(result).toEqual([...mockDecryptedMonitors, ...mockDecryptedMonitors]);
    });

    it('should handle finder.close errors', async () => {
      const spaceId = 'test-space';

      const mockDecryptedMonitors = [
        {
          id: 'test-id-1',
          attributes: { name: 'Test Monitor 1', secrets: 'decrypted' },
          type: syntheticsMonitorSavedObjectType,
          references: [],
        },
      ];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockDecryptedMonitors };
        }),
        close: jest.fn().mockRejectedValue(new Error('Close failed')),
      } as any;

      encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser.mockReturnValue(
        pointInTimeFinderMock
      );

      const result = await repository.findDecryptedMonitors({ spaceId });

      expect(pointInTimeFinderMock.close).toHaveBeenCalled();
      expect(result).toEqual([...mockDecryptedMonitors, ...mockDecryptedMonitors]);
      // Should not throw an error when close fails
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple monitors by ids', async () => {
      const ids = [
        { id: 'test-id-1', type: syntheticsMonitorSavedObjectType },
        { id: 'test-id-2', type: syntheticsMonitorSavedObjectType },
      ];
      const mockBulkDeleteResult = { success: true } as any;

      soClient.bulkDelete.mockResolvedValue(mockBulkDeleteResult);

      const result = await repository.bulkDelete(ids);

      expect(soClient.bulkDelete).toHaveBeenCalledWith(
        [
          { type: syntheticsMonitorSavedObjectType, id: 'test-id-1' },
          { type: syntheticsMonitorSavedObjectType, id: 'test-id-2' },
        ],
        {
          force: true,
        }
      );

      expect(result).toBe(mockBulkDeleteResult);
    });
  });

  describe('getAll', () => {
    it('should get all monitors with options', async () => {
      const options = {
        search: 'test',
        fields: ['name'],
        filter: 'attributes.enabled:true',
        sortField: 'name.keyword',
        sortOrder: 'asc' as const,
        searchFields: ['name'],
        showFromAllSpaces: true,
      };

      const mockMonitors = [
        { id: 'test-id-1', attributes: { name: 'Test Monitor 1' } },
        { id: 'test-id-2', attributes: { name: 'Test Monitor 2' } },
      ];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockMonitors };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };

      soClient.createPointInTimeFinder.mockReturnValue(pointInTimeFinderMock);

      const result = await repository.getAll(options);

      expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith({
        type: syntheticsMonitorSavedObjectType,
        perPage: 5000,
        search: 'test',
        fields: ['name'],
        filter: 'attributes.enabled:true',
        sortField: 'name.keyword',
        sortOrder: 'asc',
        searchFields: ['name'],
        namespaces: ['*'],
      });

      expect(result).toEqual([...mockMonitors, ...mockMonitors]);
    });

    it('should not include namespaces if showFromAllSpaces is false', async () => {
      const options = {
        search: 'test',
        showFromAllSpaces: false,
      };

      const mockMonitors: any = [];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockMonitors };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };

      soClient.createPointInTimeFinder.mockReturnValue(pointInTimeFinderMock);

      await repository.getAll(options);

      expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith({
        type: syntheticsMonitorSavedObjectType,
        perPage: 5000,
        search: 'test',
        sortField: 'name.keyword',
        sortOrder: 'asc',
        searchFields: MONITOR_SEARCH_FIELDS,
      });
    });

    it('should use default sort options if not provided', async () => {
      const options = {
        search: 'test',
      };

      const mockMonitors: any = [];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockMonitors };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };

      soClient.createPointInTimeFinder.mockReturnValue(pointInTimeFinderMock);

      await repository.getAll(options);

      expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith({
        type: syntheticsMonitorSavedObjectType,
        perPage: 5000,
        search: 'test',
        sortField: 'name.keyword',
        sortOrder: 'asc',
        searchFields: MONITOR_SEARCH_FIELDS,
      });
    });

    it('should handle finder.close errors', async () => {
      const options = { search: 'test' };

      const mockMonitors = [{ id: 'test-id-1', attributes: { name: 'Test Monitor 1' } }];

      const pointInTimeFinderMock = {
        find: jest.fn().mockImplementation(function* () {
          yield { saved_objects: mockMonitors };
        }),
        close: jest.fn().mockRejectedValue(new Error('Close failed')),
      };

      soClient.createPointInTimeFinder.mockReturnValue(pointInTimeFinderMock);

      const result = await repository.getAll(options);

      expect(pointInTimeFinderMock.close).toHaveBeenCalled();
      expect(result).toEqual([...mockMonitors, ...mockMonitors]);
      // Should not throw an error when close fails
    });
  });

  // Mock logger to spy on its methods
  const mockLogger = {
    error: jest.fn(),
  };

  describe('handleLegacyOptions', () => {
    // Clear mock history before each test
    beforeEach(() => {
      mockLogger.error.mockClear();
    });

    // Restore any mocks after all tests are done
    afterAll(() => {
      jest.restoreAllMocks();
    });

    test('should convert legacy attributes to new attributes for synthetics-monitor type', () => {
      const options = {
        search: 'my-monitor',
        search_fields: [`${legacyMonitorAttributes}.name`, 'status'],
        sortField: 'name',
        filter: `${legacyMonitorAttributes}.enabled:true`,
      };
      const type = syntheticsMonitorSavedObjectType;

      const expectedOptions = {
        filter: 'synthetics-monitor-multi-space.attributes.enabled:true',
        search: 'my-monitor',
        search_fields: ['synthetics-monitor-multi-space.attributes.name', 'status'],
        sortField: 'name',
      };

      const result = repository.handleLegacyOptions(options, type);
      expect(result).toEqual(expectedOptions);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should convert new attributes back to legacy for the legacy monitor type', () => {
      const options = {
        search_fields: [`${syntheticsMonitorAttributes}.name`, 'status'],
        sortField: `${syntheticsMonitorAttributes}.name`,
      };
      const legacyType = legacySyntheticsMonitorTypeSingle;

      const expectedOptions = {
        search_fields: ['synthetics-monitor.attributes.name', 'status'],
        sortField: 'synthetics-monitor.attributes.name',
      };

      const result = repository.handleLegacyOptions(options, legacyType);
      expect(result).toEqual(expectedOptions);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should return options unchanged if no target attributes are found for a matching type', () => {
      const options = {
        search: 'a-monitor',
        search_fields: ['status'],
      };
      const type = 'synthetics-monitor';

      const result = repository.handleLegacyOptions(options, type);
      expect(result).toEqual(options);
    });

    test('should handle an empty options object without errors', () => {
      const options = {};
      const type = 'synthetics-monitor';

      const result = repository.handleLegacyOptions(options, type);
      expect(result).toEqual({});
    });

    test('should handle options with null or undefined values', () => {
      const options = {
        search_fields: ['monitor.legacy.name', null],
        sortField: undefined,
      };
      const type = 'synthetics-monitor';

      const expectedOptions = {
        search_fields: ['monitor.legacy.name', null],
        sortField: undefined,
      };

      const result = repository.handleLegacyOptions(options, type);
      expect(result).toEqual(expectedOptions);
    });
  });
});
