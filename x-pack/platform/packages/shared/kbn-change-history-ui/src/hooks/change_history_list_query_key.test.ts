/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  changeHistoryDetailQueryKey,
  changeHistoryListQueryKey,
  changeHistoryObjectQueryKeyPrefix,
  changeHistoryScopeQueryKeyPrefix,
} from './change_history_list_query_key';

const testScope = {
  module: 'stack',
  dataset: 'workflows',
  objectType: 'workflow',
};

describe('change history query keys', () => {
  it('includes scope segments before objectId', () => {
    expect(changeHistoryScopeQueryKeyPrefix(testScope)).toEqual([
      'change-history',
      'stack',
      'workflows',
      'workflow',
    ]);
    expect(changeHistoryObjectQueryKeyPrefix('wf-1', testScope)).toEqual([
      'change-history',
      'stack',
      'workflows',
      'workflow',
      'wf-1',
    ]);
    expect(changeHistoryListQueryKey({ objectId: 'wf-1', scope: testScope, pageSize: 20 })).toEqual(
      ['change-history', 'stack', 'workflows', 'workflow', 'wf-1', 'list', 20]
    );
    expect(
      changeHistoryDetailQueryKey({ objectId: 'wf-1', changeId: 'evt-1', scope: testScope })
    ).toEqual(['change-history', 'stack', 'workflows', 'workflow', 'wf-1', 'detail', 'evt-1']);
  });

  it('isolates the same objectId across scopes', () => {
    const otherScope = { module: 'stack', dataset: 'cases', objectType: 'case' };

    expect(changeHistoryObjectQueryKeyPrefix('same-id', testScope)).not.toEqual(
      changeHistoryObjectQueryKeyPrefix('same-id', otherScope)
    );
  });
});
