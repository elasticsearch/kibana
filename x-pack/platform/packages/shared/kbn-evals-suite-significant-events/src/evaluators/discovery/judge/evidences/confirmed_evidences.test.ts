/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConverseStep } from '@kbn/evals';
import { confirmedEvidencesEvaluator } from './confirmed_evidences';
import { TOOL_ID_EXECUTE_ESQL } from '../../utils/tool_usage';

const esqlStep: ConverseStep = {
  type: 'tool_call',
  tool_id: TOOL_ID_EXECUTE_ESQL,
  tool_call_id: 'e1',
  params: { query: 'FROM logs' },
  results: [{ type: 'esql_results', data: { values: [['x']] } }],
};

const evaluate = (significantEvents: unknown, steps: ConverseStep[]) =>
  confirmedEvidencesEvaluator.evaluate({
    input: {
      discoveries: [],
    },
    output: { significantEvents, steps, inputDiscoveries: [] } as never,
    expected: {} as never,
    metadata: null,
  });

describe('confirmedEvidencesEvaluator', () => {
  it('is unavailable when nothing was promoted', async () => {
    const result = await evaluate([{ status: 'acknowledged' }], [esqlStep]);
    expect(result.score).toBeNull();
  });

  it('scores 1 when a promoted event has confirmed evidence and execute_esql ran', async () => {
    const events = [{ status: 'promoted', evidences: [{ confirmed: true }] }];
    expect((await evaluate(events, [esqlStep])).score).toBe(1);
  });

  it('scores 0 when promoted without confirmed evidence', async () => {
    const events = [{ status: 'promoted', evidences: [{ result: 'found' }] }];
    expect((await evaluate(events, [esqlStep])).score).toBe(0);
  });

  it('scores 0 when promoted but execute_esql never ran', async () => {
    const events = [{ status: 'promoted', evidences: [{ confirmed: true }] }];
    expect((await evaluate(events, [])).score).toBe(0);
  });

  it('gives partial credit across multiple promoted events', async () => {
    const events = [
      { status: 'promoted', evidences: [{ confirmed: true }] },
      { status: 'promoted', evidences: [{ result: 'empty' }] },
    ];
    expect((await evaluate(events, [esqlStep])).score).toBe(0.5);
  });
});
