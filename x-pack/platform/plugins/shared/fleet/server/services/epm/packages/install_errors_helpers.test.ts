/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';

import type { Logger } from '@kbn/core/server';

import type { InstallFailedAttempt } from '../../../types';

import { getInstallationObject } from './get';

import {
  clearLatestFailedAttempts,
  addErrorToLatestFailedAttempts,
  createOrUpdateFailedInstallStatus,
} from './install_errors_helpers';

const generateFailedAttempt = (version: string) => ({
  target_version: version,
  created_at: new Date().toISOString(),
  error: {
    name: 'test',
    message: 'test',
  },
});
let mockedLogger: jest.Mocked<Logger>;

jest.mock('../../audit_logging');
jest.mock('./get', () => {
  return { getInstallationObject: jest.fn() };
});

const getInstallationObjectMock = getInstallationObject as jest.MockedFunction<
  typeof getInstallationObject
>;

const mapFailedAttempsToTargetVersion = (attemps: InstallFailedAttempt[]) =>
  attemps.map((attempt) => attempt.target_version);

describe('Install error helpers', () => {
  describe('clearLatestFailedAttempts', () => {
    const previousFailedAttemps: InstallFailedAttempt[] = [
      generateFailedAttempt('0.1.0'),
      generateFailedAttempt('0.2.0'),
    ];
    it('should clear previous error on successful upgrade', () => {
      const currentFailedAttemps = clearLatestFailedAttempts('0.2.0', previousFailedAttemps);

      expect(mapFailedAttempsToTargetVersion(currentFailedAttemps)).toEqual([]);
    });

    it('should not clear previous upgrade error on successful rollback', () => {
      const currentFailedAttempts = clearLatestFailedAttempts('0.1.0', previousFailedAttemps);

      expect(mapFailedAttempsToTargetVersion(currentFailedAttempts)).toEqual(['0.2.0']);
    });
  });

  describe('addErrorToLatestFailedAttempts', () => {
    it('should only keep 5 errors', () => {
      const previousFailedAttemps: InstallFailedAttempt[] = [
        generateFailedAttempt('0.2.5'),
        generateFailedAttempt('0.2.4'),
        generateFailedAttempt('0.2.3'),
        generateFailedAttempt('0.2.2'),
        generateFailedAttempt('0.2.1'),
      ];
      const currentFailedAttempts = addErrorToLatestFailedAttempts({
        targetVersion: '0.2.6',
        createdAt: new Date().toISOString(),
        error: new Error('new test'),
        latestAttempts: previousFailedAttemps,
      });

      expect(mapFailedAttempsToTargetVersion(currentFailedAttempts)).toEqual([
        '0.2.6',
        '0.2.5',
        '0.2.4',
        '0.2.3',
        '0.2.2',
      ]);
    });

    it('should attach missing_assets when provided', () => {
      const missingAssets = [
        { id: 'my-pipeline', type: 'ingest_pipeline' },
        { id: 'my-template', type: 'index_template' },
      ];
      const attempts = addErrorToLatestFailedAttempts({
        targetVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        error: new Error('verification failed'),
        missingAssets,
      });

      expect(attempts[0].missing_assets).toEqual(missingAssets);
    });

    it('should not set missing_assets when the list is empty', () => {
      const attempts = addErrorToLatestFailedAttempts({
        targetVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        error: new Error('some error'),
        missingAssets: [],
      });

      expect(attempts[0].missing_assets).toBeUndefined();
    });

    it('should not set missing_assets when not provided', () => {
      const attempts = addErrorToLatestFailedAttempts({
        targetVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        error: new Error('some error'),
      });

      expect(attempts[0].missing_assets).toBeUndefined();
    });
  });

  describe('createOrUpdateFailedInstallStatus', () => {
    const soClientMock = savedObjectsClientMock.create();
    mockedLogger = loggerMock.create();

    it('should create installation object with latest_install_failed_attempts if none was found', async () => {
      getInstallationObjectMock.mockResolvedValue(undefined);

      await createOrUpdateFailedInstallStatus({
        logger: mockedLogger,
        savedObjectsClient: soClientMock,
        pkgName: 'test-package',
        pkgVersion: '0.1.0',
        error: new Error('test error'),
        installSource: 'registry',
      });
      expect(soClientMock.create).toHaveBeenCalledWith(
        'epm-packages',
        {
          es_index_patterns: {},
          install_source: 'registry',
          install_started_at: expect.any(String),
          install_status: 'install_failed',
          install_version: '0.1.0',
          installed_es: [],
          installed_kibana: [],
          name: 'test-package',
          package_assets: [],
          verification_status: 'unknown',
          version: '0.1.0',
          latest_install_failed_attempts: [
            {
              created_at: expect.any(String),
              target_version: '0.1.0',
              error: {
                message: 'test error',
                name: 'Error',
                stack: expect.any(String),
              },
            },
          ],
        },
        { id: 'test-package', overwrite: true }
      );
    });

    it('should update latest_install_failed_attempts in the installation object if it exists', async () => {
      getInstallationObjectMock.mockResolvedValue({
        es_index_patterns: {},
        install_source: 'registry',
        install_started_at: '2025-06-11T07:15:06.838Z',
        install_status: 'install_failed',
        install_version: '0.1.0',
        installed_es: [],
        installed_kibana: [],
        name: 'test-package',
        package_assets: [],
        verification_status: 'unknown',
        version: '0.1.0',
        latest_install_failed_attempts: [
          {
            created_at: '2025-06-11T07:15:06.838Z',
            target_version: '0.1.0',
            error: {
              message: 'test error',
              name: 'Error',
              stack: 'test error - stacktrace',
            },
          },
        ],
      } as any);

      await createOrUpdateFailedInstallStatus({
        logger: mockedLogger,
        savedObjectsClient: soClientMock,
        pkgName: 'test-package',
        pkgVersion: '0.1.0',
        error: new Error('test error'),
        installSource: 'registry',
      });
      expect(soClientMock.update).toHaveBeenCalledWith('epm-packages', 'test-package', {
        latest_install_failed_attempts: [
          {
            created_at: expect.any(String),
            target_version: '0.1.0',
            error: {
              message: 'test error',
              name: 'Error',
              stack: expect.any(String),
            },
          },
        ],
      });
    });
  });
});
