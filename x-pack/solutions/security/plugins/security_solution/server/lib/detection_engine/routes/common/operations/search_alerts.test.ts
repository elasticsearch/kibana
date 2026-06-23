/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  typicalSignalsQuery,
  typicalSignalsQueryAggs,
  getEmptySignalsResponse,
} from '../../__mocks__/request_responses';
import type { SecuritySolutionRequestHandlerContextMock } from '../../__mocks__/request_context';
import { requestContextMock } from '../../__mocks__';
import { searchAlerts } from './search_alerts';

describe('searchAlerts', () => {
  let context: SecuritySolutionRequestHandlerContextMock;

  const defaultArgs = {
    index: undefined,
    params: typicalSignalsQuery(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ({ context } = requestContextMock.createTools());
    context.core.elasticsearch.client.asCurrentUser.search.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getEmptySignalsResponse() as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns the search response', async () => {
    const result = await searchAlerts({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(result).toEqual(getEmptySignalsResponse());
  });

  it('passes the query through to the search call', async () => {
    await searchAlerts({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
      expect.objectContaining(typicalSignalsQuery())
    );
  });

  it('searches on an index pattern without wildcard added', async () => {
    const index = [
      '.alerts-security.alerts-default',
      '.alerts-security.attack.discovery.alerts-default',
    ];

    await searchAlerts({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      index,
    });

    expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
      expect.objectContaining({ index })
    );
  });

  it('passes a single agg through to the search call', async () => {
    await searchAlerts({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      params: typicalSignalsQueryAggs(),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
      expect.objectContaining({ ...typicalSignalsQueryAggs(), ignore_unavailable: true })
    );
  });

  it('passes aggs and search together through to the search call', async () => {
    await searchAlerts({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      params: { ...typicalSignalsQuery(), ...typicalSignalsQueryAggs() },
    });

    expect(context.core.elasticsearch.client.asCurrentUser.search).toHaveBeenCalledWith(
      expect.objectContaining({ ...typicalSignalsQuery(), ...typicalSignalsQueryAggs() })
    );
  });

  it('rejects when search throws', async () => {
    context.core.elasticsearch.client.asCurrentUser.search.mockRejectedValue(
      new Error('Test error')
    );

    await expect(
      searchAlerts({
        ...defaultArgs,
        context: requestContextMock.convertContext(context),
        params: typicalSignalsQueryAggs(),
      })
    ).rejects.toThrow('Test error');
  });
});
