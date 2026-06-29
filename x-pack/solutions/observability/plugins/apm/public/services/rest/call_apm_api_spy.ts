/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { once } from 'lodash';
import { createCallApmApi, callApmApi } from './create_call_apm_api';
import type {
  AbstractAPMClient,
  APIClientRequestParamsOf,
  APIReturnType,
} from './create_call_apm_api';
import { type APIEndpoint } from '../../../server';

const spyObj = { createCallApmApi, callApmApi };

export type CallApmApiSpy = jest.SpyInstance<Promise<any>, Parameters<AbstractAPMClient>>;

export type CreateCallApmApiSpy = jest.SpyInstance<AbstractAPMClient>;

export const getCallApmApiSpy = () => jest.spyOn(spyObj, 'callApmApi') as unknown as CallApmApiSpy;

type MockApmApiCall = <TEndpoint extends APIEndpoint>(
  endpoint: TEndpoint,
  fn: (params: APIClientRequestParamsOf<TEndpoint>) => APIReturnType<TEndpoint>
) => void;

// Module-level cache so MockApmPluginStorybook can reach it for HTTP-level routing.
const _mockCache: Record<string, Function> = {};

const getSpy = once(() => {
  const spy = getCallApmApiSpy();

  const response: MockApmApiCall = (endpoint, fn) => {
    _mockCache[endpoint] = fn;
  };

  spy.mockImplementation((endpoint, params) => {
    const fn = _mockCache[endpoint];

    if (fn) {
      return Promise.resolve(fn(params));
    }

    throw new Error('No cached response defined for ' + endpoint);
  });

  return {
    response,
  };
});

export const mockApmApiCallResponse: MockApmApiCall = (...args) => {
  getSpy().response(...args);
};

/**
 * Returns the current mock-response cache so that HTTP-level mocks (e.g.
 * MockApmPluginStorybook) can route `core.http.get(pathname, …)` calls to the
 * same registered responses without relying on webpack live-binding spies.
 */
export const getMockApiCache = (): Readonly<Record<string, Function>> => {
  getSpy(); // ensure the cache object exists and the spy is wired up
  return _mockCache;
};
