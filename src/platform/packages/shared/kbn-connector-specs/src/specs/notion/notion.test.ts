/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext, AuthTypeDef } from '../../connector_spec';
import { generateSecretsSchemaFromSpec } from '../../lib/generate_secrets_schema_from_spec';
import { NotionConnector } from './notion';

describe('NotionConnector', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    log: { debug: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth', () => {
    it('bearer auth is hidden (not shown in picker) but retained for existing connectors', () => {
      const bearerDef = NotionConnector.auth?.types.find(
        (t): t is AuthTypeDef => typeof t === 'object' && t.type === 'bearer'
      );
      expect(bearerDef).toBeDefined();
      expect(bearerDef?.isLegacy).toBe(true);
    });

    it('existing connectors with bearer auth still pass schema validation', () => {
      const schema = generateSecretsSchemaFromSpec(NotionConnector.auth, {
        isEarsEnabled: true,
        isEarsExperimentalEnabled: true,
      });
      const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
      expect(result.success).toBe(true);
    });

    it('supports oauth_authorization_code with correct Notion defaults', () => {
      const oauthType = (
        NotionConnector.auth?.types as Array<
          string | { type: string; defaults?: Record<string, unknown> }
        >
      ).find((t) => typeof t === 'object' && t.type === 'oauth_authorization_code');
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
          tokenUrl: 'https://api.notion.com/v1/oauth/token',
        },
      });
    });
  });

  describe('searchPageOrDSByTitle action', () => {
    it('should search for pages with required parameters', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: 'page-id-123',
              object: 'page',
              properties: {},
            },
          ],
          has_more: false,
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await NotionConnector.actions.searchPageOrDSByTitle.handler(mockContext, {
        query: 'Meeting Notes',
        queryObjectType: 'page',
      });

      expect(mockClient.post).toHaveBeenCalledWith('https://api.notion.com/v1/search', {
        query: 'Meeting Notes',
        filter: {
          value: 'page',
          property: 'object',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should search for data sources', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: 'db-id-456',
              object: 'database',
              title: [{ text: { content: 'Projects' } }],
            },
          ],
          has_more: false,
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await NotionConnector.actions.searchPageOrDSByTitle.handler(mockContext, {
        query: 'Projects',
        queryObjectType: 'data_source',
      });

      expect(mockClient.post).toHaveBeenCalledWith('https://api.notion.com/v1/search', {
        query: 'Projects',
        filter: {
          value: 'data_source',
          property: 'object',
        },
      });
    });

    it('should include optional pagination parameters', async () => {
      const mockResponse = {
        data: {
          results: [],
          has_more: true,
          next_cursor: 'cursor-xyz',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await NotionConnector.actions.searchPageOrDSByTitle.handler(mockContext, {
        query: 'Documents',
        queryObjectType: 'page',
        startCursor: 'cursor-abc',
        pageSize: 50,
      });

      expect(mockClient.post).toHaveBeenCalledWith('https://api.notion.com/v1/search', {
        query: 'Documents',
        filter: {
          value: 'page',
          property: 'object',
        },
        start_cursor: 'cursor-abc',
        page_size: 50,
      });
    });
  });

  describe('getPage action', () => {
    it('should retrieve page by ID', async () => {
      const mockResponse = {
        data: {
          id: 'page-id-789',
          object: 'page',
          properties: {
            title: {
              title: [{ text: { content: 'My Page' } }],
            },
          },
          created_time: '2025-01-01T00:00:00.000Z',
          last_edited_time: '2025-01-02T00:00:00.000Z',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await NotionConnector.actions.getPage.handler(mockContext, {
        pageId: 'page-id-789',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/page-id-789',
        {}
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getDataSource action', () => {
    it('should retrieve data source by ID', async () => {
      const mockResponse = {
        data: {
          id: 'db-id-abc123',
          object: 'database',
          title: [{ text: { content: 'Tasks Database' } }],
          properties: {
            Name: { type: 'title' },
            Status: { type: 'select' },
          },
          created_time: '2025-01-01T00:00:00.000Z',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await NotionConnector.actions.getDataSource.handler(mockContext, {
        dataSourceId: 'db-id-abc123',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        'https://api.notion.com/v1/data_sources/db-id-abc123',
        {}
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('queryDataSource action', () => {
    it('should query data source without filter', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: 'page-1',
              properties: {
                Name: { title: [{ text: { content: 'Task 1' } }] },
              },
            },
          ],
          has_more: false,
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await NotionConnector.actions.queryDataSource.handler(mockContext, {
        dataSourceId: 'db-id-xyz',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://api.notion.com/v1/data_sources/db-id-xyz/query',
        {
          page_size: undefined,
          start_cursor: undefined,
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should query data source with filter', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: 'page-2',
              properties: {
                Name: { title: [{ text: { content: 'Task 2' } }] },
                Status: { select: { name: 'In Progress' } },
              },
            },
          ],
          has_more: false,
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const filterJson = JSON.stringify({
        property: 'Status',
        select: { equals: 'In Progress' },
      });

      await NotionConnector.actions.queryDataSource.handler(mockContext, {
        dataSourceId: 'db-id-xyz',
        filter: filterJson,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://api.notion.com/v1/data_sources/db-id-xyz/query',
        {
          page_size: undefined,
          start_cursor: undefined,
          filter: {
            property: 'Status',
            select: { equals: 'In Progress' },
          },
        }
      );
    });

    it('should include pagination parameters', async () => {
      const mockResponse = {
        data: {
          results: [],
          has_more: true,
          next_cursor: 'next-page-cursor',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await NotionConnector.actions.queryDataSource.handler(mockContext, {
        dataSourceId: 'db-id-xyz',
        startCursor: 'current-cursor',
        pageSize: 25,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        'https://api.notion.com/v1/data_sources/db-id-xyz/query',
        {
          page_size: 25,
          start_cursor: 'current-cursor',
        }
      );
    });

    it('should handle complex filters', async () => {
      const mockResponse = {
        data: {
          results: [],
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const complexFilter = JSON.stringify({
        and: [
          { property: 'Status', select: { equals: 'Done' } },
          { property: 'Priority', select: { equals: 'High' } },
        ],
      });

      await NotionConnector.actions.queryDataSource.handler(mockContext, {
        dataSourceId: 'db-id-xyz',
        filter: complexFilter,
      });

      const callArgs = mockClient.post.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('filter');
      expect(callArgs[1].filter).toEqual({
        and: [
          { property: 'Status', select: { equals: 'Done' } },
          { property: 'Priority', select: { equals: 'High' } },
        ],
      });
    });
  });

  describe('test handler', () => {
    it('should return success when API is accessible', async () => {
      const mockResponse = {
        data: {
          results: [
            { id: 'user-1', name: 'Alice' },
            { id: 'user-2', name: 'Bob' },
            { id: 'user-3', name: 'Charlie' },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      if (!NotionConnector.test) {
        throw new Error('Test handler not defined');
      }
      const result = await NotionConnector.test.handler(mockContext);

      expect(mockClient.get).toHaveBeenCalledWith('https://api.notion.com/v1/users');
      expect(result).toEqual({
        ok: true,
        message: 'Successfully connected to Notion API: found 3 users',
      });
    });

    it('should return failure when API is not accessible', async () => {
      mockClient.get.mockRejectedValue(new Error('Invalid API token'));

      if (!NotionConnector.test) {
        throw new Error('Test handler not defined');
      }
      const result = await NotionConnector.test.handler(mockContext);

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Invalid API token');
    });
  });
});
