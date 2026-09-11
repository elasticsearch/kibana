/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHttpFetchError } from '@kbn/core-http-browser-mocks';
import { httpServiceMock } from '@kbn/core/public/mocks';
import {
  DISCOVER_SESSION_API_BASE_PATH,
  DISCOVER_SESSION_API_VERSION,
} from '../../common/constants';
import { createDiscoverSessionClient } from './api_client';

describe('Discover session API client', () => {
  const data = { title: 'Session', tabs: [] };
  const response = {
    id: 'session-id',
    data: { ...data, description: '' },
    meta: { managed: false },
  };

  it('creates a session with the expected body and API version', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.post.mockResolvedValue(response);

    await expect(client.create(data)).resolves.toBe(response);
    expect(http.post).toHaveBeenCalledWith(DISCOVER_SESSION_API_BASE_PATH, {
      version: DISCOVER_SESSION_API_VERSION,
      body: JSON.stringify(data),
    });
  });

  it('gets a session with the expected path and API version', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.get.mockResolvedValue({
      body: response,
      response: new Response(undefined, {
        headers: { 'kbn-resolve-outcome': 'exactMatch' },
      }),
    });

    await expect(client.get('session-id')).resolves.toEqual({
      ...response,
      resolve: {
        outcome: 'exactMatch',
        aliasTargetId: undefined,
        aliasPurpose: undefined,
      },
    });
    expect(http.get).toHaveBeenCalledWith(`${DISCOVER_SESSION_API_BASE_PATH}/session-id`, {
      version: DISCOVER_SESSION_API_VERSION,
      asResponse: true,
    });
  });

  it('upserts a session with the expected path, body, and API version', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.put.mockResolvedValue(response);

    await expect(client.upsert('session-id', data)).resolves.toBe(response);
    expect(http.put).toHaveBeenCalledWith(`${DISCOVER_SESSION_API_BASE_PATH}/session-id`, {
      version: DISCOVER_SESSION_API_VERSION,
      body: JSON.stringify(data),
    });
  });

  it('converts a GET 404 into the error expected by Discover', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.get.mockRejectedValue(
      createHttpFetchError(
        'Not found',
        'NotFound',
        new Request('http://localhost'),
        new Response(undefined, { status: 404 })
      )
    );

    await expect(client.get('missing-session')).rejects.toMatchObject({
      savedObjectType: 'search',
      savedObjectId: 'missing-session',
    });
  });

  it('preserves GET errors that are not 404 responses', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    const error = new Error('Network error');
    http.get.mockRejectedValue(error);

    await expect(client.get('session-id')).rejects.toBe(error);
  });

  it('returns conflict resolution metadata from the GET response headers', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.get.mockResolvedValue({
      body: response,
      response: new Response(undefined, {
        headers: {
          'kbn-resolve-outcome': 'conflict',
          'kbn-resolve-alias-target-id': 'other-session',
          'kbn-resolve-purpose': 'savedObjectConversion',
        },
      }),
    });

    await expect(client.get('conflicting-session')).resolves.toEqual({
      ...response,
      resolve: {
        outcome: 'conflict',
        aliasTargetId: 'other-session',
        aliasPurpose: 'savedObjectConversion',
      },
    });
  });

  it('uses the server error message when get fails', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    http.get.mockRejectedValue(createBadRequestError());

    await expect(client.get('session-id')).rejects.toThrow(
      'chart_interval must be a supported value'
    );
  });

  it('uses the server message and keeps the original cause when create fails', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    const error = createBadRequestError();
    http.post.mockRejectedValue(error);

    const result = client.create(data);

    await expect(result).rejects.toThrow('chart_interval must be a supported value');
    await expect(result).rejects.toHaveProperty('cause', error);
  });

  it('uses the server message and keeps the original cause when upsert fails', async () => {
    const http = httpServiceMock.createStartContract();
    const client = createDiscoverSessionClient(http);
    const error = createBadRequestError();
    http.put.mockRejectedValue(error);

    const result = client.upsert('session-id', data);

    await expect(result).rejects.toThrow('chart_interval must be a supported value');
    await expect(result).rejects.toHaveProperty('cause', error);
  });
});

const createBadRequestError = () =>
  createHttpFetchError(
    'Bad Request',
    'Error',
    new Request('http://localhost'),
    new Response(undefined, { status: 400, statusText: 'Bad Request' }),
    { message: 'chart_interval must be a supported value', statusCode: 400 }
  );
