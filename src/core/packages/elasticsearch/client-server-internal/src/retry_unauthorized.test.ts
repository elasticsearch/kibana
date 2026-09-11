/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UnauthorizedError } from '@kbn/es-errors';
import type { SetAuthHeaders } from '@kbn/core-http-server';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import {
  createInternalErrorHandler,
  isRetryResult,
  isNotHandledResult,
  toolkit,
} from './retry_unauthorized';

const createUnauthorizedError = (): UnauthorizedError => {
  return { statusCode: 401 } as UnauthorizedError;
};

describe('createInternalErrorHandler', () => {
  let setAuthHeaders: jest.MockedFunction<SetAuthHeaders>;

  beforeEach(() => {
    setAuthHeaders = jest.fn();
  });

  it('calls and returns the result from the provided handler', async () => {
    const handlerResponse = toolkit.retry({ authHeaders: { foo: 'bar' } });
    const handler = jest.fn().mockReturnValue(handlerResponse);
    const request = httpServerMock.createKibanaRequest();

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    const result = await internalHandler(error);

    expect(result).toEqual(handlerResponse);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ request, error }, expect.any(Object));
  });

  it('calls `setAuthHeaders` when the handler returns `retry`', async () => {
    const handlerResponse = toolkit.retry({ authHeaders: { foo: 'bar' } });
    const handler = jest.fn().mockReturnValue(handlerResponse);
    const request = httpServerMock.createKibanaRequest();

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    await internalHandler(error);

    expect(setAuthHeaders).toHaveBeenCalledTimes(1);
    expect(setAuthHeaders).toHaveBeenCalledWith(request, handlerResponse.authHeaders);
  });

  it('does not call `setAuthHeaders` when the handler returns `notHandled`', async () => {
    const handlerResponse = toolkit.notHandled();
    const handler = jest.fn().mockReturnValue(handlerResponse);
    const request = httpServerMock.createKibanaRequest();

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    await internalHandler(error);

    expect(setAuthHeaders).not.toHaveBeenCalled();
  });

  it('returns `notHandled` if the handler throws', async () => {
    const handler = jest.fn().mockImplementation(() => {
      throw new Error('woups');
    });
    const request = httpServerMock.createKibanaRequest();

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    const result = await internalHandler(error);

    expect(isNotHandledResult(result)).toBe(true);
  });

  it('handles asynchronous handlers', async () => {
    const handlerResponse = toolkit.retry({ authHeaders: { foo: 'bar' } });
    const handler = jest.fn().mockResolvedValue(handlerResponse);
    const request = httpServerMock.createKibanaRequest();

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    const result = await internalHandler(error);

    expect(result).toEqual(handlerResponse);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ request, error }, expect.any(Object));
  });

  it('returns `notHandled` without calling the provided handler for bare `{ headers }` fake requests', async () => {
    const handler = jest.fn();
    const fakeRequest = {
      headers: {
        authorization: 'foobar',
      },
    };

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request: fakeRequest,
      setAuthHeaders,
    });

    const result = await internalHandler(createUnauthorizedError());

    expect(isNotHandledResult(result)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the provided handler for fake `CoreKibanaRequest`s', async () => {
    const handlerResponse = toolkit.retry({ authHeaders: { authorization: 'Bearer fresh' } });
    const handler = jest.fn().mockReturnValue(handlerResponse);
    const request = httpServerMock.createFakeKibanaRequest({
      headers: { authorization: 'Bearer stale' },
    });

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    const result = await internalHandler(error);

    expect(result).toEqual(handlerResponse);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ request, error }, expect.any(Object));
  });

  it('does not call `setAuthHeaders` when the handler returns `retry` for a fake `CoreKibanaRequest`', async () => {
    const handler = jest
      .fn()
      .mockReturnValue(toolkit.retry({ authHeaders: { authorization: 'Bearer fresh' } }));
    const request = httpServerMock.createFakeKibanaRequest({
      headers: { authorization: 'Bearer stale' },
    });

    const internalHandler = createInternalErrorHandler({
      getHandler: () => handler,
      request,
      setAuthHeaders,
    });

    await internalHandler(createUnauthorizedError());

    expect(setAuthHeaders).not.toHaveBeenCalled();
  });

  it('checks the presence of a registered handler for each error', async () => {
    const handlerResponse = toolkit.retry({ authHeaders: { foo: 'bar' } });
    const handler = jest.fn().mockResolvedValue(handlerResponse);

    const request = httpServerMock.createKibanaRequest();

    const getHandler = jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce(handler);

    const internalHandler = createInternalErrorHandler({
      getHandler,
      request,
      setAuthHeaders,
    });

    const error = createUnauthorizedError();
    let result = await internalHandler(error);

    expect(isNotHandledResult(result)).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    result = await internalHandler(error);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(isRetryResult(result)).toBe(true);
  });
});

describe('isRetryResult', () => {
  it('returns `true` for a `retry` result', () => {
    expect(
      isRetryResult(
        toolkit.retry({
          authHeaders: { foo: 'bar' },
        })
      )
    ).toBe(true);
  });

  it('returns `false` for a `notHandled` result', () => {
    expect(isRetryResult(toolkit.notHandled())).toBe(false);
  });
});

describe('isNotHandledResult', () => {
  it('returns `false` for a `retry` result', () => {
    expect(
      isNotHandledResult(
        toolkit.retry({
          authHeaders: { foo: 'bar' },
        })
      )
    ).toBe(false);
  });

  it('returns `true` for a `notHandled` result', () => {
    expect(isNotHandledResult(toolkit.notHandled())).toBe(true);
  });
});
