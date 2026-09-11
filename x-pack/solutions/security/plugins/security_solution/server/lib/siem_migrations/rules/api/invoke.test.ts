/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, KibanaResponseFactory, Logger } from '@kbn/core/server';
import type { SecuritySolutionRequestHandlerContext } from '../../../../types';
import { loggerMock } from '@kbn/logging-mocks';
import { registerSiemRuleMigrationsInvokeRoute } from './invoke';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockExecute = jest.fn();
const mockCreateInvoker = jest.fn();
const mockGetRulesClient = jest.fn();

const mockRuleMigrationsClient = {
  task: {
    createInvoker: mockCreateInvoker,
  },
};

const mockSecuritySolutionContext = {
  siemMigrations: {
    getRulesClient: mockGetRulesClient,
  },
};

const mockLicense = { hasAtLeast: jest.fn().mockReturnValue(true) };

const mockContext = {
  licensing: Promise.resolve({ license: mockLicense }),
  securitySolution: Promise.resolve(mockSecuritySolutionContext),
} as unknown as SecuritySolutionRequestHandlerContext;

const mockAborted$ = { subscribe: jest.fn() };

const makeRequest = (body: Record<string, unknown> = {}): KibanaRequest =>
  ({
    body: {
      connector_id: 'my-connector',
      input: {
        id: 'rule-1',
        original_rule: { title: 'Test rule' },
      },
      ...body,
    },
    events: { aborted$: mockAborted$ },
  } as unknown as KibanaRequest);

const mockRes = {
  ok: jest.fn((payload) => payload),
  customError: jest.fn((payload) => payload),
} as unknown as KibanaResponseFactory;

// ── Router stub ───────────────────────────────────────────────────────────────

// Captures the versioned route handler so tests can call it directly.
let capturedHandler: (
  ctx: SecuritySolutionRequestHandlerContext,
  req: KibanaRequest,
  res: KibanaResponseFactory
) => Promise<unknown>;

const mockAddVersion = jest
  .fn()
  .mockImplementation((_opts: unknown, handler: typeof capturedHandler) => {
    capturedHandler = handler;
    return { addVersion: mockAddVersion };
  });

const mockPost = jest.fn().mockReturnValue({ addVersion: mockAddVersion });
const mockVersioned = { post: mockPost };
const mockRouter = { versioned: mockVersioned } as unknown as Parameters<
  typeof registerSiemRuleMigrationsInvokeRoute
>[0];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerSiemRuleMigrationsInvokeRoute', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = loggerMock.create();
    mockGetRulesClient.mockReturnValue(mockRuleMigrationsClient);
    mockCreateInvoker.mockResolvedValue({ execute: mockExecute });

    registerSiemRuleMigrationsInvokeRoute(mockRouter, logger);
  });

  it('registers a versioned POST route', () => {
    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ access: 'internal' }));
    expect(mockAddVersion).toHaveBeenCalledWith(
      expect.objectContaining({ version: '1' }),
      expect.any(Function)
    );
  });

  describe('handler', () => {
    it('returns 200 with output on success', async () => {
      const output = { status: 'completed', translated_rule: {} };
      mockExecute.mockResolvedValue(output);

      const req = makeRequest();
      await capturedHandler(mockContext, req, mockRes);

      expect(mockCreateInvoker).toHaveBeenCalledWith('my-connector', {
        abortController: expect.any(AbortController),
        vendor: 'splunk',
      });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rule-1' }),
        undefined // no config provided
      );
      expect(mockRes.ok).toHaveBeenCalledWith({ body: { output } });
    });

    it('forwards config to invoker.execute when provided', async () => {
      const output = { status: 'completed' };
      mockExecute.mockResolvedValue(output);

      const config = { configurable: { skipPrebuiltRulesMatching: true } };
      const req = makeRequest({ config });
      await capturedHandler(mockContext, req, mockRes);

      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }), config);
      expect(mockRes.ok).toHaveBeenCalledWith({ body: { output } });
    });

    it('subscribes to the aborted$ event', async () => {
      mockExecute.mockResolvedValue({});
      const req = makeRequest();
      await capturedHandler(mockContext, req, mockRes);

      expect(mockAborted$.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns 500 on error from createInvoker', async () => {
      const err = new Error('connector not found');
      mockCreateInvoker.mockRejectedValue(err);

      const req = makeRequest();
      await capturedHandler(mockContext, req, mockRes);

      expect(mockRes.customError).toHaveBeenCalledWith({
        body: err.message,
        statusCode: 500,
      });
    });

    it('uses err.statusCode when available', async () => {
      const err = Object.assign(new Error('unauthorized'), { statusCode: 403 });
      mockCreateInvoker.mockRejectedValue(err);

      const req = makeRequest();
      await capturedHandler(mockContext, req, mockRes);

      expect(mockRes.customError).toHaveBeenCalledWith({
        body: err.message,
        statusCode: 403,
      });
    });

    it('returns 500 on error from invoker.execute', async () => {
      const err = new Error('graph execution failed');
      mockExecute.mockRejectedValue(err);

      const req = makeRequest();
      await capturedHandler(mockContext, req, mockRes);

      expect(mockRes.customError).toHaveBeenCalledWith({
        body: err.message,
        statusCode: 500,
      });
    });
  });
});
