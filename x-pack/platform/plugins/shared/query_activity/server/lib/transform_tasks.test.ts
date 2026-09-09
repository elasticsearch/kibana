/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TasksTaskInfo } from '@elastic/elasticsearch/lib/api/types';
import { QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS } from '../../common/constants';
import {
  extractSource,
  getQueryType,
  capitalise,
  isQueryTaskCandidate,
  parseDslDescription,
  parseEsqlDescription,
  transformTaskSummaries,
  transformTasks,
} from './transform_tasks';

const DEFAULT_THRESHOLD_NANOS = QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS * 1_000_000;

const baseTask: TasksTaskInfo = {
  node: 'node1',
  id: 100,
  type: 'transport',
  action: 'indices:data/read/search',
  start_time_in_millis: 1000000,
  running_time_in_nanos: DEFAULT_THRESHOLD_NANOS + 1,
  cancellable: true,
  cancelled: false,
  headers: {},
};

describe('getQueryType', () => {
  it('maps esql actions to ES|QL', () => {
    expect(getQueryType('indices:data/read/esql')).toBe('ES|QL');
    expect(getQueryType('indices:data/read/esql[a]')).toBe('ES|QL');
    expect(getQueryType('indices:data/read/esql/compute')).toBe('ES|QL');
  });

  it('maps search action to DSL', () => {
    expect(getQueryType('indices:data/read/search')).toBe('DSL');
    expect(getQueryType('indices:data/read/search[phase/query]')).toBe('DSL');
  });

  it('maps EQL actions to EQL', () => {
    expect(getQueryType('indices:data/read/eql')).toBe('EQL');
    expect(getQueryType('indices:data/read/eql/search')).toBe('EQL');
  });

  it('maps SQL actions to SQL', () => {
    expect(getQueryType('indices:data/read/sql')).toBe('SQL');
    expect(getQueryType('indices:data/read/sql/translate')).toBe('SQL');
  });

  it('maps msearch actions to MSearch', () => {
    expect(getQueryType('indices:data/read/msearch')).toBe('MSearch');
    expect(getQueryType('indices:data/read/msearch/template')).toBe('MSearch');
  });

  it('maps async_search actions to Async search', () => {
    expect(getQueryType('indices:data/read/async_search')).toBe('Async search');
    expect(getQueryType('indices:data/read/async_search/submit')).toBe('Async search');
  });

  it('returns Other for unknown actions', () => {
    expect(getQueryType('cluster:admin/health')).toBe('Other');
  });
});

describe('extractSource', () => {
  it('extracts application name from X-Opaque-Id', () => {
    expect(extractSource('fb299124;kibana:application:discover:new')).toBe('discover');
  });

  it('handles multiple semicolon-separated segments', () => {
    expect(extractSource('fb299124;kibana:application:discover:new;application:discover:new')).toBe(
      'discover'
    );
  });

  it('decodes URI-encoded names', () => {
    expect(extractSource('fb299124;kibana:application:my%20app:id123')).toBe('my app');
  });

  it('returns empty string when header is absent', () => {
    expect(extractSource(undefined)).toBe('');
  });

  it('returns empty string when no kibana: segment exists', () => {
    expect(extractSource('some-opaque-id')).toBe('');
  });
});

describe('capitalise', () => {
  it('capitalises the first letter', () => {
    expect(capitalise('discover')).toBe('Discover');
  });

  it('returns empty string for empty input', () => {
    expect(capitalise('')).toBe('');
  });
});

describe('parseDslDescription', () => {
  it('parses indices and query from standard DSL description', () => {
    const desc =
      'indices[test1,test2], types[], search_type[QUERY_THEN_FETCH], source[{"query":{"match_all":{}}}]';
    const { indices, query } = parseDslDescription(desc);
    expect(indices).toBe(2);
    expect(query).toBe('{"query":{"match_all":{}}}');
  });

  it('handles async_search prefix', () => {
    const desc =
      'async_search{indices[logs-*], search_type[QUERY_THEN_FETCH], source[{"query":{"term":{"status":"ok"}}}], preference[_local]}';
    const { indices, query } = parseDslDescription(desc);
    expect(indices).toBe(1);
    expect(query).toBe('{"query":{"term":{"status":"ok"}}}');
  });

  it('returns zero indices for empty indices bracket', () => {
    const desc = 'indices[], search_type[QUERY_THEN_FETCH], source[{}]';
    expect(parseDslDescription(desc).indices).toBe(0);
  });

  it('returns empty query when no source block exists', () => {
    const desc = 'indices[test]';
    expect(parseDslDescription(desc).query).toBe('');
  });
});

describe('parseEsqlDescription', () => {
  it('returns the full query and counts FROM indices', () => {
    const query = 'FROM logs-*, metrics-* | LIMIT 10';
    const { indices, query: q } = parseEsqlDescription(query);
    expect(indices).toBe(2);
    expect(q).toBe(query);
  });

  it('returns zero indices when no FROM clause exists', () => {
    const query = 'ROW x=0 | EVAL DELAY(10s)';
    expect(parseEsqlDescription(query).indices).toBe(0);
  });

  it('counts single FROM pattern', () => {
    const query = 'FROM kibana_sample_data_logs | LIMIT 100';
    expect(parseEsqlDescription(query).indices).toBe(1);
  });
});

describe('isQueryTaskCandidate', () => {
  it('includes a qualifying task without detailed fields', () => {
    expect(
      isQueryTaskCandidate(
        { ...baseTask, cancellable: false, description: undefined },
        DEFAULT_THRESHOLD_NANOS
      )
    ).toBe(true);
  });

  it('includes verified root action variants', () => {
    const actions = [
      'indices:data/read/esql[a]',
      'indices:data/read/eql[a]',
      'indices:data/read/sql[a]',
      'indices:data/read/async_search/submit',
    ];

    for (const action of actions) {
      expect(isQueryTaskCandidate({ ...baseTask, action }, DEFAULT_THRESHOLD_NANOS)).toBe(true);
    }
  });

  it('excludes internal child action variants even without a parent task id', () => {
    expect(
      isQueryTaskCandidate(
        { ...baseTask, action: 'indices:data/read/search[phase/query]' },
        DEFAULT_THRESHOLD_NANOS
      )
    ).toBe(false);
    expect(
      isQueryTaskCandidate(
        { ...baseTask, action: 'indices:data/read/esql/compute' },
        DEFAULT_THRESHOLD_NANOS
      )
    ).toBe(false);
  });

  it('excludes non-cancellable template wrapper tasks hidden by the original implementation', () => {
    expect(
      isQueryTaskCandidate(
        { ...baseTask, action: 'indices:data/read/search/template', cancellable: false },
        DEFAULT_THRESHOLD_NANOS
      )
    ).toBe(false);
    expect(
      isQueryTaskCandidate(
        { ...baseTask, action: 'indices:data/read/msearch/template', cancellable: false },
        DEFAULT_THRESHOLD_NANOS
      )
    ).toBe(false);
  });
});

describe('transformTaskSummaries', () => {
  it('transforms lightweight task metadata without a description', () => {
    const results = transformTaskSummaries(
      [
        {
          ...baseTask,
          description: undefined,
          headers: {
            'X-Opaque-Id': 'req1;kibana:application:discover:new',
          },
        },
      ],
      DEFAULT_THRESHOLD_NANOS
    );

    expect(results).toEqual([
      {
        taskId: 'node1:100',
        queryType: 'DSL',
        source: 'Discover',
        startTime: 1000000,
        runningTimeMs: QUERY_ACTIVITY_MIN_RUNNING_TIME_DEFAULT_MS,
        cancellable: true,
        cancelled: false,
      },
    ]);
  });

  it('omits tasks without a start time', () => {
    expect(
      transformTaskSummaries(
        [{ ...baseTask, start_time_in_millis: undefined } as unknown as TasksTaskInfo],
        DEFAULT_THRESHOLD_NANOS
      )
    ).toEqual([]);
  });
});

describe('transformTasks', () => {
  it('produces a RunningQuery for each qualifying task', () => {
    const task: TasksTaskInfo = {
      ...baseTask,
      action: 'indices:data/read/esql[a]',
      description: 'FROM logs-* | LIMIT 100',
      headers: {
        'X-Opaque-Id': 'req1;kibana:application:discover:new',
      },
    };
    const results = transformTasks([task], DEFAULT_THRESHOLD_NANOS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      taskId: 'node1:100',
      queryType: 'ES|QL',
      source: 'Discover',
      indices: 1,
      query: 'FROM logs-* | LIMIT 100',
      cancellable: true,
      cancelled: false,
    });
  });

  it('filters out child tasks', () => {
    const child: TasksTaskInfo = { ...baseTask, parent_task_id: 'node1:50' };
    expect(transformTasks([child], DEFAULT_THRESHOLD_NANOS)).toHaveLength(0);
  });

  it('handles an empty tasks array', () => {
    expect(transformTasks([], DEFAULT_THRESHOLD_NANOS)).toEqual([]);
  });

  it('transforms DSL search tasks', () => {
    const task: TasksTaskInfo = {
      ...baseTask,
      description:
        'indices[test1,test2], types[], search_type[QUERY_THEN_FETCH], source[{"query":{"match_all":{}}}]',
      headers: {
        'X-Opaque-Id': 'req2;kibana:application:dashboard:abc',
      },
    };
    const results = transformTasks([task], DEFAULT_THRESHOLD_NANOS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      queryType: 'DSL',
      source: 'Dashboard',
      indices: 2,
      query: '{"query":{"match_all":{}}}',
    });
  });

  it('uses raw description for SQL tasks', () => {
    const task: TasksTaskInfo = {
      ...baseTask,
      action: 'indices:data/read/sql',
      description: 'SELECT * FROM "kibana_sample_data_logs" LIMIT 10',
      headers: {
        'X-Opaque-Id': 'req3;kibana:application:discover:new',
      },
    };

    const results = transformTasks([task], DEFAULT_THRESHOLD_NANOS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      queryType: 'SQL',
      query: 'SELECT * FROM "kibana_sample_data_logs" LIMIT 10',
    });
  });

  it('uses raw description for EQL tasks', () => {
    const task: TasksTaskInfo = {
      ...baseTask,
      action: 'indices:data/read/eql',
      description: 'process where true',
      headers: {
        'X-Opaque-Id': 'req4;kibana:application:discover:new',
      },
    };

    const results = transformTasks([task], DEFAULT_THRESHOLD_NANOS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      queryType: 'EQL',
      query: 'process where true',
    });
  });

  it('falls back to raw description for msearch tasks when no source block exists', () => {
    const task: TasksTaskInfo = {
      ...baseTask,
      action: 'indices:data/read/msearch',
      description: 'msearch[requests[2]]',
      headers: {
        'X-Opaque-Id': 'req5;kibana:application:discover:new',
      },
    };

    const results = transformTasks([task], DEFAULT_THRESHOLD_NANOS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      queryType: 'MSearch',
      query: 'msearch[requests[2]]',
    });
  });
});
