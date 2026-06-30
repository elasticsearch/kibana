/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { TavilyConnector } from './tavily';

const mockCallTool = jest.fn();
const mockListTools = jest.fn();

const parse = <K extends keyof typeof TavilyConnector.actions>(
  action: K,
  raw: Record<string, unknown>
) => TavilyConnector.actions[action].input.parse(raw);

describe('TavilyConnector', () => {
  const mockContext = {
    client: {},
    log: {},
    config: { serverUrl: 'https://mcp.tavily.com/mcp/' },
    getClient: () => Promise.resolve({ callTool: mockCallTool, listTools: mockListTools }),
  } as unknown as ActionContext;

  const mockJson = { ok: true };
  const mockContent = [{ type: 'text', text: JSON.stringify(mockJson) }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: mockContent });
    mockListTools.mockResolvedValue({
      tools: [{ name: 'tavily_search' }, { name: 'tavily_extract' }],
    });
  });

  describe('tavilySearch action', () => {
    it('applies defaults when only query is provided', async () => {
      const input = parse('tavilySearch', { query: 'elastic search' });
      await TavilyConnector.actions.tavilySearch.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_search',
        arguments: {
          query: 'elastic search',
          max_results: 10,
          search_depth: 'basic',
          include_raw_content: false,
        },
      });
    });

    it('passes custom search options', async () => {
      const input = parse('tavilySearch', {
        query: 'kibana',
        max_results: 5,
        search_depth: 'advanced',
        include_raw_content: true,
      });
      await TavilyConnector.actions.tavilySearch.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_search',
        arguments: {
          query: 'kibana',
          max_results: 5,
          search_depth: 'advanced',
          include_raw_content: true,
        },
      });
    });
  });

  describe('tavilyExtract action', () => {
    it('applies defaults when only urls is provided', async () => {
      const input = parse('tavilyExtract', { urls: ['https://example.com'] });
      await TavilyConnector.actions.tavilyExtract.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_extract',
        arguments: {
          urls: ['https://example.com'],
          extract_depth: 'basic',
          include_images: false,
        },
      });
    });

    it('passes custom extract options', async () => {
      const input = parse('tavilyExtract', {
        urls: ['https://example.com', 'https://other.com'],
        extract_depth: 'advanced',
        include_images: true,
      });
      await TavilyConnector.actions.tavilyExtract.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_extract',
        arguments: {
          urls: ['https://example.com', 'https://other.com'],
          extract_depth: 'advanced',
          include_images: true,
        },
      });
    });
  });

  describe('tavilyCrawl action', () => {
    it('applies defaults when only url is provided', async () => {
      const input = parse('tavilyCrawl', { url: 'https://example.com' });
      await TavilyConnector.actions.tavilyCrawl.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_crawl',
        arguments: {
          url: 'https://example.com',
          max_depth: 1,
          max_breadth: 20,
          limit: 50,
          instructions: undefined,
          extract_depth: 'basic',
        },
      });
    });

    it('passes custom crawl options', async () => {
      const input = parse('tavilyCrawl', {
        url: 'https://example.com',
        max_depth: 3,
        max_breadth: 10,
        limit: 100,
        instructions: 'only blog posts',
        extract_depth: 'advanced',
      });
      await TavilyConnector.actions.tavilyCrawl.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_crawl',
        arguments: {
          url: 'https://example.com',
          max_depth: 3,
          max_breadth: 10,
          limit: 100,
          instructions: 'only blog posts',
          extract_depth: 'advanced',
        },
      });
    });
  });

  describe('tavilyMap action', () => {
    it('applies defaults when only url is provided', async () => {
      const input = parse('tavilyMap', { url: 'https://example.com' });
      await TavilyConnector.actions.tavilyMap.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_map',
        arguments: {
          url: 'https://example.com',
          max_depth: 1,
          max_breadth: 20,
          limit: 50,
          instructions: undefined,
        },
      });
    });

    it('passes custom map options', async () => {
      const input = parse('tavilyMap', {
        url: 'https://example.com',
        max_depth: 2,
        max_breadth: 15,
        limit: 25,
        instructions: 'documentation pages only',
      });
      await TavilyConnector.actions.tavilyMap.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_map',
        arguments: {
          url: 'https://example.com',
          max_depth: 2,
          max_breadth: 15,
          limit: 25,
          instructions: 'documentation pages only',
        },
      });
    });
  });

  describe('listTools action', () => {
    it('returns the list of available tools', async () => {
      const result = await TavilyConnector.actions.listTools.handler(mockContext, {});

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'tavily_search' }, { name: 'tavily_extract' }]);
    });
  });

  describe('callTool action', () => {
    it('calls the named tool with provided arguments', async () => {
      const result = await TavilyConnector.actions.callTool.handler(mockContext, {
        name: 'tavily_search',
        arguments: { query: 'test' },
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_search',
        arguments: { query: 'test' },
      });
      expect(result).toEqual(mockContent);
    });

    it('calls the named tool with no arguments when omitted', async () => {
      await TavilyConnector.actions.callTool.handler(mockContext, { name: 'tavily_search' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'tavily_search',
        arguments: {},
      });
    });
  });

  describe('test handler', () => {
    it('returns ok with tool count on successful connection', async () => {
      if (!TavilyConnector.test) {
        throw new Error('test handler not defined');
      }
      const result = await TavilyConnector.test.handler(mockContext);

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Connected to Tavily MCP server. 2 tools available.',
      });
    });

    it('propagates build errors from getClient', async () => {
      const failCtx = {
        ...mockContext,
        getClient: () => Promise.reject(new Error('connection refused')),
      } as unknown as ActionContext;

      if (!TavilyConnector.test) {
        throw new Error('test handler not defined');
      }

      await expect(TavilyConnector.test.handler(failCtx)).rejects.toThrow('connection refused');
    });
  });
});
