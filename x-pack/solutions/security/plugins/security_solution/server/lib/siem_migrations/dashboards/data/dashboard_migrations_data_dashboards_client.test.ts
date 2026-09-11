/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { AuthenticatedUser } from '@kbn/security-plugin-types-common';
import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { DashboardMigrationsDataDashboardsClient } from './dashboard_migrations_data_dashboards_client';
import {
  SiemMigrationStatus,
  MigrationTranslationResult,
} from '../../../../../common/siem_migrations/constants';
import type { DashboardMigrationDashboard } from '../../../../../common/siem_migrations/model/dashboard_migration.gen';
import type { SiemMigrationsClientDependencies } from '../../common/types';
import type { StoredDashboardMigrationDashboard } from '../types';
import {
  SiemMigrationsDataItemClient,
  type CreateMigrationItemInput,
} from '../../common/data/siem_migrations_data_item_client';
import { dsl } from './dsl_queries';
import type { DashboardMigrationFilters } from '../../../../../common/siem_migrations/dashboards/types';

describe('DashboardMigrationsDataDashboardsClient', () => {
  let dashboardMigrationsDataDashboardsClient: DashboardMigrationsDataDashboardsClient;
  const esClient =
    elasticsearchServiceMock.createCustomClusterClient() as unknown as IScopedClusterClient;
  const logger = loggingSystemMock.createLogger();
  const indexNameProvider = jest.fn().mockReturnValue('.kibana-siem-dashboard-migrations');
  const currentUser = {
    userName: 'testUser',
    profile_uid: 'testProfileUid',
  } as unknown as AuthenticatedUser;
  const dependencies = {} as unknown as SiemMigrationsClientDependencies;

  beforeEach(() => {
    dashboardMigrationsDataDashboardsClient = new DashboardMigrationsDataDashboardsClient(
      indexNameProvider,
      currentUser,
      esClient,
      logger,
      dependencies
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    test('should create dashboard migrations in bulk', async () => {
      const dashboardMigrations: CreateMigrationItemInput<DashboardMigrationDashboard>[] = [
        {
          migration_id: 'migration1',
          original_dashboard: {
            id: 'dashboard1',
            vendor: 'splunk',
            title: 'Test Dashboard 1',
            description: 'Test description 1',
            data: 'test data 1',
            format: 'xml',
          },
          elastic_dashboard: {
            id: 'elastic_dashboard1',
            title: 'Elastic Dashboard 1',
            data: 'elastic data 1',
          },
        },
        {
          migration_id: 'migration1',
          original_dashboard: {
            id: 'dashboard2',
            vendor: 'splunk',
            title: 'Test Dashboard 2',
            description: 'Test description 2',
            data: 'test data 2',
            format: 'xml',
          },
          elastic_dashboard: {
            id: 'elastic_dashboard2',
            title: 'Elastic Dashboard 2',
            data: 'elastic data 2',
          },
        },
      ];

      await dashboardMigrationsDataDashboardsClient.create(dashboardMigrations);

      expect(esClient.asInternalUser.bulk).toHaveBeenCalledWith({
        refresh: 'wait_for',
        operations: [
          { create: { _index: '.kibana-siem-dashboard-migrations' } },
          {
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard1',
              vendor: 'splunk',
              title: 'Test Dashboard 1',
              description: 'Test description 1',
              data: 'test data 1',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard1',
              title: 'Elastic Dashboard 1',
              data: 'elastic data 1',
            },
            '@timestamp': expect.any(String),
            status: SiemMigrationStatus.PENDING,
            created_by: 'testProfileUid',
            updated_by: 'testProfileUid',
            updated_at: expect.any(String),
          },
          { create: { _index: '.kibana-siem-dashboard-migrations' } },
          {
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard2',
              vendor: 'splunk',
              title: 'Test Dashboard 2',
              description: 'Test description 2',
              data: 'test data 2',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard2',
              title: 'Elastic Dashboard 2',
              data: 'elastic data 2',
            },
            '@timestamp': expect.any(String),
            status: SiemMigrationStatus.PENDING,
            created_by: 'testProfileUid',
            updated_by: 'testProfileUid',
            updated_at: expect.any(String),
          },
        ],
      });
    });

    test('should handle bulk operations in chunks', async () => {
      const dashboardMigrations: CreateMigrationItemInput<DashboardMigrationDashboard>[] =
        Array.from({ length: 600 }, (_, i) => ({
          migration_id: 'migration1',
          original_dashboard: {
            id: `dashboard${i}`,
            vendor: 'splunk',
            title: `Test Dashboard ${i}`,
            description: `Test description ${i}`,
            data: `test data ${i}`,
            format: 'xml',
          },
          elastic_dashboard: {
            id: `elastic_dashboard${i}`,
            title: `Elastic Dashboard ${i}`,
            data: `elastic data ${i}`,
          },
        }));

      await dashboardMigrationsDataDashboardsClient.create(dashboardMigrations);

      expect(esClient.asInternalUser.bulk).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    const migrationId = 'migration1';
    const mockItemsInMigration = (ids: string[]) => {
      (esClient.asInternalUser.search as unknown as jest.Mock).mockResolvedValueOnce({
        hits: { hits: ids.map((id) => ({ _id: id })) },
      });
    };

    test('should update dashboard migrations in bulk', async () => {
      const dashboardMigrations = [
        {
          id: 'doc1',
          status: SiemMigrationStatus.COMPLETED,
          translation_result: MigrationTranslationResult.FULL,
        },
        {
          id: 'doc2',
          status: SiemMigrationStatus.FAILED,
          translation_result: MigrationTranslationResult.UNTRANSLATABLE,
        },
      ];

      mockItemsInMigration(['doc1', 'doc2']);

      await dashboardMigrationsDataDashboardsClient.update(migrationId, dashboardMigrations);

      expect(esClient.asInternalUser.bulk).toHaveBeenCalledWith({
        refresh: 'wait_for',
        operations: [
          { update: { _index: '.kibana-siem-dashboard-migrations', _id: 'doc1' } },
          {
            doc: {
              status: SiemMigrationStatus.COMPLETED,
              translation_result: MigrationTranslationResult.FULL,
              updated_by: 'testProfileUid',
              updated_at: expect.any(String),
            },
          },
          { update: { _index: '.kibana-siem-dashboard-migrations', _id: 'doc2' } },
          {
            doc: {
              status: SiemMigrationStatus.FAILED,
              translation_result: MigrationTranslationResult.UNTRANSLATABLE,
              updated_by: 'testProfileUid',
              updated_at: expect.any(String),
            },
          },
        ],
      });
    });

    test('should throw an error if bulk update fails', async () => {
      const dashboardMigrations = [
        {
          id: 'doc1',
          status: SiemMigrationStatus.COMPLETED,
        },
      ];

      const error = new Error('Bulk update failed');
      esClient.asInternalUser.bulk = jest.fn().mockRejectedValue(error);

      mockItemsInMigration(['doc1']);

      await expect(
        dashboardMigrationsDataDashboardsClient.update(migrationId, dashboardMigrations)
      ).rejects.toThrow('Bulk update failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error updating migration dashboard: Bulk update failed'
      );
    });
  });

  describe('get', () => {
    test('should retrieve dashboard migrations with filters', async () => {
      const migrationId = 'migration1';
      const mockResponse: SearchResponse<DashboardMigrationDashboard> = {
        hits: {
          total: { value: 2 },
          hits: [
            {
              _id: 'doc1',
              _source: {
                migration_id: 'migration1',
                original_dashboard: {
                  id: 'dashboard1',
                  vendor: 'splunk',
                  title: 'Test Dashboard 1',
                  description: 'Test description 1',
                  data: 'test data 1',
                  format: 'xml',
                },
                elastic_dashboard: {
                  id: 'elastic_dashboard1',
                  title: 'Elastic Dashboard 1',
                  data: 'elastic data 1',
                },
                status: SiemMigrationStatus.COMPLETED,
              },
            },
            {
              _id: 'doc2',
              _source: {
                migration_id: 'migration1',
                original_dashboard: {
                  id: 'dashboard2',
                  vendor: 'splunk',
                  title: 'Test Dashboard 2',
                  description: 'Test description 2',
                  data: 'test data 2',
                  format: 'xml',
                },
                elastic_dashboard: {
                  id: 'elastic_dashboard2',
                  title: 'Elastic Dashboard 2',
                  data: 'elastic data 2',
                },
                status: SiemMigrationStatus.PENDING,
              },
            },
          ],
        },
      } as SearchResponse<DashboardMigrationDashboard>;

      esClient.asInternalUser.search = jest.fn().mockResolvedValue(mockResponse);

      const result = await dashboardMigrationsDataDashboardsClient.get(migrationId, {
        filters: { status: SiemMigrationStatus.COMPLETED },
        sort: { sortField: 'elastic_dashboard.title', sortDirection: 'asc' },
        from: 0,
        size: 10,
      });

      expect(result).toEqual({
        total: 2,
        data: [
          {
            id: 'doc1',
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard1',
              vendor: 'splunk',
              title: 'Test Dashboard 1',
              description: 'Test description 1',
              data: 'test data 1',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard1',
              title: 'Elastic Dashboard 1',
              data: 'elastic data 1',
            },
            status: SiemMigrationStatus.COMPLETED,
          },
          {
            id: 'doc2',
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard2',
              vendor: 'splunk',
              title: 'Test Dashboard 2',
              description: 'Test description 2',
              data: 'test data 2',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard2',
              title: 'Elastic Dashboard 2',
              data: 'elastic data 2',
            },
            status: SiemMigrationStatus.PENDING,
          },
        ],
      });
    });

    test('should throw an error if search fails', async () => {
      const migrationId = 'migration1';
      const error = new Error('Search failed');
      esClient.asInternalUser.search = jest.fn().mockRejectedValue(error);

      await expect(dashboardMigrationsDataDashboardsClient.get(migrationId)).rejects.toThrow(
        'Search failed'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error searching migration dashboard: Search failed'
      );
    });
  });

  describe('saveProcessing', () => {
    test('should update dashboard migration status to processing', async () => {
      const id = 'doc1';

      await dashboardMigrationsDataDashboardsClient.saveProcessing(id);

      expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        id: 'doc1',
        doc: {
          status: SiemMigrationStatus.PROCESSING,
          updated_by: 'testProfileUid',
          updated_at: expect.any(String),
        },
        refresh: 'wait_for',
      });
    });
  });

  describe('saveCompleted', () => {
    test('should update dashboard migration status to completed', async () => {
      const dashboardMigration = {
        id: 'doc1',
        migration_id: 'migration1',
        original_dashboard: {
          id: 'dashboard1',
          vendor: 'splunk',
          title: 'Test Dashboard',
          description: 'Test description',
          data: 'test data',
          format: 'xml',
        },
        elastic_dashboard: {
          id: 'elastic_dashboard1',
          title: 'Elastic Dashboard',
          data: 'elastic data',
        },
        status: SiemMigrationStatus.PROCESSING,
        translation_result: MigrationTranslationResult.FULL,
        '@timestamp': '2025-08-04T00:00:00.000Z',
        created_by: 'testProfileUid',
      };

      await dashboardMigrationsDataDashboardsClient.saveCompleted(
        dashboardMigration as StoredDashboardMigrationDashboard
      );

      expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        id: 'doc1',
        doc: {
          migration_id: 'migration1',
          original_dashboard: {
            id: 'dashboard1',
            vendor: 'splunk',
            title: 'Test Dashboard',
            description: 'Test description',
            data: 'test data',
            format: 'xml',
          },
          elastic_dashboard: {
            id: 'elastic_dashboard1',
            title: 'Elastic Dashboard',
            data: 'elastic data',
          },
          status: SiemMigrationStatus.COMPLETED,
          translation_result: MigrationTranslationResult.FULL,
          '@timestamp': '2025-08-04T00:00:00.000Z',
          created_by: 'testProfileUid',
          updated_by: 'testProfileUid',
          updated_at: expect.any(String),
        },
        refresh: 'wait_for',
      });
    });
  });

  describe('saveError', () => {
    test('should update dashboard migration status to failed', async () => {
      const dashboardMigration = {
        id: 'doc1',
        migration_id: 'migration1',
        original_dashboard: {
          id: 'dashboard1',
          vendor: 'splunk',
          title: 'Test Dashboard',
          description: 'Test description',
          data: 'test data',
          format: 'xml',
        },
        elastic_dashboard: {
          id: 'elastic_dashboard1',
          title: 'Elastic Dashboard',
          data: 'elastic data',
        },
        status: SiemMigrationStatus.PROCESSING,
        error: 'Translation failed',
        '@timestamp': '2025-08-04T00:00:00.000Z',
        created_by: 'testProfileUid',
      };

      await dashboardMigrationsDataDashboardsClient.saveError(
        dashboardMigration as StoredDashboardMigrationDashboard
      );

      expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        id: 'doc1',
        doc: {
          migration_id: 'migration1',
          original_dashboard: {
            id: 'dashboard1',
            vendor: 'splunk',
            title: 'Test Dashboard',
            description: 'Test description',
            data: 'test data',
            format: 'xml',
          },
          elastic_dashboard: {
            id: 'elastic_dashboard1',
            title: 'Elastic Dashboard',
            data: 'elastic data',
          },
          status: SiemMigrationStatus.FAILED,
          error: 'Translation failed',
          '@timestamp': '2025-08-04T00:00:00.000Z',
          created_by: 'testProfileUid',
          updated_by: 'testProfileUid',
          updated_at: expect.any(String),
        },
        refresh: 'wait_for',
      });
    });
  });

  describe('releaseProcessing', () => {
    test('should update processing dashboards back to pending', async () => {
      const migrationId = 'migration1';

      await dashboardMigrationsDataDashboardsClient.releaseProcessing(migrationId);

      expect(esClient.asInternalUser.updateByQuery).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        query: {
          bool: {
            filter: [
              { term: { migration_id: 'migration1' } },
              { term: { status: SiemMigrationStatus.PROCESSING } },
            ],
          },
        },
        script: { source: "ctx._source['status'] = 'pending'" },
        refresh: false,
      });
    });
  });

  describe('updateStatus', () => {
    test('should update dashboard migration status with filters', async () => {
      const migrationId = 'migration1';
      const filter = { status: SiemMigrationStatus.PENDING };
      const statusToUpdate = SiemMigrationStatus.PROCESSING;

      await dashboardMigrationsDataDashboardsClient.updateStatus(
        migrationId,
        filter,
        statusToUpdate,
        {
          refresh: true,
        }
      );

      expect(esClient.asInternalUser.updateByQuery).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        query: {
          bool: {
            filter: [
              { term: { migration_id: 'migration1' } },
              { term: { status: SiemMigrationStatus.PENDING } },
            ],
          },
        },
        script: { source: "ctx._source['status'] = 'processing'" },
        refresh: true,
      });
    });

    test('should throw an error if updateByQuery fails', async () => {
      const migrationId = 'migration1';
      const error = new Error('UpdateByQuery failed');
      esClient.asInternalUser.updateByQuery = jest.fn().mockRejectedValue(error);

      await expect(
        dashboardMigrationsDataDashboardsClient.updateStatus(
          migrationId,
          {},
          SiemMigrationStatus.COMPLETED
        )
      ).rejects.toThrow('UpdateByQuery failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error updating migration dashboard status: UpdateByQuery failed'
      );
    });
  });

  describe('getTranslationStats', () => {
    test('should return translation stats', async () => {
      const migrationId = 'migration1';
      const mockResponse = {
        hits: { total: { value: 10 } },
        aggregations: {
          success: {
            doc_count: 8,
            result: {
              buckets: [
                { key: MigrationTranslationResult.FULL, doc_count: 5 },
                { key: MigrationTranslationResult.PARTIAL, doc_count: 2 },
                { key: MigrationTranslationResult.UNTRANSLATABLE, doc_count: 1 },
              ],
            },
            installable: { doc_count: 6 },
          },
          failed: { doc_count: 2 },
        },
      };

      esClient.asInternalUser.search = jest.fn().mockResolvedValue(mockResponse);
      const result = await dashboardMigrationsDataDashboardsClient.getTranslationStats(migrationId);

      // make sure the search is being called with correct query
      expect(esClient.asInternalUser.search).toHaveBeenCalledWith({
        index: '.kibana-siem-dashboard-migrations',
        query: {
          bool: {
            filter: [{ term: { migration_id: 'migration1' } }],
          },
        },
        aggregations: {
          success: {
            filter: { term: { status: SiemMigrationStatus.COMPLETED } },
            aggs: {
              result: { terms: { field: 'translation_result' } },
              installable: {
                filter: {
                  bool: {
                    must: [
                      {
                        terms: {
                          translation_result: [
                            MigrationTranslationResult.FULL,
                            MigrationTranslationResult.PARTIAL,
                          ],
                        },
                      },
                      { bool: { must_not: dsl.isInstalled() } },
                    ],
                  },
                },
              },
            },
          },
          failed: { filter: { term: { status: SiemMigrationStatus.FAILED } } },
        },
        _source: false,
      });

      expect(result).toEqual({
        id: 'migration1',
        dashboards: {
          total: 10,
          success: {
            total: 8,
            result: {
              [MigrationTranslationResult.FULL]: 5,
              [MigrationTranslationResult.PARTIAL]: 2,
              [MigrationTranslationResult.UNTRANSLATABLE]: 1,
            },
            installable: 6,
          },
          failed: 2,
        },
      });
    });

    test('should throw an error if search fails', async () => {
      const migrationId = 'migration1';
      const error = new Error('Search failed');
      esClient.asInternalUser.search = jest.fn().mockRejectedValue(error);

      await expect(
        dashboardMigrationsDataDashboardsClient.getTranslationStats(migrationId)
      ).rejects.toThrow('Search failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting dashboard migrations stats: Search failed'
      );
    });
  });

  describe('getStats', () => {
    test('should return migration stats', async () => {
      const migrationId = 'migration1';
      const mockResponse = {
        hits: { total: { value: 10 } },
        aggregations: {
          status: {
            buckets: [
              { key: SiemMigrationStatus.PENDING, doc_count: 3 },
              { key: SiemMigrationStatus.PROCESSING, doc_count: 2 },
              { key: SiemMigrationStatus.COMPLETED, doc_count: 4 },
              { key: SiemMigrationStatus.FAILED, doc_count: 1 },
            ],
          },
          createdAt: { value_as_string: '2025-01-01T00:00:00.000Z' },
          lastUpdatedAt: { value_as_string: '2025-01-02T00:00:00.000Z' },
        },
      };

      esClient.asInternalUser.search = jest.fn().mockResolvedValue(mockResponse);

      const result = await dashboardMigrationsDataDashboardsClient.getStats(migrationId);

      expect(result).toEqual({
        id: 'migration1',
        items: {
          total: 10,
          [SiemMigrationStatus.PENDING]: 3,
          [SiemMigrationStatus.PROCESSING]: 2,
          [SiemMigrationStatus.COMPLETED]: 4,
          [SiemMigrationStatus.FAILED]: 1,
        },
        created_at: '2025-01-01T00:00:00.000Z',
        last_updated_at: '2025-01-02T00:00:00.000Z',
      });
    });
  });

  describe('getAllStats', () => {
    test('should return all migrations stats', async () => {
      const mockResponse = {
        aggregations: {
          migrationIds: {
            buckets: [
              {
                key: 'migration1',
                doc_count: 5,
                status: {
                  buckets: [
                    { key: SiemMigrationStatus.COMPLETED, doc_count: 3 },
                    { key: SiemMigrationStatus.FAILED, doc_count: 2 },
                  ],
                },
                createdAt: { value_as_string: '2025-08-04T00:00:00.000Z' },
                lastUpdatedAt: { value_as_string: '2025-08-04T00:00:00.000Z' },
              },
            ],
          },
        },
      };

      // return the migration response
      esClient.asInternalUser.search = jest.fn().mockResolvedValueOnce(mockResponse);

      // calls to get vendor for the migration
      jest.spyOn(SiemMigrationsDataItemClient.prototype, 'get').mockResolvedValue({
        total: 1,
        data: [
          {
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard1',
              vendor: 'splunk',
              title: 'Test Dashboard 1',
              description: 'Test description 1',
              data: 'test data 1',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard1',
              title: 'Elastic Dashboard 1',
              data: 'elastic data 1',
            },
          },
        ],
      });

      const result = await dashboardMigrationsDataDashboardsClient.getAllStats();

      expect(result).toEqual([
        {
          id: 'migration1',
          items: {
            total: 5,
            [SiemMigrationStatus.PENDING]: 0,
            [SiemMigrationStatus.PROCESSING]: 0,
            [SiemMigrationStatus.COMPLETED]: 3,
            [SiemMigrationStatus.FAILED]: 2,
          },
          vendor: 'splunk',
          created_at: '2025-08-04T00:00:00.000Z',
          last_updated_at: '2025-08-04T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('prepareDelete', () => {
    test('should prepare bulk delete operations', async () => {
      const migrationId = 'migration1';
      const mockGetResponse = {
        total: 2,
        data: [
          {
            id: 'doc1',
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard1',
              vendor: 'splunk',
              title: 'Test Dashboard 1',
              description: 'Test description 1',
              data: 'test data 1',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard1',
              title: 'Elastic Dashboard 1',
              data: 'elastic data 1',
            },
            status: SiemMigrationStatus.COMPLETED,
            '@timestamp': '2025-08-04T00:00:00.000Z',
            created_by: 'testProfileUid',
          },
          {
            id: 'doc2',
            migration_id: 'migration1',
            original_dashboard: {
              id: 'dashboard2',
              vendor: 'splunk',
              title: 'Test Dashboard 2',
              description: 'Test description 2',
              data: 'test data 2',
              format: 'xml',
            },
            elastic_dashboard: {
              id: 'elastic_dashboard2',
              title: 'Elastic Dashboard 2',
              data: 'elastic data 2',
            },
            status: SiemMigrationStatus.PENDING,
            '@timestamp': '2025-08-04T00:00:00.000Z',
            created_by: 'testProfileUid',
          },
        ] as StoredDashboardMigrationDashboard[],
      };
      jest.spyOn(dashboardMigrationsDataDashboardsClient, 'get').mockResolvedValue(mockGetResponse);

      const result = await dashboardMigrationsDataDashboardsClient.prepareDelete(migrationId);

      expect(result).toEqual([
        { delete: { _id: 'doc1', _index: '.kibana-siem-dashboard-migrations' } },
        { delete: { _id: 'doc2', _index: '.kibana-siem-dashboard-migrations' } },
      ]);
    });
  });

  describe('private methods', () => {
    describe('getFilterQuery', () => {
      const migrationId = 'migration1';
      const getFilterQuery = (filters: DashboardMigrationFilters) => {
        return (
          dashboardMigrationsDataDashboardsClient as unknown as { getFilterQuery: Function }
        ).getFilterQuery(migrationId, filters);
      };

      test('should build filter query with no filters', () => {
        const result = getFilterQuery({});
        expect(result).toEqual({ bool: { filter: [{ term: { migration_id: migrationId } }] } });
      });

      test('should build filter query with ids filter', () => {
        const result = getFilterQuery({ ids: ['doc1', 'doc2'] });
        expect(result.bool.filter[1]).toEqual({ terms: { _id: ['doc1', 'doc2'] } });
      });

      test('should build filter query with searchTerm filter', () => {
        const result = getFilterQuery({ searchTerm: 'test' });
        expect(result).toEqual({
          bool: {
            filter: [
              { term: { migration_id: 'migration1' } },
              {
                bool: {
                  should: [
                    { match: { 'elastic_dashboard.title': { query: 'test', operator: 'and' } } },
                    {
                      bool: {
                        must: [
                          { term: { status: 'failed' } },
                          {
                            match: {
                              'original_dashboard.title': { query: 'test', operator: 'and' },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        });
      });

      test('should build filter query with multiple statuses', () => {
        const filters = { status: [SiemMigrationStatus.COMPLETED, SiemMigrationStatus.FAILED] };
        const result = getFilterQuery(filters);

        expect(result.bool.filter[1]).toEqual({
          terms: { status: [SiemMigrationStatus.COMPLETED, SiemMigrationStatus.FAILED] },
        });
      });

      test('should build filter query with single status', () => {
        const result = getFilterQuery({ status: SiemMigrationStatus.COMPLETED });

        expect(result.bool.filter[1]).toEqual({ term: { status: SiemMigrationStatus.COMPLETED } });
      });

      test('should build filter query with installed filter', () => {
        const result = getFilterQuery({ installed: true });
        expect(result.bool.filter[1]).toEqual({ exists: { field: 'elastic_dashboard.id' } });
      });

      test('should build filter query with not installed filter', () => {
        const result = getFilterQuery({ installed: false });
        expect(result.bool.filter[1]).toEqual({
          bool: { must_not: { exists: { field: 'elastic_dashboard.id' } } },
        });
      });

      test('should build filter query with installable filter', () => {
        const result = getFilterQuery({ installable: true });
        expect(result.bool.filter[1]).toEqual({
          bool: {
            must: [
              {
                terms: {
                  translation_result: [
                    MigrationTranslationResult.FULL,
                    MigrationTranslationResult.PARTIAL,
                  ],
                },
              },
              { bool: { must_not: { exists: { field: 'elastic_dashboard.id' } } } },
            ],
          },
        });
      });

      test('should build filter query with not installable filter', () => {
        const result = getFilterQuery({ installable: false });
        expect(result.bool.filter[1]).toEqual({
          bool: {
            should: [
              {
                bool: {
                  must_not: {
                    terms: {
                      translation_result: [
                        MigrationTranslationResult.FULL,
                        MigrationTranslationResult.PARTIAL,
                      ],
                    },
                  },
                },
              },
              { exists: { field: 'elastic_dashboard.id' } },
            ],
          },
        });
      });

      test('should build filter query with failed filter', () => {
        const result = getFilterQuery({ failed: true });
        expect(result.bool.filter[1]).toEqual({ term: { status: SiemMigrationStatus.FAILED } });
      });

      test('should build filter query with not failed filter', () => {
        const result = getFilterQuery({ failed: false });
        expect(result.bool.filter[1]).toEqual({
          bool: { must_not: { term: { status: SiemMigrationStatus.FAILED } } },
        });
      });

      test('should build filter query with fullyTranslated filter', () => {
        const result = getFilterQuery({ fullyTranslated: true });
        expect(result.bool.filter[1]).toEqual({
          term: { translation_result: MigrationTranslationResult.FULL },
        });
      });

      test('should build filter query with not fullyTranslated filter', () => {
        const result = getFilterQuery({ fullyTranslated: false });
        expect(result.bool.filter[1]).toEqual({
          bool: {
            must_not: { term: { translation_result: MigrationTranslationResult.FULL } },
          },
        });
      });

      test('should build filter query with partiallyTranslated filter', () => {
        const result = getFilterQuery({ partiallyTranslated: true });
        expect(result.bool.filter[1]).toEqual({
          term: { translation_result: MigrationTranslationResult.PARTIAL },
        });
      });

      test('should build filter query with not partiallyTranslated filter', () => {
        const result = getFilterQuery({ partiallyTranslated: false });
        expect(result.bool.filter[1]).toEqual({
          bool: {
            must_not: { term: { translation_result: MigrationTranslationResult.PARTIAL } },
          },
        });
      });

      test('should build filter query with untranslatable filter', () => {
        const result = getFilterQuery({ untranslatable: true });
        expect(result.bool.filter[1]).toEqual({
          term: { translation_result: MigrationTranslationResult.UNTRANSLATABLE },
        });
      });

      test('should build filter query with not untranslatable filter', () => {
        const result = getFilterQuery({ untranslatable: false });
        expect(result.bool.filter[1]).toEqual({
          bool: {
            must_not: {
              term: { translation_result: MigrationTranslationResult.UNTRANSLATABLE },
            },
          },
        });
      });

      test('should build filter query with multiple conditions', () => {
        const filters = {
          ids: ['doc1', 'doc2'],
          searchTerm: 'test',
          installed: true,
          installable: true,
          failed: false,
          fullyTranslated: true,
          partiallyTranslated: false,
          untranslatable: false,
        };

        // @ts-expect-error protected function
        const result = dashboardMigrationsDataDashboardsClient.getFilterQuery(migrationId, filters);

        expect(result).toEqual({
          bool: {
            filter: [
              { term: { migration_id: 'migration1' } },
              { terms: { _id: ['doc1', 'doc2'] } },
              { bool: { must_not: { term: { status: 'failed' } } } },
              { term: { translation_result: 'full' } },
              { bool: { must_not: { term: { translation_result: 'partial' } } } },
              { bool: { must_not: { term: { translation_result: 'untranslatable' } } } },
              {
                bool: {
                  should: [
                    { match: { 'elastic_dashboard.title': { query: 'test', operator: 'and' } } },
                    {
                      bool: {
                        must: [
                          { term: { status: 'failed' } },
                          {
                            match: {
                              'original_dashboard.title': { query: 'test', operator: 'and' },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              { exists: { field: 'elastic_dashboard.id' } },
              {
                bool: {
                  must: [
                    { terms: { translation_result: ['full', 'partial'] } },
                    { bool: { must_not: { exists: { field: 'elastic_dashboard.id' } } } },
                  ],
                },
              },
            ],
          },
        });
      });
    });

    describe('statusAggCounts', () => {
      test('should count status aggregations correctly', () => {
        const statusAgg = {
          buckets: [
            { key: SiemMigrationStatus.PENDING, doc_count: 5 },
            { key: SiemMigrationStatus.PROCESSING, doc_count: 3 },
            { key: SiemMigrationStatus.COMPLETED, doc_count: 10 },
            { key: SiemMigrationStatus.FAILED, doc_count: 2 },
          ],
        };

        const result = (
          dashboardMigrationsDataDashboardsClient as unknown as { statusAggCounts: Function }
        ).statusAggCounts(statusAgg);

        expect(result).toEqual({
          [SiemMigrationStatus.PENDING]: 5,
          [SiemMigrationStatus.PROCESSING]: 3,
          [SiemMigrationStatus.COMPLETED]: 10,
          [SiemMigrationStatus.FAILED]: 2,
        });
      });

      test('should handle missing status buckets', () => {
        const statusAgg = {
          buckets: [{ key: SiemMigrationStatus.COMPLETED, doc_count: 10 }],
        };

        const result = (
          dashboardMigrationsDataDashboardsClient as unknown as { statusAggCounts: Function }
        ).statusAggCounts(statusAgg);

        expect(result).toEqual({
          [SiemMigrationStatus.PENDING]: 0,
          [SiemMigrationStatus.PROCESSING]: 0,
          [SiemMigrationStatus.COMPLETED]: 10,
          [SiemMigrationStatus.FAILED]: 0,
        });
      });
    });

    describe('translationResultAggCount', () => {
      test('should count translation result aggregations correctly', () => {
        const resultAgg = {
          buckets: [
            { key: MigrationTranslationResult.FULL, doc_count: 8 },
            { key: MigrationTranslationResult.PARTIAL, doc_count: 2 },
            { key: MigrationTranslationResult.UNTRANSLATABLE, doc_count: 1 },
          ],
        };

        const result = (
          dashboardMigrationsDataDashboardsClient as unknown as {
            translationResultAggCount: Function;
          }
        ).translationResultAggCount(resultAgg);

        expect(result).toEqual({
          [MigrationTranslationResult.FULL]: 8,
          [MigrationTranslationResult.PARTIAL]: 2,
          [MigrationTranslationResult.UNTRANSLATABLE]: 1,
        });
      });

      test('should handle missing translation result buckets', () => {
        const resultAgg = {
          buckets: [{ key: MigrationTranslationResult.FULL, doc_count: 5 }],
        };

        const result = (
          dashboardMigrationsDataDashboardsClient as unknown as {
            translationResultAggCount: Function;
          }
        ).translationResultAggCount(resultAgg);

        expect(result).toEqual({
          [MigrationTranslationResult.FULL]: 5,
          [MigrationTranslationResult.PARTIAL]: 0,
          [MigrationTranslationResult.UNTRANSLATABLE]: 0,
        });
      });
    });
  });
});
