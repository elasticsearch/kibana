/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHandlerTestMocks, defaultTestNode } from './test_helpers';
import { createBaseHandlerContext } from '../create_base_handler_context';

describe('createBaseHandlerContext', () => {
  it('builds a StepHandlerContext wired to the execution runtime and node', () => {
    const mocks = createHandlerTestMocks();
    const input = { resolved: true };
    const rawInput = { template: '${{ value }}' };
    const config = { mode: 'async' };

    const context = createBaseHandlerContext(
      input,
      rawInput,
      config,
      defaultTestNode,
      mocks.stepExecutionRuntime,
      mocks.workflowLogger
    );

    expect(context.input).toBe(input);
    expect(context.rawInput).toEqual(rawInput);
    expect(context.config).toEqual(config);
    expect(context.stepId).toBe('custom-step');
    expect(context.stepType).toBe('my-custom-type');
    expect(context.abortSignal).toBe(mocks.stepExecutionRuntime.abortController.signal);

    context.contextManager.getContext();
    expect(mocks.stepExecutionRuntime.contextManager.getContext).toHaveBeenCalled();

    context.contextManager.getScopedEsClient();
    expect(mocks.stepExecutionRuntime.contextManager.getEsClientAsUser).toHaveBeenCalled();

    context.contextManager.renderInputTemplate({ x: 1 });
    expect(mocks.renderValueAccordingToContext).toHaveBeenCalledWith({ x: 1 }, undefined);

    context.logger.info('hello', { meta: true });
    expect(mocks.workflowLogger.logInfo).toHaveBeenCalledWith('hello', { meta: true });
  });

  it('defaults rawInput and config to empty objects when omitted', () => {
    const mocks = createHandlerTestMocks();

    const context = createBaseHandlerContext(
      {},
      undefined as unknown as Record<string, unknown>,
      undefined as unknown as Record<string, unknown>,
      defaultTestNode,
      mocks.stepExecutionRuntime,
      mocks.workflowLogger
    );

    expect(context.rawInput).toEqual({});
    expect(context.config).toEqual({});
  });

  it('exposes request-local capabilities directly to the handler', () => {
    const mocks = createHandlerTestMocks();
    const capabilities = {
      id: 'proceed',
      value: { invoke: jest.fn() },
    };
    (
      mocks.stepExecutionRuntime.contextManager.getExecutionCapabilities as jest.Mock
    ).mockReturnValue([capabilities]);

    const context = createBaseHandlerContext(
      {},
      {},
      {},
      defaultTestNode,
      mocks.stepExecutionRuntime,
      mocks.workflowLogger
    );

    expect(context.capabilities).toEqual([capabilities]);
    expect(context.contextManager.getContext()).not.toHaveProperty('capabilities');
  });

  it('capabilities self-destruct on JSON serialization — the ES persistence path cannot capture real payload', () => {
    const mocks = createHandlerTestMocks();
    const secretFn = jest.fn();
    (
      mocks.stepExecutionRuntime.contextManager.getExecutionCapabilities as jest.Mock
    ).mockReturnValue([{ id: 'proceed', value: { invoke: secretFn } }]);

    const context = createBaseHandlerContext(
      {},
      {},
      {},
      defaultTestNode,
      mocks.stepExecutionRuntime,
      mocks.workflowLogger
    );

    // Handler can access the real value in-process ...
    expect((context.capabilities![0].value as { invoke: jest.Mock }).invoke).toBe(secretFn);
    // ... but a JSON round-trip (the path to step output / ES) loses it.
    const persisted = JSON.parse(JSON.stringify(context.capabilities));
    expect(persisted).toEqual([{ id: 'proceed', value: {} }]);
    expect(persisted[0].value).not.toHaveProperty('invoke');
  });

  it('forwards callKibanaApi to the execution runtime with abort signal', async () => {
    const mocks = createHandlerTestMocks();
    mocks.stepExecutionRuntime.contextManager.callKibanaApi.mockResolvedValue({
      status: 200,
      headers: {},
      body: { ok: true },
    });

    const context = createBaseHandlerContext(
      {},
      {},
      {},
      defaultTestNode,
      mocks.stepExecutionRuntime,
      mocks.workflowLogger
    );

    const result = await context.contextManager.callKibanaApi({
      method: 'GET',
      path: '/api/status',
    });

    expect(mocks.stepExecutionRuntime.contextManager.callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/status',
      signal: mocks.stepExecutionRuntime.abortController.signal,
    });
    expect(result).toEqual({ status: 200, headers: {}, body: { ok: true } });
  });
});
