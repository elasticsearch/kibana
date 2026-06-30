/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mcpClientType } from './mcp_client_type';
import { clientTypes } from '.';
import { McpClient, McpConnectionError } from '@kbn/mcp-client';
import type { FetchLike } from '@kbn/mcp-client';

jest.mock('@kbn/mcp-client', () => {
  const actual = jest.requireActual('@kbn/mcp-client');
  return {
    ...actual,
    McpClient: jest.fn(),
  };
});

const MockMcpClient = McpClient as unknown as jest.Mock;

describe('clientTypes registry', () => {
  it('is closed; no register() export', () => {
    expect((clientTypes as Record<string, unknown>).register).toBeUndefined();
  });

  it('contains exactly { mcp }', () => {
    expect(Object.keys(clientTypes).sort()).toEqual(['mcp']);
    expect(clientTypes.mcp).toBe(mcpClientType);
  });

  it('each entry id matches its registry key', () => {
    expect(clientTypes.mcp.id).toBe('mcp');
  });
});

describe('mcpClientType', () => {
  const fakeLogger = {
    error: jest.fn(),
    info: jest.fn(),
  } as unknown as import('@kbn/logging').Logger;

  let fakeNetwork: { ensureUriAllowed: jest.Mock; ensureHostnameAllowed: jest.Mock };
  let fakeGetAuthHeaders: jest.Mock;
  let mockConnect: jest.Mock;
  let mockTerminate: jest.Mock;
  let mockClientInstance: { connect: jest.Mock; terminate: jest.Mock };

  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeNetwork = { ensureUriAllowed: jest.fn(), ensureHostnameAllowed: jest.fn() };
    fakeGetAuthHeaders = jest.fn().mockResolvedValue({ Authorization: 'Bearer test-token' });
    mockConnect = jest.fn().mockResolvedValue(undefined);
    mockTerminate = jest.fn().mockResolvedValue(undefined);
    mockClientInstance = { connect: mockConnect, terminate: mockTerminate };
    MockMcpClient.mockImplementation(() => mockClientInstance);
    global.fetch = jest.fn().mockResolvedValue(new Response('ok'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const makeBuildContext = (overrides: Record<string, unknown> = {}) => ({
    logger: fakeLogger,
    axiosInstance: {} as unknown as import('axios').AxiosInstance,
    config: { serverUrl: 'http://mcp.example.com' },
    network: fakeNetwork,
    credential: { getAuthHeaders: fakeGetAuthHeaders },
    ...overrides,
  });

  describe('build', () => {
    it('constructs McpClient with guarded fetch, then connects', async () => {
      const ctx = makeBuildContext();
      const result = await mcpClientType.build(ctx);

      expect(MockMcpClient).toHaveBeenCalledWith(
        fakeLogger,
        {
          name: 'kibana-mcp-http://mcp.example.com',
          version: '1.0.0',
          url: 'http://mcp.example.com',
        },
        { fetch: expect.any(Function) }
      );
      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockClientInstance);
    });

    it('invokes ctx.network.ensureUriAllowed with the serverUrl during build', async () => {
      const ctx = makeBuildContext();
      await mcpClientType.build(ctx);

      expect(fakeNetwork.ensureUriAllowed).toHaveBeenCalledWith('http://mcp.example.com');
    });

    it('rejects before connecting when the guard denies the serverUrl', async () => {
      fakeNetwork.ensureUriAllowed.mockImplementation(() => {
        throw new Error('target url "http://denied.example.com" is not added to the Kibana config');
      });

      const ctx = makeBuildContext({ config: { serverUrl: 'http://denied.example.com' } });
      await expect(mcpClientType.build(ctx)).rejects.toThrow(
        'target url "http://denied.example.com" is not added to the Kibana config'
      );

      expect(MockMcpClient).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('guardedFetch calls getAuthHeaders and merges auth headers into the outgoing request', async () => {
      fakeGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer merged-token' });

      const ctx = makeBuildContext();
      await mcpClientType.build(ctx);

      const [, , options] = MockMcpClient.mock.calls[0] as [unknown, unknown, { fetch: FetchLike }];
      const guardedFetch = options.fetch;

      fakeNetwork.ensureUriAllowed.mockClear();
      await guardedFetch('http://mcp.example.com/mcp', { method: 'POST' });

      expect(fakeGetAuthHeaders).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://mcp.example.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
        })
      );

      const fetchInit = (global.fetch as jest.Mock).mock.calls[0][1] as { headers: Headers };
      expect(fetchInit.headers.get('Authorization')).toBe('Bearer merged-token');
    });

    it('guardedFetch calls ensureUriAllowed then delegates to native fetch', async () => {
      const ctx = makeBuildContext();
      await mcpClientType.build(ctx);

      const [, , options] = MockMcpClient.mock.calls[0] as [unknown, unknown, { fetch: FetchLike }];
      const guardedFetch = options.fetch;

      fakeNetwork.ensureUriAllowed.mockClear();
      fakeGetAuthHeaders.mockClear();
      await guardedFetch('http://mcp.example.com/mcp', { method: 'POST' });

      expect(fakeNetwork.ensureUriAllowed).toHaveBeenCalledWith('http://mcp.example.com/mcp');
      expect(fakeGetAuthHeaders).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://mcp.example.com/mcp',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('guardedFetch handles URL objects', async () => {
      const ctx = makeBuildContext();
      await mcpClientType.build(ctx);

      const [, , options] = MockMcpClient.mock.calls[0] as [unknown, unknown, { fetch: FetchLike }];
      const guardedFetch = options.fetch;

      fakeNetwork.ensureUriAllowed.mockClear();
      const urlObj = new URL('http://mcp.example.com/mcp');
      await guardedFetch(urlObj, {});

      expect(fakeNetwork.ensureUriAllowed).toHaveBeenCalledWith('http://mcp.example.com/mcp');
    });

    it('guardedFetch rejects when the guard denies the URL', async () => {
      const ctx = makeBuildContext();
      await mcpClientType.build(ctx);

      const [, , options] = MockMcpClient.mock.calls[0] as [unknown, unknown, { fetch: FetchLike }];
      const guardedFetch = options.fetch;

      fakeNetwork.ensureUriAllowed.mockImplementation(() => {
        throw new Error('URI not allowed');
      });

      await expect(guardedFetch('http://evil.example.com/mcp', {})).rejects.toThrow(
        'URI not allowed'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws if config.serverUrl is missing', async () => {
      const ctx = makeBuildContext({ config: {} });
      await expect(mcpClientType.build(ctx)).rejects.toThrow('config.serverUrl is required');
    });

    it('throws if config is undefined', async () => {
      const ctx = makeBuildContext({ config: undefined });
      await expect(mcpClientType.build(ctx)).rejects.toThrow('config.serverUrl is required');
    });
  });

  describe('terminate', () => {
    it('calls client.terminate()', async () => {
      await mcpClientType.terminate(
        mockClientInstance as unknown as import('@kbn/mcp-client').McpClient
      );
      expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
  });

  describe('isUserError', () => {
    const isUserError = mcpClientType.isUserError as (err: unknown) => boolean;

    it('returns true for the missing serverUrl pre-connect error', () => {
      expect(isUserError(new Error('config.serverUrl is required'))).toBe(true);
    });

    it('returns false for other Error instances', () => {
      expect(isUserError(new Error('something else went wrong'))).toBe(false);
      expect(isUserError(new Error('Error connecting to MCP server: timeout'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isUserError('config.serverUrl is required')).toBe(false);
      expect(isUserError(null)).toBe(false);
      expect(isUserError(undefined)).toBe(false);
    });

    it('returns true for McpConnectionError with httpStatus 401', () => {
      expect(isUserError(new McpConnectionError('Unauthorized', { httpStatus: 401 }))).toBe(true);
    });

    it('returns true for McpConnectionError with httpStatus 403', () => {
      expect(isUserError(new McpConnectionError('Forbidden', { httpStatus: 403 }))).toBe(true);
    });

    it('returns false for McpConnectionError with httpStatus 500', () => {
      expect(isUserError(new McpConnectionError('Server error', { httpStatus: 500 }))).toBe(false);
    });

    it('returns false for McpConnectionError with no httpStatus', () => {
      expect(isUserError(new McpConnectionError('Unknown connection error'))).toBe(false);
    });
  });
});
