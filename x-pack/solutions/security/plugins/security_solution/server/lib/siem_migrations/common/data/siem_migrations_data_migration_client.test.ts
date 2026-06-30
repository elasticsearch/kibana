/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import { SiemMigrationsDataMigrationClient } from './siem_migrations_data_migration_client';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { AuthenticatedUser } from '@kbn/security-plugin-types-common';
import type { Client } from '@elastic/elasticsearch';

type IndexApi = Client['create'];
type GetApi = Client['get'];
type SearchApi = Client['search'];
import type { SiemMigrationsClientDependencies } from '../types';

describe('SiemMigrationsDataMigrationClient', () => {
  let siemMigrationsDataMigrationClient: SiemMigrationsDataMigrationClient;
  const esClient =
    elasticsearchServiceMock.createCustomClusterClient() as unknown as IScopedClusterClient;

  const logger = loggingSystemMock.createLogger();
  const indexNameProvider = jest.fn().mockReturnValue('.kibana-siem-rule-migrations');
  const currentUser = {
    userName: 'testUser',
    profile_uid: 'testProfileUid',
  } as unknown as AuthenticatedUser;
  const dependencies = {} as unknown as SiemMigrationsClientDependencies;

  beforeEach(() => {
    siemMigrationsDataMigrationClient = new SiemMigrationsDataMigrationClient(
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
    test('should create a new migration', async () => {
      const index = '.kibana-siem-rule-migrations';
      const name = 'test name';

      const result = await siemMigrationsDataMigrationClient.create(name);

      expect(result).not.toBeFalsy();
      expect(esClient.asInternalUser.create).toHaveBeenCalledWith({
        refresh: 'wait_for',
        id: result,
        index,
        document: {
          created_by: currentUser.profile_uid,
          created_at: expect.any(String),
          name,
        },
      });
    });

    test('should throw an error if an error occurs', async () => {
      (esClient.asInternalUser.create as unknown as jest.MockedFn<IndexApi>).mockRejectedValueOnce(
        new Error('Test error')
      );

      await expect(siemMigrationsDataMigrationClient.create('test')).rejects.toThrow('Test error');

      expect(esClient.asInternalUser.create).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    test('should get a migration', async () => {
      const index = '.kibana-siem-rule-migrations';
      const id = 'testId';
      const response = {
        _index: index,
        found: true,
        _source: {
          created_by: currentUser.profile_uid,
          created_at: new Date().toISOString(),
        },
        _id: id,
      };

      (esClient.asInternalUser.get as unknown as jest.MockedFn<GetApi>).mockResolvedValueOnce(
        response
      );

      const result = await siemMigrationsDataMigrationClient.get(id);

      expect(result).toEqual({
        ...response._source,
        id: response._id,
      });
    });

    test('should return undefined if the migration is not found', async () => {
      const id = 'testId';
      const response = {
        _index: '.kibana-siem-rule-migrations',
        found: false,
      };

      (esClient.asInternalUser.get as unknown as jest.MockedFn<GetApi>).mockRejectedValueOnce({
        message: JSON.stringify(response),
      });

      const result = await siemMigrationsDataMigrationClient.get(id);

      expect(result).toBeUndefined();
    });

    test('should throw an error if an error occurs', async () => {
      const id = 'testId';
      (esClient.asInternalUser.get as unknown as jest.MockedFn<GetApi>).mockRejectedValueOnce(
        new Error('Test error')
      );

      await expect(siemMigrationsDataMigrationClient.get(id)).rejects.toThrow('Test error');

      expect(esClient.asInternalUser.get).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(`Error getting migration ${id}: Error: Test error`);
    });
  });

  describe('prepareDelete', () => {
    beforeEach(() => jest.clearAllMocks());

    it('should delete the migration and associated rules and resources', async () => {
      const migrationId = 'testId';
      const index = '.kibana-siem-rule-migrations';

      const operations = await siemMigrationsDataMigrationClient.prepareDelete(migrationId);

      expect(operations).toMatchObject([
        {
          delete: {
            _index: index,
            _id: migrationId,
          },
        },
      ]);
    });
  });

  describe('getAll', () => {
    it('should return all migrations', async () => {
      const response = {
        hits: {
          hits: [
            {
              _index: '.kibana-siem-rule-migrations',
              _id: '1',
              _source: {
                created_by: currentUser.profile_uid,
                created_at: new Date().toISOString(),
              },
            },
            {
              _index: '.kibana-siem-rule-migrations',
              _id: '2',
              _source: {
                created_by: currentUser.profile_uid,
                created_at: new Date().toISOString(),
              },
            },
          ],
        },
      } as unknown as ReturnType<typeof esClient.asInternalUser.search>;

      (esClient.asInternalUser.search as unknown as jest.MockedFn<SearchApi>).mockResolvedValueOnce(
        response
      );

      await siemMigrationsDataMigrationClient.getAll();
      expect(esClient.asInternalUser.search).toHaveBeenCalledWith({
        index: '.kibana-siem-rule-migrations',
        size: 10000,
        query: {
          match_all: {},
        },
        _source: true,
      });
    });
  });

  describe('updateLastExecution', () => {
    const connectorId = 'testConnector';
    it('should update `started_at` & `connector_id` when called saveAsStarted', async () => {
      const migrationId = 'testId';

      await siemMigrationsDataMigrationClient.saveAsStarted({ id: migrationId, connectorId });

      expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
        index: '.kibana-siem-rule-migrations',
        id: migrationId,
        refresh: 'wait_for',
        doc: {
          last_execution: {
            started_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            is_stopped: false,
            error: null,
            finished_at: null,
            connector_id: connectorId,
          },
        },
        retry_on_conflict: 1,
      });
    });

    describe('saveAsFinished', () => {
      it('should update `finished_at` and `total_execution_time_ms` when called saveAsEnded', async () => {
        const migrationId = 'testId';
        const mockStartedAt = new Date(Date.now() - 5000).toISOString();

        esClient.asInternalUser.get = jest.fn().mockResolvedValue({
          _index: '.kibana-siem-rule-migrations',
          found: true,
          _source: {
            name: 'Test Migration',
            last_execution: {
              started_at: mockStartedAt,
            },
          },
          _id: migrationId,
        });

        await siemMigrationsDataMigrationClient.saveAsFinished({ id: migrationId });

        expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
          index: '.kibana-siem-rule-migrations',
          id: migrationId,
          refresh: 'wait_for',
          doc: {
            last_execution: {
              finished_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
              total_execution_time_ms: expect.any(Number),
            },
          },
          retry_on_conflict: 1,
        });

        // Now, assert that total_execution_time_ms is greater than 5000
        const callArgs = (esClient.asInternalUser.update as jest.Mock).mock.calls[0][0].doc
          .last_execution;
        expect(callArgs.total_execution_time_ms).toBeGreaterThanOrEqual(5000);
      });

      it('should update `total_execution_time_ms` when it is already present', async () => {
        const migrationId = 'testId';
        const mockStartedAt = new Date(Date.now() - 5000).toISOString();
        const existingExecutionTime = 10000;

        esClient.asInternalUser.get = jest.fn().mockResolvedValue({
          _index: '.kibana-siem-rule-migrations',
          found: true,
          _source: {
            name: 'Test Migration',
            last_execution: {
              started_at: mockStartedAt,
              total_execution_time_ms: existingExecutionTime,
            },
          },
          _id: migrationId,
        });

        await siemMigrationsDataMigrationClient.saveAsFinished({ id: migrationId });

        expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
          index: '.kibana-siem-rule-migrations',
          id: migrationId,
          refresh: 'wait_for',
          doc: {
            last_execution: {
              finished_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
              total_execution_time_ms: expect.any(Number),
            },
          },
          retry_on_conflict: 1,
        });

        // Now, assert that total_execution_time_ms is greater than existingExecutionTime
        const callArgs = (esClient.asInternalUser.update as jest.Mock).mock.calls[0][0].doc
          .last_execution;
        expect(callArgs.total_execution_time_ms).toBeGreaterThanOrEqual(15000);
      });
    });

    it('should update `is_stopped` correctly when called setIsStopped', async () => {
      const migrationId = 'testId';

      await siemMigrationsDataMigrationClient.setIsStopped({ id: migrationId });

      expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
        index: '.kibana-siem-rule-migrations',
        id: migrationId,
        refresh: 'wait_for',
        doc: {
          last_execution: {
            is_stopped: true,
          },
        },
        retry_on_conflict: 1,
      });
    });

    describe('error handling', () => {
      it('should update `error` params correctly when called saveAsFailed', async () => {
        const migrationId = 'testId';

        esClient.asInternalUser.get = jest.fn().mockResolvedValue({
          _index: '.kibana-siem-rule-migrations',
          found: true,
          _source: {
            name: 'Test Migration',
            last_execution: {
              started_at: new Date().toISOString(),
            },
          },
          _id: migrationId,
        });

        await siemMigrationsDataMigrationClient.saveAsFailed({
          id: migrationId,
          error: 'Test error',
        });

        expect(esClient.asInternalUser.update).toHaveBeenCalledWith({
          index: '.kibana-siem-rule-migrations',
          id: migrationId,
          refresh: 'wait_for',
          doc: {
            last_execution: {
              error: 'Test error',
              finished_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
              total_execution_time_ms: expect.any(Number),
            },
          },
          retry_on_conflict: 1,
        });
      });
    });
  });
});
