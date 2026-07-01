/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('../../../library', () => {
  const actual = jest.requireActual('../../../library');
  return {
    ...actual,
    LibraryService: jest.fn(),
  };
});

import type { Logger } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { WORKFLOWS_LIBRARY_ENABLED_SETTING_ID } from '@kbn/workflows';

import { registerLibraryRoutes } from '.';
import { LibraryFetchError, LibraryNotFoundError, LibraryService } from '../../../library';
import type { RouteDependencies } from '../types';

const TEMPLATES_PATH = '/internal/workflows/library/templates';
const TEMPLATE_PATH = '/internal/workflows/library/templates/{slug}';
const HEALTH_PATH = '/internal/workflows/library/health';

const MockedLibraryService = LibraryService as jest.MockedClass<typeof LibraryService>;

describe('Library Routes', () => {
  type MockRouteHandler = (
    context: typeof mockContext,
    request: ReturnType<typeof httpServerMock.createKibanaRequest>,
    response: ReturnType<typeof httpServerMock.createResponseFactory>
  ) => Promise<unknown>;

  let routeHandlers: Record<string, { handler: MockRouteHandler }>;
  let mockLibraryService: {
    listTemplates: jest.Mock;
    getTemplate: jest.Mock;
    getHealth: jest.Mock;
  };
  let mockGlobalUiSettings: { get: jest.Mock };

  const setToggle = (value: boolean) => mockGlobalUiSettings.get.mockResolvedValue(value);

  const mockContext = {
    workflows: Promise.resolve({ isWorkflowsAvailable: true }),
    licensing: Promise.resolve({
      license: {
        isAvailable: true,
        isActive: true,
        hasAtLeast: jest.fn().mockReturnValue(true),
        type: 'enterprise',
      },
    }),
    core: Promise.resolve({
      uiSettings: {
        get globalClient() {
          return mockGlobalUiSettings;
        },
      },
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routeHandlers = {};
    mockLibraryService = {
      listTemplates: jest.fn(),
      getTemplate: jest.fn(),
      getHealth: jest.fn(),
    };
    mockGlobalUiSettings = { get: jest.fn().mockResolvedValue(true) };

    MockedLibraryService.mockImplementation(() => mockLibraryService as unknown as LibraryService);

    const createVersionedRoute = (method: string, path: string) => ({
      addVersion: jest.fn().mockImplementation((_config: unknown, handler: MockRouteHandler) => {
        routeHandlers[`${method}:${path}`] = { handler };
        return { addVersion: jest.fn() };
      }),
    });

    const mockRouter = {
      versioned: {
        get: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('GET', config.path)
          ),
        post: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('POST', config.path)
          ),
      },
    };

    const logger: Logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      get: jest.fn().mockReturnThis(),
    } as unknown as Logger;

    const routeDependencies: RouteDependencies = {
      router: mockRouter,
      config: {
        library: { ttlMs: 600_000 },
      },
      workflowsService: {
        kibanaVersion: '9.5.0',
        plugins: { serverless: undefined },
      },
      logger,
    } as unknown as RouteDependencies;

    registerLibraryRoutes(routeDependencies);
  });

  describe('route registration', () => {
    it('should register the templates route handler', () => {
      expect(routeHandlers[`GET:${TEMPLATES_PATH}`]).toBeDefined();
      expect(routeHandlers[`GET:${TEMPLATES_PATH}`].handler).toEqual(expect.any(Function));
    });

    it('should register the single-template route handler', () => {
      expect(routeHandlers[`GET:${TEMPLATE_PATH}`]).toBeDefined();
      expect(routeHandlers[`GET:${TEMPLATE_PATH}`].handler).toEqual(expect.any(Function));
    });

    it('should register the library health route handler', () => {
      expect(routeHandlers[`GET:${HEALTH_PATH}`]).toBeDefined();
      expect(routeHandlers[`GET:${HEALTH_PATH}`].handler).toEqual(expect.any(Function));
    });

    it('should construct a single LibraryService for the three routes', () => {
      expect(MockedLibraryService).toHaveBeenCalledTimes(1);
    });
  });

  describe(`GET ${TEMPLATES_PATH}`, () => {
    it('should pass query filters to the service and return 200 with the templates', async () => {
      setToggle(true);
      mockLibraryService.listTemplates.mockResolvedValue([{ slug: 'demo' }]);

      const response = httpServerMock.createResponseFactory();
      const request = httpServerMock.createKibanaRequest({
        query: { solution: 'security', category: 'enrichment' },
      });

      await routeHandlers[`GET:${TEMPLATES_PATH}`].handler(mockContext, request, response);

      expect(mockGlobalUiSettings.get).toHaveBeenCalledWith(WORKFLOWS_LIBRARY_ENABLED_SETTING_ID);
      expect(mockLibraryService.listTemplates).toHaveBeenCalledWith({
        solution: 'security',
        category: 'enrichment',
      });
      expect(response.ok).toHaveBeenCalledWith({ body: { templates: [{ slug: 'demo' }] } });
    });

    it('should short-circuit with 503 when the toggle is off and not call the service', async () => {
      setToggle(false);

      const response = httpServerMock.createResponseFactory();

      await routeHandlers[`GET:${TEMPLATES_PATH}`].handler(
        mockContext,
        httpServerMock.createKibanaRequest(),
        response
      );

      expect(mockLibraryService.listTemplates).not.toHaveBeenCalled();
      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: expect.stringMatching(/disabled/i) },
      });
    });

    it('should map a LibraryFetchError to 503 with the underlying message', async () => {
      setToggle(true);
      mockLibraryService.listTemplates.mockRejectedValue(
        new LibraryFetchError('Catalog not ready', 'unavailable')
      );

      const response = httpServerMock.createResponseFactory();

      await routeHandlers[`GET:${TEMPLATES_PATH}`].handler(
        mockContext,
        httpServerMock.createKibanaRequest(),
        response
      );

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: 'Catalog not ready' },
      });
    });

    it('should map an unexpected error to 500 via the error mapper', async () => {
      setToggle(true);
      mockLibraryService.listTemplates.mockRejectedValue(new Error('boom'));

      const response = httpServerMock.createResponseFactory();

      await routeHandlers[`GET:${TEMPLATES_PATH}`].handler(
        mockContext,
        httpServerMock.createKibanaRequest(),
        response
      );

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: expect.stringContaining('boom') },
      });
    });
  });

  describe(`GET ${TEMPLATE_PATH}`, () => {
    it('should pass the slug to the service and return 200 with the body', async () => {
      setToggle(true);
      const body = { metadata: { slug: 'demo' }, raw: 'yaml' };
      mockLibraryService.getTemplate.mockResolvedValue(body);

      const response = httpServerMock.createResponseFactory();
      const request = httpServerMock.createKibanaRequest({ params: { slug: 'demo' } });

      await routeHandlers[`GET:${TEMPLATE_PATH}`].handler(mockContext, request, response);

      expect(mockLibraryService.getTemplate).toHaveBeenCalledWith('demo');
      expect(response.ok).toHaveBeenCalledWith({ body });
    });

    it('should map LibraryNotFoundError to 404', async () => {
      setToggle(true);
      mockLibraryService.getTemplate.mockRejectedValue(new LibraryNotFoundError('missing'));

      const response = httpServerMock.createResponseFactory();
      const request = httpServerMock.createKibanaRequest({ params: { slug: 'missing' } });

      await routeHandlers[`GET:${TEMPLATE_PATH}`].handler(mockContext, request, response);

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: expect.stringContaining('"missing"') },
      });
    });

    it('should short-circuit with 503 when the toggle is off', async () => {
      setToggle(false);

      const response = httpServerMock.createResponseFactory();
      const request = httpServerMock.createKibanaRequest({ params: { slug: 'demo' } });

      await routeHandlers[`GET:${TEMPLATE_PATH}`].handler(mockContext, request, response);

      expect(mockLibraryService.getTemplate).not.toHaveBeenCalled();
      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: expect.any(String) },
      });
    });
  });

  describe(`GET ${HEALTH_PATH}`, () => {
    it('should return 200 with the diagnostic payload + toggle state when enabled', async () => {
      setToggle(true);
      mockLibraryService.getHealth.mockReturnValue({
        sourceMode: 'http',
        lastRefreshAt: '2026-06-01T12:00:00.000Z',
      });

      const response = httpServerMock.createResponseFactory();

      await routeHandlers[`GET:${HEALTH_PATH}`].handler(
        mockContext,
        httpServerMock.createKibanaRequest(),
        response
      );

      expect(mockLibraryService.getHealth).toHaveBeenCalledTimes(1);
      expect(response.ok).toHaveBeenCalledWith({
        body: {
          sourceMode: 'http',
          lastRefreshAt: '2026-06-01T12:00:00.000Z',
          enabled: true,
        },
      });
    });

    it('should still return 200 (with `enabled: false`) when the toggle is off — diagnostics are not gated', async () => {
      setToggle(false);
      mockLibraryService.getHealth.mockReturnValue({ sourceMode: 'http' });

      const response = httpServerMock.createResponseFactory();

      await routeHandlers[`GET:${HEALTH_PATH}`].handler(
        mockContext,
        httpServerMock.createKibanaRequest(),
        response
      );

      expect(mockLibraryService.getHealth).toHaveBeenCalledTimes(1);
      expect(response.ok).toHaveBeenCalledWith({
        body: { sourceMode: 'http', enabled: false },
      });
      expect(response.customError).not.toHaveBeenCalled();
    });
  });
});
