/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { transformError } from '@kbn/securitysolution-es-utils';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import type { AttackDiscoveryGeneration } from '@kbn/elastic-assistant-common/impl/schemas/attack_discovery/generation.gen';

import { getGeneration } from '.';
import type { AttackDiscoveryDataClient } from '../../../../../../lib/attack_discovery/persistence';

jest.mock('@kbn/securitysolution-es-utils');

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

describe('getGeneration', () => {
  const mockLogger = loggingSystemMock.createLogger();
  const mockDataClient = {
    getAttackDiscoveryGenerationById: jest.fn(),
  } as unknown as jest.Mocked<AttackDiscoveryDataClient>;

  const mockAuthenticatedUser = {
    username: 'test-user',
    roles: ['test-role'],
    profile_uid: 'test-uid',
    authentication_realm: { name: 'realm', type: 'type' },
    lookup_realm: { name: 'realm', type: 'type' },
    authentication_provider: { name: 'provider', type: 'type' },
    authentication_type: 'type',
    elastic_cloud_user: false,
    enabled: true,
    http_authentication_scheme: null,
  } as AuthenticatedUser;

  const mockGeneration: AttackDiscoveryGeneration = {
    alerts_context_count: 10,
    connector_id: 'test-connector',
    discoveries: 5,
    end: '2023-01-01T00:10:00Z',
    execution_uuid: 'test-uuid',
    loading_message: 'Test message',
    start: '2023-01-01T00:00:00Z',
    status: 'succeeded',
  };

  const baseParams = {
    dataClient: mockDataClient,
    authenticatedUser: mockAuthenticatedUser,
    eventLogIndex: '.kibana-event-log-8.19.0-000001',
    executionUuid: 'test-execution-uuid',
    logger: mockLogger,
    spaceId: 'default',
    data: [
      {
        alert_ids: ['alert-id-1', 'alert-id-2'],
        connector_id: 'test-connector',
        connector_name: 'Test Connector',
        details_markdown: 'Test details',
        generation_uuid: 'test-uuid',
        id: 'alert-1',
        summary_markdown: 'Test summary',
        timestamp: '2023-01-01T00:05:00Z',
        title: 'Test Alert',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (transformError as jest.Mock).mockImplementation((error) => ({
      statusCode: error.statusCode || 500,
      message: error.message || 'Unknown error',
    }));
  });

  describe('successful retrieval', () => {
    it('should return generation when data client succeeds', async () => {
      mockDataClient.getAttackDiscoveryGenerationById.mockResolvedValueOnce(mockGeneration);

      const result = await getGeneration(baseParams);

      expect(result).toEqual(mockGeneration);
      expect(mockDataClient.getAttackDiscoveryGenerationById).toHaveBeenCalledWith({
        authenticatedUser: mockAuthenticatedUser,
        eventLogIndex: '.kibana-event-log-8.19.0-000001',
        executionUuid: 'test-execution-uuid',
        logger: mockLogger,
        spaceId: 'default',
      });
    });
  });

  describe('404 error handling', () => {
    it('should return undefined when generation not found (404) but data exists', async () => {
      const error404: ErrorWithStatusCode = new Error('Not found');
      error404.statusCode = 404;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error404);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 404,
        message: 'Not found',
      });

      const result = await getGeneration(baseParams);

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(Function));

      // Test the debug function
      const debugCall = mockLogger.debug.mock.calls[0][0] as () => string;
      expect(debugCall()).toBe(
        'Generation metadata not found for execution_uuid test-execution-uuid, but returning 1 discovery alerts'
      );
    });

    it('should throw error when generation not found (404) and no data exists', async () => {
      const error404: ErrorWithStatusCode = new Error('Not found');
      error404.statusCode = 404;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error404);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 404,
        message: 'Not found',
      });

      const paramsWithoutData = { ...baseParams, data: [] };

      await expect(getGeneration(paramsWithoutData)).rejects.toThrow('Not found');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('other error handling', () => {
    it('should throw error for non-404 errors', async () => {
      const error500: ErrorWithStatusCode = new Error('Internal server error');
      error500.statusCode = 500;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error500);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 500,
        message: 'Internal server error',
      });

      await expect(getGeneration(baseParams)).rejects.toThrow('Internal server error');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should throw error for 403 errors even with data', async () => {
      const error403: ErrorWithStatusCode = new Error('Forbidden');
      error403.statusCode = 403;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error403);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 403,
        message: 'Forbidden',
      });

      await expect(getGeneration(baseParams)).rejects.toThrow('Forbidden');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle errors without status codes', async () => {
      const genericError = new Error('Generic error');
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(genericError);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 500,
        message: 'Generic error',
      });

      await expect(getGeneration(baseParams)).rejects.toThrow('Generic error');
    });
  });

  describe('edge cases', () => {
    it('should handle empty data array correctly for 404 errors', async () => {
      const error404: ErrorWithStatusCode = new Error('Not found');
      error404.statusCode = 404;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error404);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 404,
        message: 'Not found',
      });

      const paramsWithEmptyData = { ...baseParams, data: [] };

      await expect(getGeneration(paramsWithEmptyData)).rejects.toThrow('Not found');
    });

    it('should handle multiple data items correctly in debug message', async () => {
      const error404: ErrorWithStatusCode = new Error('Not found');
      error404.statusCode = 404;
      mockDataClient.getAttackDiscoveryGenerationById.mockRejectedValueOnce(error404);

      (transformError as jest.Mock).mockReturnValueOnce({
        statusCode: 404,
        message: 'Not found',
      });

      const paramsWithMultipleData = {
        ...baseParams,
        data: [baseParams.data[0], { ...baseParams.data[0], id: 'alert-2' }],
      };

      const result = await getGeneration(paramsWithMultipleData);

      expect(result).toBeUndefined();
      const debugCall = mockLogger.debug.mock.calls[0][0] as () => string;
      expect(debugCall()).toBe(
        'Generation metadata not found for execution_uuid test-execution-uuid, but returning 2 discovery alerts'
      );
    });
  });
});
