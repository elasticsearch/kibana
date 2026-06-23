/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { ConnectorWithExtraFindData } from '@kbn/actions-plugin/server/application/connector/types';
import { ConnectorExecutor } from './connector_executor';

describe('ConnectorExecutor', () => {
  let mockActionsClient: jest.Mocked<ActionsClient>;
  let connectorExecutor: ConnectorExecutor;

  beforeEach(() => {
    mockActionsClient = {
      execute: jest.fn(),
      getAll: jest.fn(() =>
        Promise.resolve([
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'test-connector',
            actionTypeId: 'http',
          },
        ] as ConnectorWithExtraFindData[])
      ),
      get: jest.fn().mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test-connector',
        actionTypeId: 'http',
      } as ConnectorWithExtraFindData),
    } as unknown as jest.Mocked<ActionsClient>;

    connectorExecutor = new ConnectorExecutor(mockActionsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    const connectorType = 'http';
    const connectorName = 'test-connector';
    const input = { url: 'https://example.com', method: 'GET' };
    const abortController = new AbortController();

    it('should throw error if connector type is missing', async () => {
      await expect(
        connectorExecutor.execute({
          connectorType: '',
          connectorNameOrId: connectorName,
          input,
          abortController,
        })
      ).rejects.toThrow('Connector type is required');
    });

    it('should execute connector with UUID connector ID', async () => {
      const connectorId = '123e4567-e89b-12d3-a456-426614174000';
      const expectedResult: ActionTypeExecutorResult<unknown> = {
        status: 'ok',
        actionId: connectorId,
        data: { status: 200 },
      };

      mockActionsClient.execute.mockResolvedValue(expectedResult);

      const result = await connectorExecutor.execute({
        connectorType,
        connectorNameOrId: connectorId,
        input,
        abortController,
      });

      expect(mockActionsClient.execute).toHaveBeenCalledWith({
        actionId: connectorId,
        params: input,
        signal: abortController.signal,
      });
      expect(result).toEqual(expectedResult);
    });

    it('should resolve connector ID by name and execute', async () => {
      const connectorId = 'resolved-connector-id';
      const name = 'my-connector';
      const expectedResult: ActionTypeExecutorResult<unknown> = {
        status: 'ok',
        actionId: connectorId,
        data: { status: 200 },
      };

      const mockConnectors: ConnectorWithExtraFindData[] = [
        {
          id: connectorId,
          name,
          actionTypeId: connectorType,
        } as ConnectorWithExtraFindData,
      ];

      mockActionsClient.getAll.mockResolvedValue(mockConnectors);
      mockActionsClient.get.mockRejectedValue(new Error('Connector not found'));
      mockActionsClient.execute.mockResolvedValue(expectedResult);

      const result = await connectorExecutor.execute({
        connectorType,
        connectorNameOrId: name,
        input,
        abortController,
      });

      expect(mockActionsClient.get).toHaveBeenCalledWith({ id: name });
      expect(mockActionsClient.getAll).toHaveBeenCalled();
      expect(mockActionsClient.execute).toHaveBeenCalledWith({
        actionId: connectorId,
        params: input,
        signal: abortController.signal,
      });
      expect(result).toEqual(expectedResult);
    });

    it('should throw error if connector not found by name', async () => {
      mockActionsClient.getAll.mockResolvedValue([]);
      mockActionsClient.get.mockRejectedValue(new Error('Connector not found'));

      await expect(
        connectorExecutor.execute({
          connectorType,
          connectorNameOrId: 'non-existent',
          input,
          abortController,
        })
      ).rejects.toThrow('Connector non-existent not found');
    });

    it('should pass abort signal to actions client', async () => {
      const connectorId = '123e4567-e89b-12d3-a456-426614174000';
      const expectedResult: ActionTypeExecutorResult<unknown> = {
        status: 'ok',
        actionId: connectorId,
        data: { status: 200 },
      };

      mockActionsClient.execute.mockResolvedValue(expectedResult);

      const testAbortController = new AbortController();
      await connectorExecutor.execute({
        connectorType,
        connectorNameOrId: connectorId,
        input,
        abortController: testAbortController,
      });

      expect(mockActionsClient.execute).toHaveBeenCalledWith({
        actionId: connectorId,
        params: input,
        signal: testAbortController.signal,
      });
    });

    it('should execute email connectors as notification-sourced actions', async () => {
      const connectorId = 'email-connector-id';
      const expectedResult: ActionTypeExecutorResult<unknown> = {
        status: 'ok',
        actionId: connectorId,
        data: undefined,
      };

      mockActionsClient.get.mockResolvedValue({
        id: connectorId,
        name: 'stakeholder-email',
        actionTypeId: '.email',
      } as ConnectorWithExtraFindData);
      mockActionsClient.execute.mockResolvedValue(expectedResult);

      await connectorExecutor.execute({
        connectorType: 'email',
        connectorNameOrId: connectorId,
        input: {
          to: ['ops@example.com'],
          subject: 'Daily CSV report',
          message: 'Attached is the generated report.',
          messageHTML: '<p>Attached is the generated report.</p>',
          attachments: [{ filename: 'report.csv', content: 'host,risk\nhost-1,high\n' }],
        },
        abortController,
      });

      expect(mockActionsClient.execute).toHaveBeenCalledWith({
        actionId: connectorId,
        params: expect.objectContaining({
          messageHTML: '<p>Attached is the generated report.</p>',
          attachments: [{ filename: 'report.csv', content: 'host,risk\nhost-1,high\n' }],
        }),
        signal: abortController.signal,
        source: {
          type: 'NOTIFICATION',
          source: {
            requesterId: 'workflows',
            connectorId,
          },
        },
      });
    });

    it('should not set notification source for non-email connectors', async () => {
      const connectorId = 'slack-connector-id';
      const expectedResult: ActionTypeExecutorResult<unknown> = {
        status: 'ok',
        actionId: connectorId,
        data: undefined,
      };

      mockActionsClient.get.mockResolvedValue({
        id: connectorId,
        name: 'team-slack',
        actionTypeId: '.slack',
      } as ConnectorWithExtraFindData);
      mockActionsClient.execute.mockResolvedValue(expectedResult);

      await connectorExecutor.execute({
        connectorType: 'slack',
        connectorNameOrId: connectorId,
        input: { text: 'hi' },
        abortController,
      });

      expect(mockActionsClient.execute).toHaveBeenCalledWith({
        actionId: connectorId,
        params: { text: 'hi' },
        signal: abortController.signal,
      });
    });

    it('should handle abort signal during execution', async () => {
      const connectorId = '123e4567-e89b-12d3-a456-426614174000';
      const testAbortController = new AbortController();

      // Make execute take some time, and abort mid-flight once the listener is registered
      mockActionsClient.execute.mockImplementation(
        () =>
          new Promise<ActionTypeExecutorResult<unknown>>((resolve) => {
            // Abort after a short delay so the abort event listener in runConnector
            // is already registered when the signal fires
            setTimeout(() => testAbortController.abort(), 10);
            setTimeout(() => {
              resolve({
                status: 'ok',
                actionId: connectorId,
                data: { status: 200 },
              });
            }, 100);
          })
      );

      const executePromise = connectorExecutor.execute({
        connectorType,
        connectorNameOrId: connectorId,
        input,
        abortController: testAbortController,
      });

      await expect(executePromise).rejects.toThrow(
        `Action type "${connectorType}" with ID "${connectorId}" execution was aborted`
      );
    });
  });
});
