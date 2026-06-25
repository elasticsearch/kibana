/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of, lastValueFrom } from 'rxjs';
import { OsqueryQueries } from '../../../common/search_strategy/osquery';
import { Direction } from '../../../common/search_strategy';
import { osquerySearchStrategyProvider } from '.';

jest.mock('@kbn/data-plugin/server', () => ({
  shimHitsTotal: (rawResponse: unknown) => rawResponse,
}));

jest.mock('../../utils/ccs_utils', () => ({
  hasConnectedRemoteClusters: jest.fn().mockResolvedValue(false),
  prefixIndexPatternsWithCcs: (index: string) => index,
}));

const emptyRawResponse = {
  rawResponse: { hits: { total: 0, hits: [] } },
};

describe('osquerySearchStrategyProvider space scoping', () => {
  const setup = () => {
    const searchMock = jest.fn().mockReturnValue(of(emptyRawResponse));

    const data = {
      search: {
        searchAsInternalUser: { search: searchMock, cancel: jest.fn() },
        getSearchStrategy: jest.fn(),
      },
    } as any;

    const esClient = {
      asInternalUser: {
        indices: { exists: jest.fn().mockResolvedValue(false) },
      },
    } as any;

    const provider = osquerySearchStrategyProvider(data, esClient);

    return { provider, searchMock };
  };

  const runResultsSearch = async (spaceId?: string) => {
    const { provider, searchMock } = setup();

    await lastValueFrom(
      provider.search(
        {
          factoryQueryType: OsqueryQueries.results,
          actionId: 'action-1',
          scheduleId: 'sched-1',
          executionCount: 1,
          kuery: '',
          ...(spaceId !== undefined ? { spaceId } : {}),
          pagination: { activePage: 0, cursorStart: 0, querySize: 10 },
          sort: [{ field: '@timestamp', direction: Direction.desc }],
        } as any,
        {} as any,
        {} as any
      )
    );

    const params = searchMock.mock.calls[0][0].params;

    return params.query.bool.filter as Array<Record<string, unknown>>;
  };

  it('injects a named-space term filter into the ES params', async () => {
    const filter = await runResultsSearch('my-space');

    expect(filter).toContainEqual({ term: { space_id: 'my-space' } });
    // Named space must NOT include the default-space missing-field fallback.
    expect(JSON.stringify(filter)).not.toContain('exists');
  });

  it('injects the default-space clause (term OR missing field) when spaceId is "default"', async () => {
    const filter = await runResultsSearch('default');

    expect(filter).toContainEqual({
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    });
  });

  it('defaults to the default space when no spaceId is provided', async () => {
    const filter = await runResultsSearch(undefined);

    // No active space resolves to the default space, which still applies a space_id filter.
    expect(JSON.stringify(filter)).toContain('space_id');
    expect(filter).toContainEqual({
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    });
  });
});
