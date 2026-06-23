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
import { Box } from './box';

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
const parse = <K extends keyof typeof Box.actions>(action: K, raw: Record<string, unknown>) =>
  Box.actions[action].input.parse(raw);

describe('Box', () => {
  const mockContext = {
    client: {},
    log: {},
    config: { serverUrl: 'https://mcp.box.com' },
  } as unknown as ActionContext;

  const mockJson = { id: '12345', name: 'Test' };
  const mockContent = [{ type: 'text', text: JSON.stringify(mockJson) }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: mockContent });
    mockListTools.mockResolvedValue({
      tools: [{ name: 'who_am_i' }, { name: 'search_files_keyword' }],
    });
  });

  it('should be defined', () => {
    expect(Box).toBeDefined();
  });

  it('should be discoverable via getConnectorSpec (all_specs wiring)', () => {
    const spec = getConnectorSpec('.box');
    expect(spec).toBe(Box);
    expect(spec?.actions.searchFilesKeyword).toBeDefined();
    expect(spec?.actions.searchFilesKeyword.isTool).toBe(true);
  });

  describe('metadata', () => {
    it('should have correct id and display name', () => {
      expect(Box.metadata.id).toBe('.box');
      expect(Box.metadata.displayName).toBe('Box');
      expect(Box.metadata.minimumLicense).toBe('enterprise');
    });

    it('should support both workflows and agentBuilder feature IDs', () => {
      expect(Box.metadata.supportedFeatureIds).toContain('workflows');
      expect(Box.metadata.supportedFeatureIds).toContain('agentBuilder');
    });

    it('should be marked as technical preview', () => {
      expect(Box.metadata.isTechnicalPreview).toBe(true);
    });
  });

  describe('auth', () => {
    it('supports oauth_authorization_code with correct Box defaults', () => {
      const oauthType = Box.auth?.types.find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
      expect(oauthType).toMatchObject({
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://account.box.com/api/oauth2/authorize',
          tokenUrl: 'https://api.box.com/oauth2/token',
          scope: 'root_readwrite ai.readwrite docgen.readwrite',
        },
      });
    });

    it('hides oauth_authorization_code URL and scope fields', () => {
      const oauthType = Box.auth?.types.find(
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
      if (!Box.schema) {
        throw new Error('schema not defined');
      }
      const parsed = Box.schema.parse({});
      expect((parsed as { serverUrl?: string }).serverUrl).toBe('https://mcp.box.com');
    });

    it('accepts a custom serverUrl', () => {
      if (!Box.schema) {
        throw new Error('schema not defined');
      }
      const parsed = Box.schema.parse({ serverUrl: 'https://custom.mcp.box.com' });
      expect((parsed as { serverUrl?: string }).serverUrl).toBe('https://custom.mcp.box.com');
    });
  });

  describe('validateUrls', () => {
    it('validates the serverUrl field', () => {
      expect(Box.validateUrls?.fields).toContain('serverUrl');
    });
  });

  describe('whoAmI action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.whoAmI.isTool).toBe(true);
    });

    it('calls who_am_i tool with no arguments', async () => {
      const result = await Box.actions.whoAmI.handler(mockContext, {});

      expect(mockCallTool).toHaveBeenCalledWith({ name: 'who_am_i', arguments: {} });
      expect(result).toEqual(mockJson);
    });
  });

  describe('searchFilesKeyword action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.searchFilesKeyword.isTool).toBe(true);
    });

    it('calls search_files_keyword with query and default limit', async () => {
      const input = parse('searchFilesKeyword', { query: 'Q3 budget' });
      await Box.actions.searchFilesKeyword.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_files_keyword',
        arguments: {
          query: 'Q3 budget',
          limit: 20,
          offset: undefined,
          folder_id: undefined,
        },
      });
    });

    it('passes optional offset and folderId', async () => {
      await Box.actions.searchFilesKeyword.handler(mockContext, {
        query: 'report',
        limit: 10,
        offset: 20,
        folderId: '987654321',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_files_keyword',
        arguments: {
          query: 'report',
          limit: 10,
          offset: 20,
          folder_id: '987654321',
        },
      });
    });
  });

  describe('searchFoldersByName action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.searchFoldersByName.isTool).toBe(true);
    });

    it('calls search_folders_by_name with query and default limit', async () => {
      const input = parse('searchFoldersByName', { query: 'Projects' });
      await Box.actions.searchFoldersByName.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_folders_by_name',
        arguments: { query: 'Projects', limit: 20 },
      });
    });

    it('passes custom limit', async () => {
      await Box.actions.searchFoldersByName.handler(mockContext, {
        query: 'Finance',
        limit: 5,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_folders_by_name',
        arguments: { query: 'Finance', limit: 5 },
      });
    });
  });

  describe('listFolderContent action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.listFolderContent.isTool).toBe(true);
    });

    it('calls list_folder_content_by_folder_id with folder ID and default limit', async () => {
      const input = parse('listFolderContent', { folderId: '0' });
      await Box.actions.listFolderContent.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_folder_content_by_folder_id',
        arguments: { folder_id: '0', limit: 100 },
      });
    });

    it('passes custom limit', async () => {
      await Box.actions.listFolderContent.handler(mockContext, {
        folderId: '123456789',
        limit: 50,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_folder_content_by_folder_id',
        arguments: { folder_id: '123456789', limit: 50 },
      });
    });
  });

  describe('getFileContent action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getFileContent.isTool).toBe(true);
    });

    it('calls get_file_content with file ID and returns content', async () => {
      const result = await Box.actions.getFileContent.handler(mockContext, {
        fileId: '987654321',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_content',
        arguments: { file_id: '987654321' },
      });
      // callToolContent returns the raw content parts
      expect(result).toEqual(mockContent);
    });
  });

  describe('getFileDetails action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getFileDetails.isTool).toBe(true);
    });

    it('calls get_file_details with file ID', async () => {
      const result = await Box.actions.getFileDetails.handler(mockContext, {
        fileId: '111222333',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_details',
        arguments: { file_id: '111222333' },
      });
      expect(result).toEqual(mockJson);
    });
  });

  describe('getFolderDetails action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getFolderDetails.isTool).toBe(true);
    });

    it('calls get_folder_details with folder ID', async () => {
      const result = await Box.actions.getFolderDetails.handler(mockContext, {
        folderId: '444555666',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_folder_details',
        arguments: { folder_id: '444555666' },
      });
      expect(result).toEqual(mockJson);
    });
  });

  describe('listRecentItems action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.listRecentItems.isTool).toBe(true);
    });

    it('calls list_recent_items with default limit', async () => {
      const input = parse('listRecentItems', {});
      await Box.actions.listRecentItems.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_recent_items',
        arguments: { limit: 100 },
      });
    });

    it('passes custom limit', async () => {
      await Box.actions.listRecentItems.handler(mockContext, { limit: 10 });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_recent_items',
        arguments: { limit: 10 },
      });
    });
  });

  describe('getComments action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getComments.isTool).toBe(true);
    });

    it('calls get_file_comments with file ID', async () => {
      await Box.actions.getComments.handler(mockContext, { fileId: '123456789' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_file_comments',
        arguments: { file_id: '123456789' },
      });
    });
  });

  describe('searchByMetadata action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.searchByMetadata.isTool).toBe(true);
    });

    it('calls search_by_metadata_query with required fields and defaults', async () => {
      const input = parse('searchByMetadata', {
        query: 'amount >= 100',
        templateKey: 'invoiceTemplate',
      });
      await Box.actions.searchByMetadata.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_by_metadata_query',
        arguments: {
          query: 'amount >= 100',
          template_key: 'invoiceTemplate',
          scope: 'enterprise',
          ancestor_folder_id: undefined,
          limit: 20,
        },
      });
    });

    it('passes all optional fields', async () => {
      await Box.actions.searchByMetadata.handler(mockContext, {
        query: 'status = "active"',
        templateKey: 'contractTemplate',
        scope: 'global',
        ancestorFolderId: '987654',
        limit: 50,
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'search_by_metadata_query',
        arguments: {
          query: 'status = "active"',
          template_key: 'contractTemplate',
          scope: 'global',
          ancestor_folder_id: '987654',
          limit: 50,
        },
      });
    });
  });

  describe('aiQaSingleFile action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.aiQaSingleFile.isTool).toBe(true);
    });

    it('calls ai_qa_single_file with file ID and prompt', async () => {
      await Box.actions.aiQaSingleFile.handler(mockContext, {
        fileId: '123456789',
        prompt: 'What is the contract renewal date?',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_qa_single_file',
        arguments: {
          file_id: '123456789',
          question: 'What is the contract renewal date?',
        },
      });
    });
  });

  describe('aiQaMultiFile action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.aiQaMultiFile.isTool).toBe(true);
    });

    it('calls ai_qa_multi_file with file IDs and prompt', async () => {
      await Box.actions.aiQaMultiFile.handler(mockContext, {
        fileIds: ['111', '222', '333'],
        prompt: 'Compare the budget figures across these reports.',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_qa_multi_file',
        arguments: {
          file_ids: ['111', '222', '333'],
          question: 'Compare the budget figures across these reports.',
        },
      });
    });
  });

  describe('aiQaHub action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.aiQaHub.isTool).toBe(true);
    });

    it('calls ai_qa_hub with hub ID and prompt', async () => {
      await Box.actions.aiQaHub.handler(mockContext, {
        hubId: 'hub-abc123',
        prompt: 'What projects are currently in progress?',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_qa_hub',
        arguments: {
          hub_id: 'hub-abc123',
          question: 'What projects are currently in progress?',
        },
      });
    });
  });

  describe('aiExtractFreeform action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.aiExtractFreeform.isTool).toBe(true);
    });

    it('calls ai_extract_freeform with file ID and prompt', async () => {
      await Box.actions.aiExtractFreeform.handler(mockContext, {
        fileId: '999888777',
        prompt: 'Extract the vendor name, invoice date, and total amount.',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_extract_freeform',
        arguments: {
          file_id: '999888777',
          prompt: 'Extract the vendor name, invoice date, and total amount.',
        },
      });
    });
  });

  describe('aiExtractStructuredFromMetadataTemplate action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.aiExtractStructuredFromMetadataTemplate.isTool).toBe(true);
    });

    it('calls the tool with file ID, template key, and default scope', async () => {
      const input = parse('aiExtractStructuredFromMetadataTemplate', {
        fileId: '123',
        templateKey: 'invoiceTemplate',
      });
      await Box.actions.aiExtractStructuredFromMetadataTemplate.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_extract_structured_from_metadata_template',
        arguments: {
          file_id: '123',
          template_key: 'invoiceTemplate',
          scope: 'enterprise',
        },
      });
    });

    it('passes custom scope', async () => {
      await Box.actions.aiExtractStructuredFromMetadataTemplate.handler(mockContext, {
        fileId: '456',
        templateKey: 'globalTemplate',
        scope: 'global',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'ai_extract_structured_from_metadata_template',
        arguments: {
          file_id: '456',
          template_key: 'globalTemplate',
          scope: 'global',
        },
      });
    });
  });

  describe('listHubs action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.listHubs.isTool).toBe(true);
    });

    it('calls list_hubs with no arguments', async () => {
      await Box.actions.listHubs.handler(mockContext, {});

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_hubs',
        arguments: {},
      });
    });
  });

  describe('getHubDetails action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getHubDetails.isTool).toBe(true);
    });

    it('calls get_hub_details with hub ID', async () => {
      await Box.actions.getHubDetails.handler(mockContext, { hubId: 'hub-xyz' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_hub_details',
        arguments: { hub_id: 'hub-xyz' },
      });
    });
  });

  describe('getHubItems action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.getHubItems.isTool).toBe(true);
    });

    it('calls get_hub_items with hub ID', async () => {
      await Box.actions.getHubItems.handler(mockContext, { hubId: 'hub-xyz' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_hub_items',
        arguments: { hub_id: 'hub-xyz' },
      });
    });
  });

  describe('listTools action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.listTools.isTool).toBe(true);
    });

    it('returns the list of available tools', async () => {
      const result = await Box.actions.listTools.handler(mockContext, {});

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'who_am_i' }, { name: 'search_files_keyword' }]);
    });
  });

  describe('callTool action', () => {
    it('is exposed as a tool', () => {
      expect(Box.actions.callTool.isTool).toBe(true);
    });

    it('calls the named tool with provided arguments', async () => {
      const result = await Box.actions.callTool.handler(mockContext, {
        name: 'create_folder',
        arguments: { name: 'New Project', parent_folder_id: '0' },
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'create_folder',
        arguments: { name: 'New Project', parent_folder_id: '0' },
      });
      // callTool uses callToolContent which returns raw content parts
      expect(result).toEqual(mockContent);
    });

    it('calls the named tool with empty arguments when omitted', async () => {
      await Box.actions.callTool.handler(mockContext, { name: 'list_hubs' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_hubs',
        arguments: {},
      });
    });
  });

  describe('test handler', () => {
    it('returns ok with tool count on successful connection', async () => {
      if (!Box.test) {
        throw new Error('test handler not defined');
      }
      const result = await Box.test.handler(mockContext);

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Connected to Box MCP server. 2 tools available.',
      });
    });

    it('propagates errors thrown by withMcpClient', async () => {
      const { withMcpClient } = jest.requireMock('../../lib/mcp/with_mcp_client');
      withMcpClient.mockRejectedValueOnce(new Error('connection refused'));

      if (!Box.test) {
        throw new Error('test handler not defined');
      }

      await expect(Box.test.handler(mockContext)).rejects.toThrow('connection refused');
    });
  });

  describe('skill property', () => {
    it('is defined and contains multi-step guidance', () => {
      expect(Box.skill).toBeDefined();
      expect(typeof Box.skill).toBe('string');
      expect(Box.skill).toContain('searchFilesKeyword');
      expect(Box.skill).toContain('aiQaSingleFile');
      expect(Box.skill).toContain('listRecentItems');
      expect(Box.skill).toContain('searchByMetadata');
    });
  });
});
