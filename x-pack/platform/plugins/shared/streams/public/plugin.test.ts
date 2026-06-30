/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Plugin } from './plugin';
import { coreMock } from '@kbn/core/public/mocks';
import type { StreamsRepositoryClient } from './api';

describe('Streams Plugin', () => {
  let plugin: Plugin;
  let mockRepositoryClient: jest.Mocked<StreamsRepositoryClient>;

  beforeEach(() => {
    plugin = new Plugin({
      env: {
        packageInfo: {
          buildFlavor: 'traditional',
        },
      },
      config: {
        get: () => ({}),
      },
      logger: {
        get: () => ({
          error: jest.fn(),
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockRepositoryClient = {
      fetch: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // @ts-expect-error accessing private property for testing
    plugin.repositoryClient = mockRepositoryClient;
  });

  afterEach(() => {
    plugin.stop();
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should initialize repository client', () => {
      const coreSetup = coreMock.createSetup();
      const result = plugin.setup(coreSetup, {});

      expect(result).toEqual({});
    });
  });

  describe('start', () => {
    it('should return plugin API with required methods', () => {
      const coreStart = coreMock.createStart();
      const start = plugin.start(coreStart, {});

      expect(start).toHaveProperty('streamsRepositoryClient');
      expect(start).toHaveProperty('navigationStatus$');
      expect(start).toHaveProperty('getWiredStatus');
      expect(start).toHaveProperty('getClassicStatus');
      expect(start).toHaveProperty('enableWiredMode');
      expect(start).toHaveProperty('disableWiredMode');
      expect(start).toHaveProperty('config$');

      expect(typeof start.getWiredStatus).toBe('function');
      expect(typeof start.getClassicStatus).toBe('function');
      expect(typeof start.enableWiredMode).toBe('function');
      expect(typeof start.disableWiredMode).toBe('function');
    });
  });

  describe('getWiredStatus', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let getWiredStatus: () => Promise<any>;

    beforeEach(() => {
      const coreStart = coreMock.createStart();
      const start = plugin.start(coreStart, {});
      getWiredStatus = start.getWiredStatus;
    });

    it('should fetch wired status from API successfully', async () => {
      const mockStatus = {
        logs: true,
        'logs.otel': true,
        'logs.ecs': true,
        can_manage: true,
      };

      mockRepositoryClient.fetch.mockResolvedValue(mockStatus);

      const result = await getWiredStatus();

      expect(mockRepositoryClient.fetch).toHaveBeenCalledWith(
        'GET /api/streams/_status',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return disabled status when API returns disabled streams', async () => {
      const mockStatus = {
        logs: false,
        'logs.otel': false,
        'logs.ecs': false,
        can_manage: true,
      };

      mockRepositoryClient.fetch.mockResolvedValue(mockStatus);

      const result = await getWiredStatus();

      expect(result).toEqual({
        logs: false,
        'logs.otel': false,
        'logs.ecs': false,
        can_manage: true,
      });
    });

    it('should return UNKNOWN_WIRED_STATUS on network error', async () => {
      mockRepositoryClient.fetch.mockRejectedValue(new Error('Network error'));

      const result = await getWiredStatus();

      expect(result).toEqual({
        logs: 'unknown',
        'logs.otel': 'unknown',
        'logs.ecs': 'unknown',
        can_manage: false,
      });
    });

    it('should return UNKNOWN_WIRED_STATUS on 404 error', async () => {
      mockRepositoryClient.fetch.mockRejectedValue({
        response: { status: 404 },
        message: 'Not found',
      });

      const result = await getWiredStatus();

      expect(result).toEqual({
        logs: 'unknown',
        'logs.otel': 'unknown',
        'logs.ecs': 'unknown',
        can_manage: false,
      });
    });

    it('should return UNKNOWN_WIRED_STATUS on 500 error', async () => {
      mockRepositoryClient.fetch.mockRejectedValue({
        response: { status: 500 },
        message: 'Internal server error',
      });

      const result = await getWiredStatus();

      expect(result).toEqual({
        logs: 'unknown',
        'logs.otel': 'unknown',
        'logs.ecs': 'unknown',
        can_manage: false,
      });
    });

    it('should log errors when fetch fails', async () => {
      const mockError = new Error('Network failure');
      const mockLogger = {
        error: jest.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.logger = mockLogger as any;

      mockRepositoryClient.fetch.mockRejectedValue(mockError);

      await getWiredStatus();

      expect(mockLogger.error).toHaveBeenCalledWith(mockError);
    });

    it('should create new AbortController for each call', async () => {
      mockRepositoryClient.fetch.mockResolvedValue({
        enabled: true,
        can_manage: true,
      } as unknown as Awaited<ReturnType<typeof mockRepositoryClient.fetch>>);

      await getWiredStatus();
      await getWiredStatus();

      expect(mockRepositoryClient.fetch).toHaveBeenCalledTimes(2);
      const firstCallSignal = mockRepositoryClient.fetch.mock.calls[0][1].signal;
      const secondCallSignal = mockRepositoryClient.fetch.mock.calls[1][1].signal;

      // Each call should have its own signal
      expect(firstCallSignal).toBeInstanceOf(AbortSignal);
      expect(secondCallSignal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('getClassicStatus', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let getClassicStatus: () => Promise<any>;

    beforeEach(() => {
      const coreStart = coreMock.createStart();
      const start = plugin.start(coreStart, {});
      getClassicStatus = start.getClassicStatus;
    });

    it('should fetch classic status from API successfully', async () => {
      const mockStatus = {
        can_manage: true,
      };

      mockRepositoryClient.fetch.mockResolvedValue(mockStatus);

      const result = await getClassicStatus();

      expect(mockRepositoryClient.fetch).toHaveBeenCalledWith(
        'GET /internal/streams/_classic_status',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return UNKNOWN_CLASSIC_STATUS on error', async () => {
      mockRepositoryClient.fetch.mockRejectedValue(new Error('Network error'));

      const result = await getClassicStatus();

      expect(result).toEqual({
        can_manage: false,
      });
    });

    it('should log errors when fetch fails', async () => {
      const mockError = new Error('Network failure');
      const mockLogger = {
        error: jest.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.logger = mockLogger as any;

      mockRepositoryClient.fetch.mockRejectedValue(mockError);

      await getClassicStatus();

      expect(mockLogger.error).toHaveBeenCalledWith(mockError);
    });
  });

  describe('enableWiredMode', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let enableWiredMode: (signal: AbortSignal) => Promise<any>;

    beforeEach(() => {
      const coreStart = coreMock.createStart();
      const start = plugin.start(coreStart, {});
      enableWiredMode = start.enableWiredMode;
    });

    it('should call enable API endpoint', async () => {
      const mockResponse = { acknowledged: true };
      mockRepositoryClient.fetch.mockResolvedValue(mockResponse);

      const signal = new AbortController().signal;
      const result = await enableWiredMode(signal);

      expect(mockRepositoryClient.fetch).toHaveBeenCalledWith(
        'POST /api/streams/_enable 2023-10-31',
        { signal }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from API', async () => {
      const mockError = new Error('Enable failed');
      mockRepositoryClient.fetch.mockRejectedValue(mockError);

      const signal = new AbortController().signal;

      await expect(enableWiredMode(signal)).rejects.toThrow('Enable failed');
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      mockRepositoryClient.fetch.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new Error('Aborted'));
      });

      await expect(enableWiredMode(abortController.signal)).rejects.toThrow();
    });
  });

  describe('disableWiredMode', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let disableWiredMode: (signal: AbortSignal) => Promise<any>;

    beforeEach(() => {
      const coreStart = coreMock.createStart();
      const start = plugin.start(coreStart, {});
      disableWiredMode = start.disableWiredMode;
    });

    it('should call disable API endpoint', async () => {
      const mockResponse = { acknowledged: true };
      mockRepositoryClient.fetch.mockResolvedValue(mockResponse);

      const signal = new AbortController().signal;
      const result = await disableWiredMode(signal);

      expect(mockRepositoryClient.fetch).toHaveBeenCalledWith(
        'POST /api/streams/_disable 2023-10-31',
        { signal }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from API', async () => {
      const mockError = new Error('Disable failed');
      mockRepositoryClient.fetch.mockRejectedValue(mockError);

      const signal = new AbortController().signal;

      await expect(disableWiredMode(signal)).rejects.toThrow('Disable failed');
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      mockRepositoryClient.fetch.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new Error('Aborted'));
      });

      await expect(disableWiredMode(abortController.signal)).rejects.toThrow();
    });
  });
});
