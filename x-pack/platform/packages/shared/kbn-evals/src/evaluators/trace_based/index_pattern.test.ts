/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { TRACE_INDEX_PATTERN } from './factory';
import { createChatCallsEvaluator } from './chat_calls';
import { createLatencyEvaluator } from './latency';
import { createSkillInvocationEvaluator } from './skill_invocation';
import { createCachedTokensEvaluator } from './tokens';
import { createToolCallsEvaluator } from './tool_calls';

const VALID_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

/**
 * Regression guard for the index pattern the trace evaluators query.
 *
 * A remote tracing cluster grants the eval API key on datastream BACKING
 * indices (`.ds-traces-generic*`, `.ds-traces-agent_builder*`). A bare
 * `traces-*` matches none of them, so ES|QL resolves zero authorized indices
 * and fails with `Unknown column [trace.id]` -- which looks like "the model
 * emitted no spans" but is really "this key cannot see that pattern". That
 * silently nulled every trace metric for every model on the golden cluster.
 */
describe('trace evaluator index pattern', () => {
  let mockEsClient: jest.Mocked<EsClient>;
  let mockLog: jest.Mocked<ToolingLog>;

  beforeEach(() => {
    mockEsClient = {
      esql: { query: jest.fn().mockResolvedValue({ columns: [], values: [] }) },
    } as unknown as jest.Mocked<EsClient>;
    mockLog = {
      debug: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    } as unknown as jest.Mocked<ToolingLog>;
  });

  const queriesFor = async (evaluator: { evaluate: Function }) => {
    // The assertion only needs the query TEXT, which is fixed at the first
    // call. Awaiting the full evaluate() would sit through the factory's
    // retry/backoff loop, so kick it off, let the first query issue, and
    // inspect the recorded call instead.
    const pending = evaluator
      .evaluate({
        input: {},
        output: { traceId: VALID_TRACE_ID },
        expected: {},
        metadata: {},
      })
      .catch(() => undefined);

    await Promise.resolve();
    await Promise.resolve();

    const queries = (mockEsClient.esql.query as jest.Mock).mock.calls.map(
      ([args]) => args.query as string
    );

    void pending;
    return queries;
  };

  const evaluators = () =>
    [
      ['Chat Calls', createChatCallsEvaluator({ traceEsClient: mockEsClient, log: mockLog })],
      ['Latency', createLatencyEvaluator({ traceEsClient: mockEsClient, log: mockLog })],
      [
        'SkillInvoked',
        createSkillInvocationEvaluator({
          traceEsClient: mockEsClient,
          log: mockLog,
          skillName: 'some-skill',
        }),
      ],
      ['Cached Tokens', createCachedTokensEvaluator({ traceEsClient: mockEsClient, log: mockLog })],
      ['Tool Calls', createToolCallsEvaluator({ traceEsClient: mockEsClient, log: mockLog })],
    ] as Array<[string, { evaluate: Function }]>;

  it('includes the datastream backing indices so a remote-cluster key can resolve spans', () => {
    expect(TRACE_INDEX_PATTERN).toContain('.ds-traces-*');
  });

  it('still covers the plain datastream name for local Scout clusters', () => {
    expect(TRACE_INDEX_PATTERN).toContain('traces-*');
  });

  describe.each(evaluators().map(([name]) => name))('%s', (name) => {
    it('queries the shared pattern and never a bare traces-*', async () => {
      const evaluator = evaluators().find(([n]) => n === name)![1];
      const queries = await queriesFor(evaluator);

      expect(queries.length).toBeGreaterThan(0);

      for (const query of queries) {
        expect(query).toContain(`FROM ${TRACE_INDEX_PATTERN}`);
        // The bug: a FROM clause naming only the un-dotted pattern.
        expect(query).not.toMatch(/FROM\s+traces-\*\s*$/m);
      }
    });
  });
});
