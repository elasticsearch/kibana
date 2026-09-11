/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { withExistingMigration } from './with_existing_migration_id';

const mockRuleMigrationsClient = {
  data: {
    migrations: {
      get: jest.fn(),
    },
  },
};

const mockDashboardMigrationsClient = {
  data: {
    migrations: {
      get: jest.fn(),
    },
  },
};

const mockSecuritySolutionContext = {
  securitySolution: {
    siemMigrations: {
      getRulesClient: jest.fn().mockReturnValue(mockRuleMigrationsClient),
      getDashboardsClient: jest.fn().mockReturnValue(mockDashboardMigrationsClient),
    },
  },
};

const mockContext = {
  loadPluginContract: jest.fn(),
  resolve: jest.fn().mockResolvedValue(mockSecuritySolutionContext),
} as unknown as SecuritySolutionRequestHandlerContext;

const mockMigration = {
  id: 'test-migration-id',
  created_at: '2023-10-01T00:00:00Z',
  created_by: 'test-user',
};

const mockReq = {
  params: {
    migration_id: 'test-migration-id',
  },
  route: {
    path: '/internal/siem_migrations/rules/test-migration-id',
  },
} as unknown as KibanaRequest<{ migration_id: string }, unknown, unknown, never>;

const mockRes = {
  notFound: jest.fn(),
} as unknown as KibanaResponseFactory;

describe('withExistingMigrationId', () => {
  describe('when migration exists', () => {
    beforeEach(() => {
      mockRuleMigrationsClient.data.migrations.get.mockResolvedValue(mockMigration);
    });
    it('should call the handler', async () => {
      const handler = jest.fn();
      const wrappedHandler = withExistingMigration(handler);
      await wrappedHandler(mockContext, mockReq, mockRes);

      expect(handler).toHaveBeenCalledWith(mockContext, mockReq, mockRes);
    });
  });

  describe('when migration does not exist', () => {
    beforeEach(() => {
      mockRuleMigrationsClient.data.migrations.get.mockResolvedValue(undefined);
    });
    it('should return a 404 response', async () => {
      const handler = jest.fn();
      const wrappedHandler = withExistingMigration(handler);
      await wrappedHandler(mockContext, mockReq, mockRes);

      expect(mockRes.notFound).toHaveBeenCalledWith({
        body: expect.stringContaining('No Migration found with id: test-migration-id'),
      });
    });
  });
});
