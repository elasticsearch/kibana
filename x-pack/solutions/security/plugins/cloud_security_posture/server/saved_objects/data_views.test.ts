/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, ISavedObjectsRepository } from '@kbn/core/server';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { asSpaceId, DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import {
  CDR_MISCONFIGURATIONS_INDEX_PATTERN,
  CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX,
  CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS,
  CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS,
  CDR_MISCONFIGURATIONS_DATA_VIEW_NAME,
  CDR_VULNERABILITIES_INDEX_PATTERN,
  CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX,
  CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_OLD_VERSIONS,
  CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS,
  CDR_VULNERABILITIES_DATA_VIEW_NAME,
} from '@kbn/cloud-security-posture-common';
import {
  installDataView,
  deleteOldAndLegacyCdrDataViewsForAllSpaces,
  setupCdrDataViews,
} from './data_views';

describe('data_views', () => {
  let mockSoClient: jest.Mocked<ISavedObjectsRepository>;
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLogger: jest.Mocked<Logger>;
  let mockSpacesService: jest.Mocked<SpacesServiceStart>;
  let mockDataViewsService: jest.Mocked<DataViewsServerPluginStart>;
  let mockRequest: jest.Mocked<KibanaRequest>;

  beforeEach(() => {
    mockSoClient = {
      get: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      bulkGet: jest.fn(),
    } as any;

    mockEsClient = {} as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockSpacesService = {
      getSpaceId: jest.fn().mockReturnValue(DEFAULT_SPACE_ID),
    } as any;

    const mockDataViewsClient = {
      createAndSave: jest.fn(),
    };

    mockDataViewsService = {
      dataViewsServiceFactory: jest.fn().mockResolvedValue(mockDataViewsClient),
    } as any;

    mockRequest = {} as any;
  });

  describe('installDataView', () => {
    it('should create a new data view when it does not exist', async () => {
      mockSoClient.get.mockRejectedValue(new Error('Not found'));

      const mockDataViewsClient = {
        createAndSave: jest.fn(),
      };
      mockDataViewsService.dataViewsServiceFactory.mockResolvedValue(mockDataViewsClient as any);

      await installDataView(
        mockEsClient,
        mockSoClient,
        mockSpacesService,
        mockDataViewsService,
        mockRequest,
        CDR_MISCONFIGURATIONS_DATA_VIEW_NAME,
        CDR_MISCONFIGURATIONS_INDEX_PATTERN,
        CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX,
        mockLogger
      );

      expect(mockDataViewsClient.createAndSave).toHaveBeenCalledWith(
        {
          id: `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`,
          title: CDR_MISCONFIGURATIONS_INDEX_PATTERN,
          name: `${CDR_MISCONFIGURATIONS_DATA_VIEW_NAME} - ${DEFAULT_SPACE_ID} `,
          namespaces: [DEFAULT_SPACE_ID],
          allowNoIndex: true,
          timeFieldName: '@timestamp',
        },
        true
      );
    });

    it('should not create a data view when it already exists', async () => {
      mockSoClient.get.mockResolvedValue({
        id: `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`,
        type: 'index-pattern',
        attributes: {},
        references: [],
      });

      const mockDataViewsClient = {
        createAndSave: jest.fn(),
      };
      mockDataViewsService.dataViewsServiceFactory.mockResolvedValue(mockDataViewsClient as any);

      await installDataView(
        mockEsClient,
        mockSoClient,
        mockSpacesService,
        mockDataViewsService,
        mockRequest,
        CDR_MISCONFIGURATIONS_DATA_VIEW_NAME,
        CDR_MISCONFIGURATIONS_INDEX_PATTERN,
        CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX,
        mockLogger
      );

      expect(mockDataViewsClient.createAndSave).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSoClient.get.mockRejectedValue(new Error('Not found'));
      mockDataViewsService.dataViewsServiceFactory.mockRejectedValue(
        new Error('Service unavailable')
      );

      await installDataView(
        mockEsClient,
        mockSoClient,
        mockSpacesService,
        mockDataViewsService,
        mockRequest,
        CDR_MISCONFIGURATIONS_DATA_VIEW_NAME,
        CDR_MISCONFIGURATIONS_INDEX_PATTERN,
        CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX,
        mockLogger
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to setup data view', expect.any(Error));
    });

    it('should use custom space ID when spaces service is available', async () => {
      const customSpaceId = asSpaceId('custom-space');
      mockSpacesService.getSpaceId.mockReturnValue(customSpaceId);
      mockSoClient.get.mockRejectedValue(new Error('Not found'));

      const mockDataViewsClient = {
        createAndSave: jest.fn(),
      };
      mockDataViewsService.dataViewsServiceFactory.mockResolvedValue(mockDataViewsClient as any);

      await installDataView(
        mockEsClient,
        mockSoClient,
        mockSpacesService,
        mockDataViewsService,
        mockRequest,
        CDR_MISCONFIGURATIONS_DATA_VIEW_NAME,
        CDR_MISCONFIGURATIONS_INDEX_PATTERN,
        CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX,
        mockLogger
      );

      expect(mockDataViewsClient.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${customSpaceId}`,
          namespaces: [customSpaceId],
        }),
        true
      );
    });
  });

  describe('deleteOldAndLegacyCdrDataViewsForAllSpaces', () => {
    it('should find and delete old misconfigurations data views', async () => {
      const oldDataViewId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;
      const newDataViewId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: oldDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: newDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 2,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.find).toHaveBeenCalledWith({
        type: 'index-pattern',
        namespaces: ['*'],
        perPage: 1000,
      });

      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldDataViewId, {
        namespace: DEFAULT_SPACE_ID,
      });

      expect(mockSoClient.delete).not.toHaveBeenCalledWith('index-pattern', newDataViewId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });

    it('should find and delete old vulnerabilities data views', async () => {
      const oldDataViewId = `${CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: oldDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldDataViewId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });

    it('should find and delete legacy misconfigurations data views (wildcard, not space-specific)', async () => {
      const legacyDataViewId = CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS[0];

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: legacyDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['*'], // Legacy data views used wildcards
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      // For wildcard namespaces, delete uses force: true instead of namespace: '*'
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyDataViewId, {
        force: true,
      });
    });

    it('should find and delete legacy vulnerabilities data views (wildcard, not space-specific)', async () => {
      const legacyDataViewId = CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS[0];

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: legacyDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['*'], // Legacy data views used wildcards
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      // For wildcard namespaces, delete uses force: true instead of namespace: '*'
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyDataViewId, {
        force: true,
      });
    });

    it('should handle multiple old data views across different spaces', async () => {
      const oldMisconfigId1 = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;
      const oldMisconfigId2 = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-custom-space`;
      const oldVulnId = `${CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: oldMisconfigId1,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: oldMisconfigId2,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['custom-space'],
          },
          {
            id: oldVulnId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 3,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).toHaveBeenCalledTimes(3);
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldMisconfigId1, {
        namespace: DEFAULT_SPACE_ID,
      });
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldMisconfigId2, {
        namespace: 'custom-space',
      });
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldVulnId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });

    it('should handle both legacy and old data views together', async () => {
      // Legacy IDs don't have space suffix (wildcard)
      const legacyMisconfigId = CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS[0];
      const legacyVulnId = CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS[0];

      // Old (v1) IDs have space suffix
      const oldMisconfigId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;
      const oldVulnId = `${CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;

      // Current (v2) IDs have space suffix
      const currentMisconfigId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`;
      const currentVulnId = `${CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: legacyMisconfigId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['*'], // Legacy used wildcards
          },
          {
            id: oldMisconfigId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: legacyVulnId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['*'], // Legacy used wildcards
          },
          {
            id: oldVulnId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: currentMisconfigId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: currentVulnId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 6,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      // Should delete all 4 old/legacy data views but not the 2 current ones
      expect(mockSoClient.delete).toHaveBeenCalledTimes(4);
      // Legacy data views use force: true (because they have wildcard namespaces)
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyMisconfigId, {
        force: true,
      });
      // Old (v1) data views use namespace: space-id
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldMisconfigId, {
        namespace: DEFAULT_SPACE_ID,
      });
      // Legacy data views use force: true (because they have wildcard namespaces)
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyVulnId, {
        force: true,
      });
      // Old (v1) data views use namespace: space-id
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldVulnId, {
        namespace: DEFAULT_SPACE_ID,
      });

      // Should not delete current data views
      expect(mockSoClient.delete).not.toHaveBeenCalledWith('index-pattern', currentMisconfigId, {
        namespace: DEFAULT_SPACE_ID,
      });
      expect(mockSoClient.delete).not.toHaveBeenCalledWith('index-pattern', currentVulnId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });

    it('should handle all legacy versions when multiple exist (wildcard namespaces)', async () => {
      // Legacy IDs don't have space suffix - they used wildcards
      const legacyIds = CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS;

      mockSoClient.find.mockResolvedValue({
        saved_objects: legacyIds.map((id) => ({
          id,
          type: 'index-pattern',
          attributes: {},
          references: [],
          score: 1,
          namespaces: ['*'], // Legacy data views used wildcards
        })),
        total: legacyIds.length,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).toHaveBeenCalledTimes(legacyIds.length);
      // Legacy data views with wildcard namespaces use force: true
      legacyIds.forEach((legacyId) => {
        expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyId, {
          force: true,
        });
      });
    });

    it('should handle legacy data views in specific namespace (edge case)', async () => {
      const legacyDataViewId = CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_LEGACY_VERSIONS[0];

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: legacyDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: ['custom-space'], // Edge case: legacy in specific space
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', legacyDataViewId, {
        namespace: 'custom-space',
      });
    });

    it('should not delete the Current data view', async () => {
      const oldDataViewId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;
      const currentDataViewId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: oldDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
          {
            id: currentDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 2,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      // Should only delete the old data view, not the new one
      expect(mockSoClient.delete).toHaveBeenCalledTimes(1);
      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldDataViewId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });

    it('should warn when total data views exceeds page limit', async () => {
      mockSoClient.find.mockResolvedValue({
        saved_objects: [],
        total: 1500,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Total data views (1500) exceeds page limit (1000). Some old data views may not be deleted.'
      );
    });

    it('should handle no old data views gracefully', async () => {
      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            namespaces: [DEFAULT_SPACE_ID],
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and not throw', async () => {
      mockSoClient.find.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger)
      ).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete old and legacy CDR data views',
        expect.any(Error)
      );
    });

    it('should use default space ID when namespace is not provided', async () => {
      const oldDataViewId = `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX_OLD_VERSIONS[0]}-${DEFAULT_SPACE_ID}`;

      mockSoClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: oldDataViewId,
            type: 'index-pattern',
            attributes: {},
            references: [],
            score: 1,
            // No namespaces property
          },
        ],
        total: 1,
        per_page: 1000,
        page: 1,
      });

      await deleteOldAndLegacyCdrDataViewsForAllSpaces(mockSoClient, mockLogger);

      expect(mockSoClient.delete).toHaveBeenCalledWith('index-pattern', oldDataViewId, {
        namespace: DEFAULT_SPACE_ID,
      });
    });
  });

  describe('setupCdrDataViews', () => {
    it('should install both misconfigurations and vulnerabilities data views', async () => {
      mockSoClient.get.mockRejectedValue(new Error('Not found'));

      const mockDataViewsClient = {
        createAndSave: jest.fn(),
      };
      mockDataViewsService.dataViewsServiceFactory.mockResolvedValue(mockDataViewsClient as any);

      await setupCdrDataViews(
        mockEsClient,
        mockSoClient,
        mockSpacesService,
        mockDataViewsService,
        mockRequest,
        mockLogger
      );

      expect(mockDataViewsClient.createAndSave).toHaveBeenCalledTimes(2);

      // Check misconfigurations data view
      expect(mockDataViewsClient.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `${CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`,
          title: CDR_MISCONFIGURATIONS_INDEX_PATTERN,
          name: `${CDR_MISCONFIGURATIONS_DATA_VIEW_NAME} - ${DEFAULT_SPACE_ID} `,
        }),
        true
      );

      // Check vulnerabilities data view
      expect(mockDataViewsClient.createAndSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `${CDR_VULNERABILITIES_DATA_VIEW_ID_PREFIX}-${DEFAULT_SPACE_ID}`,
          title: CDR_VULNERABILITIES_INDEX_PATTERN,
          name: `${CDR_VULNERABILITIES_DATA_VIEW_NAME} - ${DEFAULT_SPACE_ID} `,
        }),
        true
      );
    });
  });
});
