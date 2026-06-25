/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { IRouter } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { registerIndexMappingRoutes, INDEX_MAPPINGS_PATH } from './index_mapping_route';
import type { AutomaticImportPluginRequestHandlerContext } from '../types';

describe('Index mapping route', () => {
  let routeHandler: (
    context: AutomaticImportPluginRequestHandlerContext,
    request: unknown,
    response: unknown
  ) => Promise<unknown>;
  let mockGetMapping: jest.Mock;
  let mockResponse: { ok: jest.Mock; custom: jest.Mock };

  const createMockContext = (): AutomaticImportPluginRequestHandlerContext =>
    ({
      automaticImport: Promise.resolve({
        esClient: { indices: { getMapping: mockGetMapping } },
        isAvailable: () => true,
      }),
    } as unknown as AutomaticImportPluginRequestHandlerContext);

  beforeEach(() => {
    mockGetMapping = jest.fn();
    mockResponse = {
      ok: jest.fn().mockImplementation((value) => value),
      custom: jest.fn().mockImplementation((value) => value),
    };

    const routeHandlers: Record<string, { handler: typeof routeHandler }> = {};
    const mockRouter = {
      versioned: {
        get: jest.fn().mockImplementation((config: { path: string }) => ({
          addVersion: jest
            .fn()
            .mockImplementation((_versionConfig: unknown, handler: typeof routeHandler) => {
              routeHandlers[`GET:${config.path}`] = { handler };
              return { addVersion: jest.fn() };
            }),
        })),
        post: jest.fn().mockReturnValue({ addVersion: jest.fn() }),
        delete: jest.fn().mockReturnValue({ addVersion: jest.fn() }),
        patch: jest.fn().mockReturnValue({ addVersion: jest.fn() }),
        put: jest.fn().mockReturnValue({ addVersion: jest.fn() }),
      },
    };

    registerIndexMappingRoutes(
      mockRouter as unknown as IRouter<AutomaticImportPluginRequestHandlerContext>,
      loggingSystemMock.create().get()
    );
    routeHandler = routeHandlers[`GET:${INDEX_MAPPINGS_PATH}`]?.handler;
    expect(routeHandler).toBeDefined();
  });

  it('returns the mappings for a concrete index keyed by its name', async () => {
    const mappings = { properties: { event: { properties: { original: { type: 'keyword' } } } } };
    mockGetMapping.mockResolvedValue({ 'my-index': { mappings } });

    const request = { params: { index_name: 'my-index' } };
    const result = await routeHandler!(createMockContext(), request, mockResponse);

    expect(mockGetMapping).toHaveBeenCalledWith({ index: 'my-index', expand_wildcards: 'none' });
    expect(result).toEqual({ body: { mappings } });
  });

  it('returns the mappings for a data stream keyed by its backing index', async () => {
    // Elasticsearch resolves the data stream to its backing indices, so the
    // response is keyed by the backing index name, not the requested name.
    const mappings = { properties: { event: { properties: { original: { type: 'keyword' } } } } };
    mockGetMapping.mockResolvedValue({ '.ds-my-data-stream-2024.01.01-000001': { mappings } });

    const request = { params: { index_name: 'my-data-stream' } };
    const result = await routeHandler!(createMockContext(), request, mockResponse);

    expect(result).toEqual({ body: { mappings } });
  });

  it('returns undefined mappings when the response is empty', async () => {
    mockGetMapping.mockResolvedValue({});

    const request = { params: { index_name: 'my-index' } };
    const result = await routeHandler!(createMockContext(), request, mockResponse);

    expect(result).toEqual({ body: { mappings: undefined } });
  });

  it('returns a 404 when the index, data stream, or alias does not exist', async () => {
    const error = Object.assign(new Error('index_not_found_exception'), {
      meta: { body: { error: { type: 'index_not_found_exception' } } },
    });
    mockGetMapping.mockRejectedValue(error);

    const request = { params: { index_name: 'missing-index' } };
    await routeHandler!(createMockContext(), request, mockResponse);

    expect(mockResponse.ok).not.toHaveBeenCalled();
    expect(mockResponse.custom).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('returns a 403 when the user lacks privileges on the index', async () => {
    const error = Object.assign(new Error('security_exception'), {
      meta: { body: { error: { type: 'security_exception' } } },
    });
    mockGetMapping.mockRejectedValue(error);

    const request = { params: { index_name: 'restricted-index' } };
    await routeHandler!(createMockContext(), request, mockResponse);

    expect(mockResponse.ok).not.toHaveBeenCalled();
    expect(mockResponse.custom).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('returns a 500 for unexpected errors', async () => {
    mockGetMapping.mockRejectedValue(new Error('Boom'));

    const request = { params: { index_name: 'my-index' } };
    await routeHandler!(createMockContext(), request, mockResponse);

    expect(mockResponse.ok).not.toHaveBeenCalled();
    expect(mockResponse.custom).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });
});
