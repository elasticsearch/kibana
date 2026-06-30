/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import type { SmlAutocompleteResult } from '../services/sml/types';
import { registerAutocompleteRoute } from './autocomplete';

const createMockSmlService = () => ({
  search: jest.fn(),
  autocomplete: jest.fn(),
  checkItemsAccess: jest.fn(),
  indexAttachment: jest.fn(),
  getDocuments: jest.fn(),
  getTypeDefinition: jest.fn(),
  listTypeDefinitions: jest.fn(),
  getCrawler: jest.fn(),
});

const createMockUiSettingsClient = (enabled = true) => ({
  get: jest.fn().mockImplementation(async (key: string) => {
    if (key === CONTEXT_ENGINE_ENABLED_SETTING_ID) return enabled;
    return undefined;
  }),
});

describe('registerAutocompleteRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;
  let handler: Function;
  let mockSmlService: ReturnType<typeof createMockSmlService>;
  const logger = loggingSystemMock.create().get();

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    mockSmlService = createMockSmlService();

    const coreSetup = coreMock.createSetup();
    (coreSetup.getStartServices as jest.Mock).mockResolvedValue([
      {},
      { spaces: { spacesService: { getSpaceId: jest.fn().mockReturnValue('test-space') } } },
      {},
    ]);

    registerAutocompleteRoute({
      router: router as any,
      coreSetup: coreSetup as any,
      logger,
      getSmlService: () => mockSmlService as any,
    });

    const [, registeredHandler] = router.post.mock.calls[0];
    handler = registeredHandler;
  });

  const callHandler = async (body: Record<string, unknown>, uiSettingsEnabled = true) => {
    const request = httpServerMock.createKibanaRequest({ body });
    const response = httpServerMock.createResponseFactory();
    const mockUiSettings = createMockUiSettingsClient(uiSettingsEnabled);
    const ctx = {
      core: Promise.resolve({
        uiSettings: { client: mockUiSettings },
        elasticsearch: { client: { asInternalUser: {}, asCurrentUser: {} } },
      }),
    };
    await handler(ctx, request, response);
    return response;
  };

  it('returns 404 when feature flag is disabled', async () => {
    const response = await callHandler({ query: 'git', size: 5 }, false);
    expect(response.notFound).toHaveBeenCalled();
    expect(mockSmlService.autocomplete).not.toHaveBeenCalled();
  });

  it('returns 200 with autocomplete results and per-row provenance when enabled', async () => {
    const mockResults: SmlAutocompleteResult[] = [
      {
        id: 'chunk-1',
        type: 'connector',
        title: 'GitHub Connector',
        origin: { uri: 'gh-1' },
        spaces: ['test-space'],
        permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
        matched_discovery_labels: [
          { value: 'GitHub Connector', kind: 'title' },
          { value: 'github', kind: 'tagline' },
        ],
      },
    ];
    mockSmlService.autocomplete.mockResolvedValue({ results: mockResults });

    const response = await callHandler({ query: 'git', size: 10 });
    expect(response.ok).toHaveBeenCalledWith({
      body: {
        results: [
          {
            id: 'chunk-1',
            type: 'connector',
            origin: { uri: 'gh-1' },
            title: 'GitHub Connector',
            matched_discovery_labels: [
              { value: 'GitHub Connector', kind: 'title' },
              { value: 'github', kind: 'tagline' },
            ],
          },
        ],
      },
    });
  });

  it('returns matched_discovery_labels as [] when absent on the result', async () => {
    const mockResults: SmlAutocompleteResult[] = [
      {
        id: 'chunk-2',
        type: 'dashboard',
        title: 'Sales Q3',
        origin: { uri: 'dash-1' },
        spaces: ['test-space'],
        permissions: { kibana: { privileges: [] }, elasticsearch: { indices: [] } },
      },
    ];
    mockSmlService.autocomplete.mockResolvedValue({ results: mockResults });

    const response = await callHandler({ query: 'sal', size: 5 });
    const body = response.ok.mock.calls[0][0]?.body as Record<string, unknown>;
    const results = (body as any).results;
    expect(results[0].matched_discovery_labels).toEqual([]);
  });

  it('does not leak server-only fields (permissions, spaces) into the HTTP response', async () => {
    const mockResults: SmlAutocompleteResult[] = [
      {
        id: 'chunk-3',
        type: 'visualization',
        title: 'V',
        origin: { uri: 'v-1' },
        spaces: ['test-space'],
        permissions: {
          kibana: { privileges: [{ name: 'saved_object:visualization/get' }] },
          elasticsearch: { indices: [] },
        },
      },
    ];
    mockSmlService.autocomplete.mockResolvedValue({ results: mockResults });

    const response = await callHandler({ query: 'v' });
    const body = response.ok.mock.calls[0][0]?.body as Record<string, unknown>;
    const results = (body as any).results;
    expect(results[0]).not.toHaveProperty('permissions');
    expect(results[0]).not.toHaveProperty('spaces');
  });

  it('passes spaceId from spaces plugin to sml.autocomplete', async () => {
    mockSmlService.autocomplete.mockResolvedValue({ results: [] });
    await callHandler({ query: 'test' });
    expect(mockSmlService.autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'test-space' })
    );
  });

  it('falls back to default space when spaces plugin is unavailable', async () => {
    const coreSetup = coreMock.createSetup();
    (coreSetup.getStartServices as jest.Mock).mockResolvedValue([{}, {}, {}]);

    const localRouter = httpServiceMock.createRouter();
    registerAutocompleteRoute({
      router: localRouter as any,
      coreSetup: coreSetup as any,
      logger,
      getSmlService: () => mockSmlService as any,
    });

    const [, localHandler] = localRouter.post.mock.calls[0];
    const request = httpServerMock.createKibanaRequest({ body: { query: 'test' } });
    const response = httpServerMock.createResponseFactory();
    const ctx = {
      core: Promise.resolve({
        uiSettings: { client: createMockUiSettingsClient(true) },
        elasticsearch: { client: {} },
      }),
    };

    mockSmlService.autocomplete.mockResolvedValue({ results: [] });
    await localHandler(ctx, request, response);
    expect(mockSmlService.autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'default' })
    );
  });

  it('propagates errors from sml.autocomplete', async () => {
    mockSmlService.autocomplete.mockRejectedValue(new Error('ES connection failed'));
    await expect(callHandler({ query: 'test' })).rejects.toThrow('ES connection failed');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ES connection failed'));
  });
});
