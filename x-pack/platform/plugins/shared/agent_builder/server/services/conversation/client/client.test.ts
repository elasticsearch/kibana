/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { ConversationAccessControlMode } from '@kbn/agent-builder-common';
import { createClient, type ConversationClient } from './client';

const testSpace = 'default';

interface MockEsClient {
  search: jest.Mock;
  index: jest.Mock;
  delete: jest.Mock;
}

const mockEsClient: MockEsClient = {
  search: jest.fn(),
  index: jest.fn(),
  delete: jest.fn(),
};

jest.mock('./storage', () => ({
  createStorage: jest.fn(() => ({
    getClient: jest.fn(() => mockEsClient),
  })),
}));

describe('ConversationClient', () => {
  let client: ConversationClient;

  beforeEach(() => {
    jest.clearAllMocks();

    client = createClient({
      space: testSpace,
      logger: loggerMock.create(),
      esClient: {} as never,
      user: {
        id: 'user-1',
        username: 'test-user',
      },
    });
  });

  describe('list', () => {
    it('requests access_control and preserves it in listed conversations', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'conversation-1',
              _source: {
                agent_id: 'agent-1',
                user_id: 'user-1',
                user_name: 'test-user',
                title: 'Conversation 1',
                created_at: '2024-09-04T06:44:17.944Z',
                updated_at: '2025-08-04T06:44:19.123Z',
                read: false,
                access_control: {
                  access_mode: ConversationAccessControlMode.Public,
                },
              },
            },
          ],
        },
      });

      const result = await client.list();

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          _source: expect.arrayContaining(['access_control']),
        })
      );
      expect(result[0].access_control).toEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });
  });
});
