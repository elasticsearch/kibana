/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import {
  buildMockContext,
  createMockSmlService,
  createTestCoreSetup,
  createTestCoreSetupNoSpaces,
  httpServerMock,
  httpServiceMock,
  sampleDocument,
} from './test_helpers';
import { registerListRoute } from './list';
import { SmlResultWindowExceededError } from '../services/sml/sml_errors';

describe('registerListRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;
  let handler: Function;
  let mockSmlService: ReturnType<typeof createMockSmlService>;
  const logger = loggingSystemMock.create().get();

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    mockSmlService = createMockSmlService();

    registerListRoute({
      router: router as any,
      coreSetup: createTestCoreSetup() as any,
      logger,
      getSmlService: () => mockSmlService as any,
    });

    const [, registeredHandler] = router.get.mock.calls[0];
    handler = registeredHandler;
  });

  const callHandler = async (query: Record<string, unknown>, uiSettingsEnabled = true) => {
    const request = httpServerMock.createKibanaRequest({ query });
    const response = httpServerMock.createResponseFactory();
    await handler(buildMockContext(uiSettingsEnabled), request, response);
    return response;
  };

  it('returns 404 when feature flag is disabled', async () => {
    const response = await callHandler({ page: 1, per_page: 20 }, false);
    expect(response.notFound).toHaveBeenCalled();
    expect(mockSmlService.listDocuments).not.toHaveBeenCalled();
  });

  it('returns 200 with paginated results and metadata', async () => {
    mockSmlService.listDocuments.mockResolvedValue({ total: 1, results: [sampleDocument] });
    mockSmlService.checkItemsAccess.mockResolvedValue(new Map([['chunk-1', true]]));
    const response = await callHandler({ page: 1, per_page: 20 });
    expect(response.ok).toHaveBeenCalledWith({
      body: {
        page: 1,
        per_page: 20,
        items: [expect.objectContaining({ id: sampleDocument.id, origin: sampleDocument.origin })],
      },
    });
  });

  it('filters out unauthorized items', async () => {
    const doc2 = { ...sampleDocument, id: 'chunk-2' };
    mockSmlService.listDocuments.mockResolvedValue({
      total: 2,
      results: [sampleDocument, doc2],
    });
    mockSmlService.checkItemsAccess.mockResolvedValue(
      new Map([
        ['chunk-1', true],
        ['chunk-2', false],
      ])
    );
    const response = await callHandler({ page: 1, per_page: 20 });
    expect(response.ok).toHaveBeenCalledWith({
      body: expect.objectContaining({
        items: [expect.objectContaining({ id: sampleDocument.id, origin: sampleDocument.origin })],
      }),
    });
  });

  it('passes filters and pagination to sml.listDocuments', async () => {
    mockSmlService.listDocuments.mockResolvedValue({ total: 0, results: [] });
    await callHandler({
      page: 2,
      per_page: 5,
      type: 'dashboard',
      origin_uri: 'dashboard://dash-1',
    });
    expect(mockSmlService.listDocuments).toHaveBeenCalledWith({
      spaceId: 'test-space',
      esClient: expect.any(Object),
      page: 2,
      perPage: 5,
      type: 'dashboard',
      originUri: 'dashboard://dash-1',
    });
  });

  it('passes tags filter to sml.listDocuments when provided (comma-delimited)', async () => {
    mockSmlService.listDocuments.mockResolvedValue({ total: 0, results: [] });
    await callHandler({ page: 1, per_page: 20, tags: 'otel,claude-code' });
    expect(mockSmlService.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['otel', 'claude-code'] })
    );
  });

  it('omits tags from sml.listDocuments when not provided', async () => {
    mockSmlService.listDocuments.mockResolvedValue({ total: 0, results: [] });
    await callHandler({ page: 1, per_page: 20 });
    expect(mockSmlService.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tags: undefined })
    );
  });

  it('falls back to default space when spaces plugin is unavailable', async () => {
    const localRouter = httpServiceMock.createRouter();
    registerListRoute({
      router: localRouter as any,
      coreSetup: createTestCoreSetupNoSpaces() as any,
      logger,
      getSmlService: () => mockSmlService as any,
    });

    const [, localHandler] = localRouter.get.mock.calls[0];
    const request = httpServerMock.createKibanaRequest({ query: { page: 1, per_page: 20 } });
    const response = httpServerMock.createResponseFactory();

    mockSmlService.listDocuments.mockResolvedValue({ total: 0, results: [] });
    await localHandler(buildMockContext(true), request, response);
    expect(mockSmlService.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'default' })
    );
  });

  it('propagates errors from sml.listDocuments', async () => {
    mockSmlService.listDocuments.mockRejectedValue(new Error('boom'));
    await expect(callHandler({ page: 1, per_page: 20 })).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('returns 400 when sml.listDocuments throws SmlResultWindowExceededError', async () => {
    mockSmlService.listDocuments.mockRejectedValue(
      new SmlResultWindowExceededError(
        'Result window is too large, from + size must be less than or equal to: [10000] but was [11000]'
      )
    );
    const response = await callHandler({ page: 11, per_page: 1000 });
    expect(response.badRequest).toHaveBeenCalledWith({
      body: { message: expect.stringContaining('Result window is too large') },
    });
  });
});
