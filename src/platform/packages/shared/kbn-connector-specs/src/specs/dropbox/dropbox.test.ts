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
import { Dropbox } from './dropbox';

// Mock withMcpClient so action handlers don't need a real MCP transport.
// The mock immediately invokes the callback with a fake McpClient.
const mockCallTool = jest.fn();
const mockListTools = jest.fn();

jest.mock('../../lib/mcp/with_mcp_client', () => ({
  withMcpClient: jest.fn(async (_ctx: unknown, fn: (mcp: unknown) => Promise<unknown>) => {
    return fn({ callTool: mockCallTool, listTools: mockListTools });
  }),
}));

// Helper: parse raw input through the action schema the way the framework does,
// so Zod defaults are applied before the handler receives the input.
const parse = <K extends keyof typeof Dropbox.actions>(action: K, raw: Record<string, unknown>) =>
  Dropbox.actions[action].input.parse(raw);

describe('Dropbox', () => {
  const mockContext = {
    client: {},
    log: {},
    config: { serverUrl: 'https://mcp.dropbox.com/mcp' },
  } as unknown as ActionContext;

  const mockJson = { account_id: 'dbid:abc123', name: { display_name: 'Test User' } };
  const mockContent = [{ type: 'text', text: JSON.stringify(mockJson) }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: mockContent });
    mockListTools.mockResolvedValue({
      tools: [{ name: 'WhoAmI' }, { name: 'Search' }],
    });
  });

  it('should be defined', () => {
    expect(Dropbox).toBeDefined();
  });

  it('should be discoverable via getConnectorSpec (all_specs wiring)', () => {
    const spec = getConnectorSpec('.dropbox');
    expect(spec).toBe(Dropbox);
    expect(spec?.actions.search).toBeDefined();
    expect(spec?.actions.search.isTool).toBe(true);
  });

  describe('metadata', () => {
    it('should have correct id and display name', () => {
      expect(Dropbox.metadata.id).toBe('.dropbox');
      expect(Dropbox.metadata.displayName).toBe('Dropbox');
      expect(Dropbox.metadata.minimumLicense).toBe('enterprise');
    });

    it('should support both workflows and agentBuilder feature IDs', () => {
      expect(Dropbox.metadata.supportedFeatureIds).toContain('workflows');
      expect(Dropbox.metadata.supportedFeatureIds).toContain('agentBuilder');
    });

    it('should be marked as technical preview', () => {
      expect(Dropbox.metadata.isTechnicalPreview).toBe(true);
    });
  });

  describe('auth', () => {
    it('supports oauth_authorization_code with correct Dropbox defaults', () => {
      const oauthType = Dropbox.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
          tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        },
      });
    });

    it('hides oauth_authorization_code URL and scope fields', () => {
      const oauthType = Dropbox.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      ) as { overrides?: { meta?: Record<string, unknown> } } | undefined;
      expect(oauthType?.overrides?.meta).toMatchObject({
        authorizationUrl: { hidden: true },
        tokenUrl: { hidden: true },
        scope: { hidden: true },
      });
    });
  });

  describe('schema', () => {
    it('has a serverUrl field with correct default', () => {
      if (!Dropbox.schema) {
        throw new Error('schema not defined');
      }
      const parsed = Dropbox.schema.parse({});
      expect((parsed as { serverUrl?: string }).serverUrl).toBe('https://mcp.dropbox.com/mcp');
    });

    it('accepts a custom serverUrl', () => {
      if (!Dropbox.schema) {
        throw new Error('schema not defined');
      }
      const parsed = Dropbox.schema.parse({ serverUrl: 'https://custom.mcp.dropbox.com/mcp' });
      expect((parsed as { serverUrl?: string }).serverUrl).toBe(
        'https://custom.mcp.dropbox.com/mcp'
      );
    });
  });

  describe('validateUrls', () => {
    it('validates the serverUrl field', () => {
      expect(Dropbox.validateUrls?.fields).toContain('serverUrl');
    });
  });

  describe('whoAmI action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.whoAmI.isTool).toBe(true);
    });

    it('calls who_am_i tool with no arguments', async () => {
      const result = await Dropbox.actions.whoAmI.handler(mockContext, {});

      expect(mockCallTool).toHaveBeenCalledWith({ name: 'who_am_i', arguments: {} });
      expect(result).toEqual(mockJson);
    });
  });

  describe('search action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.search.isTool).toBe(true);
    });

    it('calls Search with query and default maxResults', async () => {
      const input = parse('search', { query: 'Q3 budget report' });
      await Dropbox.actions.search.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search',
        arguments: {
          query: 'Q3 budget report',
          path: undefined,
          max_results: 20,
          file_extensions: undefined,
          file_categories: undefined,
        },
      });
    });

    it('passes optional path and fileExtensions', async () => {
      await Dropbox.actions.search.handler(mockContext, {
        query: 'product roadmap',
        path: '/team-projects',
        maxResults: 10,
        fileExtensions: ['pdf', 'docx'],
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search',
        arguments: {
          query: 'product roadmap',
          path: '/team-projects',
          max_results: 10,
          file_extensions: ['pdf', 'docx'],
          file_categories: undefined,
        },
      });
    });
  });

  describe('listFolder action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.listFolder.isTool).toBe(true);
    });

    it('calls list_folder with path and recursive defaults', async () => {
      const input = parse('listFolder', { path: '/Documents' });
      await Dropbox.actions.listFolder.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_folder',
        arguments: {
          path: '/Documents',
          recursive: false,
        },
      });
    });

    it('uses empty string for root folder', async () => {
      const input = parse('listFolder', { path: '' });
      await Dropbox.actions.listFolder.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_folder',
        arguments: {
          path: '',
          recursive: false,
        },
      });
    });

    it('passes recursive flag', async () => {
      const input = parse('listFolder', { path: '/Projects', recursive: true });
      await Dropbox.actions.listFolder.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_folder',
        arguments: {
          path: '/Projects',
          recursive: true,
        },
      });
    });
  });

  describe('getFileMetadata action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.getFileMetadata.isTool).toBe(true);
    });

    it('calls get_file_metadata with path_or_file_id', async () => {
      const result = await Dropbox.actions.getFileMetadata.handler(mockContext, {
        path: '/Documents/report.pdf',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_metadata',
        arguments: { path_or_file_id: '/Documents/report.pdf' },
      });
      expect(result).toEqual(mockJson);
    });
  });

  describe('getFileContent action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.getFileContent.isTool).toBe(true);
    });

    it('calls get_file_content with path_or_file_id and returns content', async () => {
      const result = await Dropbox.actions.getFileContent.handler(mockContext, {
        path: '/Documents/notes.txt',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_content',
        arguments: { path_or_file_id: '/Documents/notes.txt' },
      });
      // callToolContent returns the raw content parts
      expect(result).toEqual(mockContent);
    });
  });

  describe('createSharedLink action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.createSharedLink.isTool).toBe(true);
    });

    it('calls CreateSharedLink with path and default visibility of team_only', async () => {
      const input = parse('createSharedLink', { path: '/Documents/report.pdf' });
      await Dropbox.actions.createSharedLink.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'create_shared_link',
        arguments: {
          path: '/Documents/report.pdf',
          visibility: 'team_only',
        },
      });
    });

    it('passes custom visibility', async () => {
      await Dropbox.actions.createSharedLink.handler(mockContext, {
        path: '/Confidential/budget.xlsx',
        visibility: 'team_only',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'create_shared_link',
        arguments: {
          path: '/Confidential/budget.xlsx',
          visibility: 'team_only',
        },
      });
    });
  });

  describe('listSharedLinks action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.listSharedLinks.isTool).toBe(true);
    });

    it('calls ListSharedLinks with no path by default', async () => {
      const input = parse('listSharedLinks', {});
      await Dropbox.actions.listSharedLinks.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_shared_links',
        arguments: { path: undefined },
      });
    });

    it('passes optional path filter', async () => {
      await Dropbox.actions.listSharedLinks.handler(mockContext, {
        path: '/Documents/report.pdf',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_shared_links',
        arguments: { path: '/Documents/report.pdf' },
      });
    });
  });

  describe('listTools action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.listTools.isTool).toBe(true);
    });

    it('returns the list of available tools', async () => {
      const result = await Dropbox.actions.listTools.handler(mockContext, {});

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'WhoAmI' }, { name: 'Search' }]);
    });
  });

  describe('callTool action', () => {
    it('is exposed as a tool', () => {
      expect(Dropbox.actions.callTool.isTool).toBe(true);
    });

    it('calls the named tool with provided arguments', async () => {
      const result = await Dropbox.actions.callTool.handler(mockContext, {
        name: 'CreateFolder',
        arguments: { path: '/New Project' },
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'CreateFolder',
        arguments: { path: '/New Project' },
      });
      // callTool uses callToolContent which returns raw content parts
      expect(result).toEqual(mockContent);
    });

    it('calls the named tool with empty arguments when omitted', async () => {
      await Dropbox.actions.callTool.handler(mockContext, { name: 'GetUsageAndQuota' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'GetUsageAndQuota',
        arguments: {},
      });
    });
  });

  describe('test handler', () => {
    it('returns ok with tool count on successful connection', async () => {
      if (!Dropbox.test) {
        throw new Error('test handler not defined');
      }
      const result = await Dropbox.test.handler(mockContext);

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Connected to Dropbox MCP server. 2 tools available.',
      });
    });

    it('propagates errors thrown by withMcpClient', async () => {
      const { withMcpClient } = jest.requireMock('../../lib/mcp/with_mcp_client');
      withMcpClient.mockRejectedValueOnce(new Error('connection refused'));

      if (!Dropbox.test) {
        throw new Error('test handler not defined');
      }

      await expect(Dropbox.test.handler(mockContext)).rejects.toThrow('connection refused');
    });
  });

  describe('skill property', () => {
    it('is defined and contains multi-step guidance', () => {
      expect(Dropbox.skill).toBeDefined();
      expect(typeof Dropbox.skill).toBe('string');
      expect(Dropbox.skill).toContain('search');
      expect(Dropbox.skill).toContain('listFolder');
      expect(Dropbox.skill).toContain('getFileMetadata');
      expect(Dropbox.skill).toContain('createSharedLink');
    });
  });
});
