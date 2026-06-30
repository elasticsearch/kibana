/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { getConnectorSpec } from '../../..';
import { OneDrive } from './one_drive';

const mockGet = jest.fn();

const mockContext = {
  client: { get: mockGet },
  log: { debug: jest.fn() },
  config: {},
  secrets: {},
} as unknown as ActionContext;

// Helper: parse raw input through the action schema so Zod defaults are applied.
const parse = <K extends keyof typeof OneDrive.actions>(action: K, raw: Record<string, unknown>) =>
  OneDrive.actions[action].input.parse(raw);

describe('OneDrive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(OneDrive).toBeDefined();
  });

  it('should be discoverable via getConnectorSpec (all_specs wiring)', () => {
    const spec = getConnectorSpec('.one_drive');
    expect(spec).toBe(OneDrive);
    expect(spec?.actions.search).toBeDefined();
    expect(spec?.actions.search.isTool).toBe(true);
  });

  describe('metadata', () => {
    it('has the correct id and display name', () => {
      expect(OneDrive.metadata.id).toBe('.one_drive');
      expect(OneDrive.metadata.displayName).toBe('OneDrive');
      expect(OneDrive.metadata.minimumLicense).toBe('enterprise');
    });

    it('supports workflows and agentBuilder', () => {
      expect(OneDrive.metadata.supportedFeatureIds).toContain('workflows');
      expect(OneDrive.metadata.supportedFeatureIds).toContain('agentBuilder');
    });

    it('is marked as technical preview', () => {
      expect(OneDrive.metadata.isTechnicalPreview).toBe(true);
    });
  });

  describe('auth', () => {
    it('uses oauth_authorization_code with hidden scope', () => {
      const oauthType = OneDrive.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: { scope: 'Files.Read.All offline_access User.Read' },
      });
    });

    it('hides scope and shows placeholders for tenant-specific URLs', () => {
      const oauthType = OneDrive.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      ) as { overrides?: { meta?: Record<string, unknown> } } | undefined;
      expect(oauthType?.overrides?.meta).toMatchObject({
        scope: { hidden: true },
        authorizationUrl: { placeholder: expect.stringContaining('{tenant-id}') },
        tokenUrl: { placeholder: expect.stringContaining('{tenant-id}') },
      });
    });
  });

  describe('getMe action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.getMe.isTool).toBe(true);
    });

    it('calls /me with field selection', async () => {
      mockGet.mockResolvedValue({
        data: { id: 'user-1', displayName: 'Test User', mail: 'test@example.com' },
      });

      const result = await OneDrive.actions.getMe.handler(mockContext, {});

      expect(mockGet).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me', {
        params: { $select: 'id,displayName,mail,userPrincipalName' },
      });
      expect(result).toEqual({ id: 'user-1', displayName: 'Test User', mail: 'test@example.com' });
    });
  });

  describe('getDrive action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.getDrive.isTool).toBe(true);
    });

    it('calls /me/drive with field selection', async () => {
      mockGet.mockResolvedValue({ data: { id: 'drive-1', driveType: 'personal' } });

      await OneDrive.actions.getDrive.handler(mockContext, {});

      expect(mockGet).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/drive', {
        params: { $select: 'id,name,driveType,quota,owner' },
      });
    });
  });

  describe('getItemChildren action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.getItemChildren.isTool).toBe(true);
    });

    it('lists root children when itemId is omitted', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('getItemChildren', {});
      await OneDrive.actions.getItemChildren.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/root/children',
        expect.objectContaining({ params: expect.objectContaining({ $top: 50 }) })
      );
    });

    it('passes $skiptoken when pageToken is provided', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('getItemChildren', { pageToken: 'ABC123' });
      await OneDrive.actions.getItemChildren.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ $skiptoken: 'ABC123' }) })
      );
    });

    it('extracts nextPageToken from @odata.nextLink when present', async () => {
      mockGet.mockResolvedValue({
        data: {
          value: [],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=TOKEN123&$top=50',
        },
      });
      const input = parse('getItemChildren', {});
      const result = (await OneDrive.actions.getItemChildren.handler(mockContext, input)) as Record<
        string,
        unknown
      >;

      expect(result.nextPageToken).toBe('TOKEN123');
    });

    it('returns no nextPageToken when @odata.nextLink is absent', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('getItemChildren', {});
      const result = (await OneDrive.actions.getItemChildren.handler(mockContext, input)) as Record<
        string,
        unknown
      >;

      expect(result.nextPageToken).toBeUndefined();
    });

    it('lists children of a specific folder by itemId', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('getItemChildren', { itemId: 'folder-abc' });
      await OneDrive.actions.getItemChildren.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/items/folder-abc/children',
        expect.objectContaining({ params: expect.objectContaining({ $top: 50 }) })
      );
    });

    it('passes custom top value', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('getItemChildren', { top: 10 });
      await OneDrive.actions.getItemChildren.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ $top: 10 }) })
      );
    });
  });

  describe('search action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.search.isTool).toBe(true);
    });

    it('calls the Graph search endpoint with encoded query and default top', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('search', { query: 'budget report' });
      await OneDrive.actions.search.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("search(q='budget%20report')"),
        expect.objectContaining({ params: expect.objectContaining({ $top: 25 }) })
      );
    });

    it('passes custom top', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('search', { query: 'roadmap', top: 10 });
      await OneDrive.actions.search.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ $top: 10 }) })
      );
    });

    it('escapes single quotes in query using OData doubling before encoding', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('search', { query: "Q3's report" });
      await OneDrive.actions.search.handler(mockContext, input);

      // OData literal: search(q='Q3''s%20report') — apostrophe doubled, then URL-encoded
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("search(q='Q3''s%20report')"),
        expect.any(Object)
      );
    });

    it('passes $skiptoken when pageToken is provided alongside query', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      const input = parse('search', { query: 'budget', pageToken: 'TOKEN456' });
      await OneDrive.actions.search.handler(mockContext, input);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ $skiptoken: 'TOKEN456' }) })
      );
    });

    it('rejects when neither query nor pageToken is provided', () => {
      expect(() => parse('search', {})).toThrow();
    });

    it('rejects when pageToken is provided without query', () => {
      expect(() => parse('search', { pageToken: 'TOKEN_ONLY' })).toThrow(
        'query is required when pageToken is provided'
      );
    });

    it('extracts nextPageToken from @odata.nextLink when present', async () => {
      mockGet.mockResolvedValue({
        data: {
          value: [],
          '@odata.nextLink':
            "https://graph.microsoft.com/v1.0/me/drive/root/search(q='budget')?$skiptoken=NEXT123&$top=25",
        },
      });
      const input = parse('search', { query: 'budget' });
      const result = (await OneDrive.actions.search.handler(mockContext, input)) as Record<
        string,
        unknown
      >;

      expect(result.nextPageToken).toBe('NEXT123');
    });
  });

  describe('getFileMetadata action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.getFileMetadata.isTool).toBe(true);
    });

    it('calls /me/drive/items/{itemId} when no driveId provided', async () => {
      mockGet.mockResolvedValue({ data: { id: 'item-1', name: 'report.pdf' } });

      const result = await OneDrive.actions.getFileMetadata.handler(mockContext, {
        itemId: 'item-1',
      });

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/items/item-1',
        expect.objectContaining({
          params: expect.objectContaining({ $select: expect.any(String) }),
        })
      );
      expect(result).toEqual({ id: 'item-1', name: 'report.pdf' });
    });

    it('calls /drives/{driveId}/items/{itemId} when driveId is provided (cross-drive)', async () => {
      mockGet.mockResolvedValue({ data: { id: 'remote-item-1', name: 'shared.docx' } });

      await OneDrive.actions.getFileMetadata.handler(mockContext, {
        itemId: 'remote-item-1',
        driveId: 'drive-abc',
      });

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/drives/drive-abc/items/remote-item-1',
        expect.objectContaining({
          params: expect.objectContaining({ $select: expect.any(String) }),
        })
      );
    });
  });

  describe('getFileContent action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.getFileContent.isTool).toBe(true);
    });

    it('calls /me/drive/items/{itemId}/content and returns utf-8 for text/* types', async () => {
      const buffer = Buffer.from('Hello, World!', 'utf8');
      mockGet.mockResolvedValue({
        data: buffer,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });

      const result = await OneDrive.actions.getFileContent.handler(mockContext, {
        itemId: 'item-1',
      });

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/items/item-1/content',
        { responseType: 'arraybuffer' }
      );
      expect(result).toEqual({
        mimeType: 'text/plain',
        encoding: 'utf-8',
        content: 'Hello, World!',
      });
    });

    it('calls /drives/{driveId}/items/{itemId}/content when driveId is provided (cross-drive)', async () => {
      const buffer = Buffer.from('shared content', 'utf8');
      mockGet.mockResolvedValue({
        data: buffer,
        headers: { 'content-type': 'text/plain' },
      });

      await OneDrive.actions.getFileContent.handler(mockContext, {
        itemId: 'remote-item-1',
        driveId: 'drive-abc',
      });

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/drives/drive-abc/items/remote-item-1/content',
        { responseType: 'arraybuffer' }
      );
    });

    it('returns base64 string for binary content types', async () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
      mockGet.mockResolvedValue({
        data: buffer,
        headers: { 'content-type': 'application/pdf' },
      });

      const result = await OneDrive.actions.getFileContent.handler(mockContext, {
        itemId: 'item-2',
      });

      expect(result).toEqual({
        mimeType: 'application/pdf',
        encoding: 'base64',
        content: buffer.toString('base64'),
      });
    });

    it('returns utf-8 string for application/json', async () => {
      const buffer = Buffer.from('{"key":"value"}', 'utf8');
      mockGet.mockResolvedValue({
        data: buffer,
        headers: { 'content-type': 'application/json' },
      });

      const result = await OneDrive.actions.getFileContent.handler(mockContext, {
        itemId: 'item-3',
      });

      expect(result).toEqual({
        mimeType: 'application/json',
        encoding: 'utf-8',
        content: '{"key":"value"}',
      });
    });
  });

  describe('listSharedWithMe action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.listSharedWithMe.isTool).toBe(true);
    });

    it('calls /me/drive/sharedWithMe and includes remoteItem in $select', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      await OneDrive.actions.listSharedWithMe.handler(mockContext, {});

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/sharedWithMe',
        expect.objectContaining({
          params: expect.objectContaining({ $select: expect.stringContaining('remoteItem') }),
        })
      );
    });

    it('passes $skiptoken when pageToken is provided', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      await OneDrive.actions.listSharedWithMe.handler(mockContext, { pageToken: 'TOKEN789' });

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ $skiptoken: 'TOKEN789' }) })
      );
    });
  });

  describe('listRecentFiles action', () => {
    it('is exposed as a tool', () => {
      expect(OneDrive.actions.listRecentFiles.isTool).toBe(true);
    });

    it('calls /me/drive/recent with $top 25 and includes remoteItem in $select', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      await OneDrive.actions.listRecentFiles.handler(mockContext, {});

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/recent',
        expect.objectContaining({
          params: expect.objectContaining({
            $top: 25,
            $select: expect.stringContaining('remoteItem'),
          }),
        })
      );
    });

    it('passes $skiptoken when pageToken is provided', async () => {
      mockGet.mockResolvedValue({ data: { value: [] } });
      await OneDrive.actions.listRecentFiles.handler(mockContext, { pageToken: 'TOKEN_RECENT' });

      expect(mockGet).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/drive/recent',
        expect.objectContaining({ params: expect.objectContaining({ $skiptoken: 'TOKEN_RECENT' }) })
      );
    });

    it('extracts nextPageToken from @odata.nextLink when present', async () => {
      mockGet.mockResolvedValue({
        data: {
          value: [],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/drive/recent?$skiptoken=RECENT_NEXT&$top=25',
        },
      });
      const result = (await OneDrive.actions.listRecentFiles.handler(mockContext, {})) as Record<
        string,
        unknown
      >;

      expect(result.nextPageToken).toBe('RECENT_NEXT');
    });
  });

  describe('test handler', () => {
    it('returns ok with user display name on success', async () => {
      mockGet.mockResolvedValue({
        data: { displayName: 'Test User', mail: 'test@example.com' },
      });

      if (!OneDrive.test) throw new Error('test handler not defined');
      const result = await OneDrive.test.handler(mockContext);

      expect(result).toEqual({
        ok: true,
        message: 'Connected to OneDrive as Test User (test@example.com)',
      });
    });

    it('returns ok:false with error message on failure', async () => {
      mockGet.mockRejectedValue(new Error('401 Unauthorized'));

      if (!OneDrive.test) throw new Error('test handler not defined');
      const result = await OneDrive.test.handler(mockContext);

      expect(result).toEqual({ ok: false, message: '401 Unauthorized' });
    });
  });

  describe('skill property', () => {
    it('is defined and contains multi-step guidance', () => {
      expect(OneDrive.skill).toBeDefined();
      expect(typeof OneDrive.skill).toBe('string');
      expect(OneDrive.skill).toContain('search');
      expect(OneDrive.skill).toContain('getItemChildren');
      expect(OneDrive.skill).toContain('getFileContent');
      expect(OneDrive.skill).toContain('listSharedWithMe');
    });
  });
});
