/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import type { IScopedSearchClient } from '@kbn/data-plugin/server';
import { Direction, OsqueryQueries } from '../../../common/search_strategy';
import { getActionResponses } from './utils';

describe('getActionResponses', () => {
  it('returns aggregated action response stats', async () => {
    const search = {
      search: jest.fn().mockReturnValue(
        of({
          rawResponse: {
            aggregations: {
              aggs: {
                responses_by_action_id: {
                  doc_count: 2,
                  rows_count: { value: 5 },
                  responses: {
                    buckets: [
                      { key: 'success', doc_count: 1 },
                      { key: 'error', doc_count: 1 },
                    ],
                  },
                },
              },
            },
          },
        })
      ),
    } as unknown as IScopedSearchClient;

    const response = await lastValueFrom(
      getActionResponses(search, 'action-1', 5, undefined, 'default')
    );

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'action-1',
        factoryQueryType: OsqueryQueries.actionResults,
        kuery: '',
        sort: { direction: Direction.desc, field: '@timestamp' },
        spaceId: 'default',
      }),
      { strategy: 'osquerySearchStrategy' }
    );
    expect(response).toEqual({
      action_id: 'action-1',
      docs: 5,
      failed: 1,
      pending: 3,
      responded: 2,
      successful: 1,
    });
  });
});
