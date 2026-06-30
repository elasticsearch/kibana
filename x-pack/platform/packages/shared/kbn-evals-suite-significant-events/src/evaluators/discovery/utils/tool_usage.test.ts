/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConverseStep } from '@kbn/evals';
import {
  TOOL_ID_EXECUTE_ESQL,
  TOOL_ID_KI_SEARCH,
  countToolCalls,
  extractToolCallIds,
  summarizeEsqlGrounding,
} from './tool_usage';

const steps: ConverseStep[] = [
  { type: 'reasoning', reasoning: 'plan' },
  {
    type: 'tool_call',
    tool_id: TOOL_ID_KI_SEARCH,
    tool_call_id: 'ki-1',
    params: { kind: ['feature', 'query'], stream_names: ['logs'] },
    results: [{ type: 'other', data: { knowledge_indicators: [{ kind: 'query' }] } }],
  },
  {
    type: 'tool_call',
    tool_id: TOOL_ID_EXECUTE_ESQL,
    tool_call_id: 'esql-1',
    params: { query: 'FROM logs | WHERE body.text : "SQLState"' },
    results: [
      { type: 'query', data: { esql: '…' } },
      { type: 'esql_results', data: { columns: [{ name: '@timestamp' }], values: [['t', 'x']] } },
    ],
  },
  {
    type: 'tool_call',
    tool_id: TOOL_ID_EXECUTE_ESQL,
    tool_call_id: 'esql-2',
    params: { query: 'FROM logs | WHERE body.text : "Cache error"' },
    results: [{ type: 'esql_results', data: { columns: [{ name: '@timestamp' }], values: [] } }],
  },
];

describe('extractToolCallIds', () => {
  it('returns tool ids of tool_call steps in order, skipping reasoning', () => {
    expect(extractToolCallIds(steps)).toEqual([
      TOOL_ID_KI_SEARCH,
      TOOL_ID_EXECUTE_ESQL,
      TOOL_ID_EXECUTE_ESQL,
    ]);
  });
});

describe('countToolCalls', () => {
  it('counts only tool_call steps', () => {
    expect(countToolCalls(steps)).toBe(3);
  });
});

describe('summarizeEsqlGrounding', () => {
  it('counts execute_esql calls and how many returned rows', () => {
    expect(summarizeEsqlGrounding(steps)).toEqual({ calls: 2, callsWithRows: 1 });
  });

  it('reports zero calls when execute_esql was never invoked', () => {
    expect(summarizeEsqlGrounding([{ type: 'tool_call', tool_id: TOOL_ID_KI_SEARCH }])).toEqual({
      calls: 0,
      callsWithRows: 0,
    });
  });
});
