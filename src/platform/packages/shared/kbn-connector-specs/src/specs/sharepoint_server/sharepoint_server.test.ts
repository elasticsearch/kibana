/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { SharepointServer } from './sharepoint_server';

const SITE_URL = 'https://sharepoint.company.com';
const ODATA_HEADERS = { Accept: 'application/json;odata=nometadata' };

interface TestResult {
  ok: boolean;
  message?: string;
}

describe('SharepointServer', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
    request: jest.fn(),
  };

  const mockContext = {
    client: mockClient,
    log: { debug: jest.fn(), error: jest.fn() },
    config: { siteUrl: SITE_URL },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(SharepointServer).toBeDefined();
  });

  describe('getWeb action', () => {
    it('should call _api/web and return data', async () => {
      const mockResponse = {
        data: { Title: 'My Site', Url: SITE_URL },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await SharepointServer.actions.getWeb.handler(mockContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/web`, {
        headers: ODATA_HEADERS,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should propagate errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Unauthorized'));
      await expect(SharepointServer.actions.getWeb.handler(mockContext, {})).rejects.toThrow(
        'Unauthorized'
      );
    });
  });

  describe('getLists action', () => {
    it('should call _api/web/lists with $select params', async () => {
      const mockResponse = {
        data: {
          value: [
            { Id: 'list-1', Title: 'Documents' },
            { Id: 'list-2', Title: 'Tasks' },
          ],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await SharepointServer.actions.getLists.handler(mockContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/web/lists`, {
        headers: ODATA_HEADERS,
        params: {
          $select:
            'Id,Title,ItemCount,Description,Created,LastItemModifiedDate,RootFolder/ServerRelativeUrl',
          $expand: 'RootFolder',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle empty list response', async () => {
      mockClient.get.mockResolvedValue({ data: { value: [] } });
      const result = (await SharepointServer.actions.getLists.handler(mockContext, {})) as {
        value: unknown[];
      };
      expect(result.value).toHaveLength(0);
    });
  });

  describe('getListItems action', () => {
    it('should embed list title in URL and return items', async () => {
      const mockResponse = {
        data: {
          value: [{ Id: 1, Title: 'Item 1' }],
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await SharepointServer.actions.getListItems.handler(mockContext, {
        listTitle: 'My Documents',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/lists/GetByTitle('My Documents')/items`,
        { headers: ODATA_HEADERS }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should escape single quotes in list title with OData doubling', async () => {
      mockClient.get.mockResolvedValue({ data: { value: [] } });
      await SharepointServer.actions.getListItems.handler(mockContext, {
        listTitle: "John's Documents",
      });
      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/lists/GetByTitle('John''s Documents')/items`,
        { headers: ODATA_HEADERS }
      );
    });

    it('should propagate errors', async () => {
      mockClient.get.mockRejectedValue(new Error('List not found'));
      await expect(
        SharepointServer.actions.getListItems.handler(mockContext, { listTitle: 'Missing' })
      ).rejects.toThrow('List not found');
    });
  });

  describe('getFolderContents action', () => {
    it('should merge files and folders from two requests', async () => {
      const filesResponse = { data: { value: [{ Name: 'file.docx' }] } };
      const foldersResponse = { data: { value: [{ Name: 'Subfolder' }] } };
      mockClient.get.mockResolvedValueOnce(filesResponse).mockResolvedValueOnce(foldersResponse);

      const result = (await SharepointServer.actions.getFolderContents.handler(mockContext, {
        path: '/sites/mysite/Shared Documents',
      })) as { files: unknown[]; folders: unknown[] };

      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/GetFolderByServerRelativeUrl('/sites/mysite/Shared Documents')/Files`,
        { headers: ODATA_HEADERS }
      );
      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/GetFolderByServerRelativeUrl('/sites/mysite/Shared Documents')/Folders`,
        { headers: ODATA_HEADERS }
      );
      expect(result.files).toEqual([{ Name: 'file.docx' }]);
      expect(result.folders).toEqual([{ Name: 'Subfolder' }]);
    });

    it('should propagate errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Folder not found'));
      await expect(
        SharepointServer.actions.getFolderContents.handler(mockContext, { path: '/missing' })
      ).rejects.toThrow('Folder not found');
    });
  });

  describe('downloadFile action', () => {
    it('should call /$value endpoint and return text content', async () => {
      const mockResponse = {
        data: Uint8Array.from([72, 101, 108, 108, 111]),
        headers: {
          'content-type': 'text/plain',
          'content-length': '5',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = (await SharepointServer.actions.downloadFile.handler(mockContext, {
        path: '/sites/mysite/Shared Documents/hello.txt',
      })) as { text: string; contentType: string; contentLength: string };

      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/GetFileByServerRelativeUrl('/sites/mysite/Shared Documents/hello.txt')/$value`,
        { responseType: 'arraybuffer' }
      );
      expect(result.text).toBe('Hello');
      expect(result.contentType).toBe('text/plain');
      expect(result.contentLength).toBe('5');
    });
  });

  describe('getSitePageContents action', () => {
    it('should call Site Pages list item endpoint with correct selects', async () => {
      const mockResponse = {
        data: { Title: 'Home', CanvasContent1: '<div>content</div>', WikiField: null },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await SharepointServer.actions.getSitePageContents.handler(mockContext, {
        pageId: 42,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${SITE_URL}/_api/web/lists/GetByTitle('Site Pages')/items(42)`,
        {
          headers: ODATA_HEADERS,
          params: { $select: 'Title,CanvasContent1,WikiField' },
        }
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should propagate errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Page not found'));
      await expect(
        SharepointServer.actions.getSitePageContents.handler(mockContext, { pageId: 999 })
      ).rejects.toThrow('Page not found');
    });
  });

  describe('search action', () => {
    it('should pass querytext param correctly', async () => {
      const mockResponse = { data: { PrimaryQueryResult: { RelevantResults: { RowCount: 1 } } } };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await SharepointServer.actions.search.handler(mockContext, {
        query: 'project plan',
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/search/query`, {
        headers: ODATA_HEADERS,
        params: { querytext: "'project plan'" },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should include pagination params when provided', async () => {
      mockClient.get.mockResolvedValue({ data: {} });

      await SharepointServer.actions.search.handler(mockContext, {
        query: 'documents',
        from: 10,
        size: 25,
      });

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/search/query`, {
        headers: ODATA_HEADERS,
        params: { querytext: "'documents'", startRow: 10, rowLimit: 25 },
      });
    });

    it('should propagate errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Search failed'));
      await expect(
        SharepointServer.actions.search.handler(mockContext, { query: 'test' })
      ).rejects.toThrow('Search failed');
    });
  });

  describe('callRestApi action', () => {
    it('should pass method/path/body through and return full response info', async () => {
      const mockResponse = {
        data: { value: 'My Site' },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      };
      mockClient.request.mockResolvedValue(mockResponse);

      const result = (await SharepointServer.actions.callRestApi.handler(mockContext, {
        method: 'GET',
        path: '_api/web/title',
      })) as { status: number; data: unknown };

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: `${SITE_URL}/_api/web/title`,
          headers: ODATA_HEADERS,
          data: undefined,
        })
      );
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ value: 'My Site' });
    });

    it('should pass body for POST requests', async () => {
      const mockResponse = {
        data: { Id: 1 },
        status: 201,
        statusText: 'Created',
        headers: {},
      };
      mockClient.request.mockResolvedValue(mockResponse);

      await SharepointServer.actions.callRestApi.handler(mockContext, {
        method: 'POST',
        path: '_api/web/lists',
        body: { Title: 'New List' },
      });

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { Title: 'New List' },
        })
      );
    });

    it('should reject paths not starting with _api/', () => {
      expect(() =>
        SharepointServer.actions.callRestApi.input.parse({
          method: 'GET',
          path: 'sites/mysite/pages',
        })
      ).toThrow();
    });

    it('should accept paths starting with _api/', () => {
      expect(() =>
        SharepointServer.actions.callRestApi.input.parse({
          method: 'GET',
          path: '_api/web/lists',
        })
      ).not.toThrow();
    });
  });

  describe('test handler', () => {
    it('should return ok: true with site title on success', async () => {
      mockClient.get.mockResolvedValue({ data: { value: 'Team Site' } });

      if (!SharepointServer.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await SharepointServer.test.handler(mockContext)) as TestResult;

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/web/title`, {
        headers: ODATA_HEADERS,
      });
      expect(result.ok).toBe(true);
      expect(result.message).toBe('Successfully connected to SharePoint Server: Team Site');
    });

    it('should return "Unknown" when title is missing', async () => {
      mockClient.get.mockResolvedValue({ data: {} });

      if (!SharepointServer.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await SharepointServer.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Successfully connected to SharePoint Server: Unknown');
    });

    it('should return ok: false on error', async () => {
      mockClient.get.mockRejectedValue(new Error('Invalid credentials'));

      if (!SharepointServer.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await SharepointServer.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });

    it('should handle network errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Network timeout'));

      if (!SharepointServer.test) {
        throw new Error('Test handler not defined');
      }
      const result = (await SharepointServer.test.handler(mockContext)) as TestResult;

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network timeout');
    });
  });

  describe('siteUrl normalization', () => {
    it('should strip a trailing slash from siteUrl so URLs do not double-slash', async () => {
      mockClient.get.mockResolvedValue({ data: {} });

      const trailingSlashContext = {
        ...mockContext,
        config: { siteUrl: `${SITE_URL}/` },
      } as unknown as ActionContext;

      await SharepointServer.actions.getWeb.handler(trailingSlashContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/web`, expect.any(Object));
    });

    it('should strip multiple trailing slashes', async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const manySlashesContext = {
        ...mockContext,
        config: { siteUrl: `${SITE_URL}///` },
      } as unknown as ActionContext;

      await SharepointServer.actions.getLists.handler(manySlashesContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(`${SITE_URL}/_api/web/lists`, expect.any(Object));
    });
  });
});
