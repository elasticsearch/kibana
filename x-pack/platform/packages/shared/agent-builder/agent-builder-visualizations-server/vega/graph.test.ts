/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { generateEsql, executeEsql } from '@kbn/agent-builder-genai-utils';
import { VEGA_LITE_SCHEMA } from './normalize_spec';
import { VEGA_V5_SCHEMA } from './dialect';
import { validateVegaSpec } from './vega_validator';
import { createVegaGraph } from './graph';

jest.mock('@kbn/agent-builder-genai-utils', () => ({
  generateEsql: jest.fn(),
  executeEsql: jest.fn(),
  buildTimeRangeParams: jest.fn(() => undefined),
}));

jest.mock('../utils/extract_text_from_message', () => ({
  extractTextFromMessage: (message: unknown) => String(message),
}));

jest.mock('../visualization/prompts', () => ({
  esqlAdditionalInstructions: 'esql-instructions',
}));

jest.mock('./vega_validator', () => ({
  validateVegaSpec: jest.fn(),
}));

const mockedGenerateEsql = jest.mocked(generateEsql);
const mockedExecuteEsql = jest.mocked(executeEsql);
const mockedValidateVegaSpec = jest.mocked(validateVegaSpec);

const createMockLogger = (): Logger =>
  ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as Logger);

const asCodeBlock = (spec: object) => '```json\n' + JSON.stringify(spec) + '\n```';

const GENERATED_ESQL = 'FROM logs-* | STATS count = COUNT() BY status';
const PROVIDED_ESQL = 'FROM metrics-* | STATS avg = AVG(value) BY host';

describe('createVegaGraph', () => {
  const events = {} as ToolEventEmitter;
  const esClient = { asCurrentUser: {} } as IScopedClusterClient;

  let logger: Logger;
  let invoke: jest.Mock;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    invoke = jest.fn();
    modelProvider = {
      getDefaultModel: jest.fn().mockResolvedValue({ chatModel: { invoke } }),
    } as unknown as ModelProvider;
    mockedGenerateEsql.mockResolvedValue({ query: GENERATED_ESQL } as Awaited<
      ReturnType<typeof generateEsql>
    >);
    mockedExecuteEsql.mockResolvedValue({ columns: [], values: [] } as Awaited<
      ReturnType<typeof executeEsql>
    >);
    mockedValidateVegaSpec.mockResolvedValue({ warnings: [] });
  });

  const run = async (input: { esqlQuery?: string; existingSpec?: string } = {}) => {
    const graph = await createVegaGraph(modelProvider, logger, events, esClient);
    return graph.invoke({
      nlQuery: 'small multiples of latency by region',
      index: undefined,
      existingSpec: input.existingSpec,
      esqlQuery: input.esqlQuery ?? '',
      currentAttempt: 0,
      actions: [],
      spec: null,
      error: null,
    });
  };

  it('generates ES|QL then authors and normalizes a spec', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'bar', encoding: { x: { field: 'status' } } }));

    const state = await run();

    expect(mockedGenerateEsql).toHaveBeenCalledTimes(1);
    expect(state.error).toBeNull();
    const spec = JSON.parse(state.spec!);
    expect(spec.$schema).toBe(VEGA_LITE_SCHEMA);
    expect(spec.data).toEqual({ url: { '%type%': 'esql', query: GENERATED_ESQL } });
    expect(spec.mark).toBe('bar');
    expect(state.esqlQuery).toBe(GENERATED_ESQL);
  });

  it('executes a provided ES|QL query instead of generating one', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'point' }));

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(mockedGenerateEsql).not.toHaveBeenCalled();
    expect(mockedExecuteEsql).toHaveBeenCalledWith(
      expect.objectContaining({ query: PROVIDED_ESQL })
    );
    const spec = JSON.parse(state.spec!);
    expect(spec.data.url.query).toBe(PROVIDED_ESQL);
  });

  it('escapes dotted field references produced by the model', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'bar', encoding: { x: { field: 'host.name' } } }));

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    const spec = JSON.parse(state.spec!);
    expect(spec.encoding.x.field).toBe('host\\.name');
  });

  it('retries authoring after malformed output and then succeeds', async () => {
    invoke
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce(asCodeBlock({ mark: 'line' }));

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).mark).toBe('line');
  });

  it('retries authoring when the spec fails render validation, then succeeds', async () => {
    invoke
      .mockResolvedValueOnce(asCodeBlock({ mark: 'bar', encoding: { x: { field: 'status' } } }))
      .mockResolvedValueOnce(asCodeBlock({ mark: 'line', encoding: { x: { field: 'status' } } }));
    mockedValidateVegaSpec
      .mockResolvedValueOnce({ error: 'Unrecognized scale type', warnings: [] })
      .mockResolvedValueOnce({ warnings: [] });

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).mark).toBe('line');
  });

  it('rejects an authored spec with no renderable view and retries', async () => {
    invoke
      .mockResolvedValueOnce(asCodeBlock({ title: 'no mark here' }))
      .mockResolvedValueOnce(asCodeBlock({ mark: 'arc' }));

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).mark).toBe('arc');
  });

  it('retries when a rendered spec emits an actionable warning, then accepts the clean spec', async () => {
    invoke
      .mockResolvedValueOnce(asCodeBlock({ layer: [{ mark: 'rule' }, { mark: 'circle' }] }))
      .mockResolvedValueOnce(asCodeBlock({ layer: [{ mark: 'bar' }] }));
    mockedValidateVegaSpec
      .mockResolvedValueOnce({
        warnings: ['Conflicting legend property "disable" (false and true). Using false.'],
      })
      .mockResolvedValueOnce({ warnings: [] });

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).layer).toEqual([{ mark: 'bar' }]);
  });

  it('retries when rendered text marks overlap, then accepts the clean spec', async () => {
    invoke
      .mockResolvedValueOnce(asCodeBlock({ layer: [{ mark: 'text' }, { mark: 'text' }] }))
      .mockResolvedValueOnce(asCodeBlock({ layer: [{ mark: 'text' }] }));
    mockedValidateVegaSpec
      .mockResolvedValueOnce({
        warnings: [
          'Overlapping text marks detected ("4" overlaps "Current Period"); space the text marks out (or shrink the font) so labels do not collide.',
        ],
      })
      .mockResolvedValueOnce({ warnings: [] });

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).layer).toEqual([{ mark: 'text' }]);
  });

  it('does not retry for a benign warning', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'bar' }));
    mockedValidateVegaSpec.mockResolvedValue({ warnings: ['Dropping a duplicate something'] });

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).mark).toBe('bar');
  });

  it('keeps the rendered spec when an actionable warning persists past the retry budget', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'bar' }));
    mockedValidateVegaSpec.mockResolvedValue({
      warnings: ['Conflicting legend property "disable" (false and true). Using false.'],
    });

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    // Exhausts the retry budget trying to repair the warning, but never blocks:
    // the last rendered spec is still returned.
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).mark).toBe('bar');
  });

  it('routes a raw Vega spec through the raw normalize path (binds ES|QL onto "source")', async () => {
    invoke.mockResolvedValue(
      asCodeBlock({
        $schema: 'https://vega.github.io/schema/vega/v3.json',
        data: [{ name: 'source' }, { name: 'nodes', source: 'source' }],
        marks: [{ type: 'rect', from: { data: 'nodes' } }],
      })
    );

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(state.error).toBeNull();
    const spec = JSON.parse(state.spec!);
    expect(spec.$schema).toBe(VEGA_V5_SCHEMA);
    expect(spec.data[0]).toEqual({
      name: 'source',
      url: { '%type%': 'esql', query: PROVIDED_ESQL },
    });
    expect(spec.data[1]).toEqual({ name: 'nodes', source: 'source' });
  });

  it('rejects a raw Vega spec missing a "source" data set and retries', async () => {
    invoke
      .mockResolvedValueOnce(
        asCodeBlock({
          $schema: 'https://vega.github.io/schema/vega/v5.json',
          data: [{ name: 'rawData' }],
          marks: [{ type: 'rect' }],
        })
      )
      .mockResolvedValueOnce(
        asCodeBlock({
          $schema: 'https://vega.github.io/schema/vega/v5.json',
          data: [{ name: 'source' }],
          marks: [{ type: 'rect', from: { data: 'source' } }],
        })
      );

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).$schema).toBe(VEGA_V5_SCHEMA);
  });

  it('regenerates a corrected query when the provided ES|QL fails to execute', async () => {
    invoke.mockResolvedValue(asCodeBlock({ mark: 'bar' }));
    // The provided query throws (an invalid, agent-invented query); the
    // regenerated query then executes cleanly.
    mockedExecuteEsql
      .mockRejectedValueOnce(
        new Error('verification_exception: second argument of [half_ms * 1ms] must be [numeric]')
      )
      .mockResolvedValue({ columns: [], values: [] } as Awaited<ReturnType<typeof executeEsql>>);

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    // A bad provided query is routed through the self-correcting generator
    // instead of aborting, so we still produce a working chart.
    expect(mockedGenerateEsql).toHaveBeenCalledTimes(1);
    expect(state.error).toBeNull();
    expect(JSON.parse(state.spec!).data.url.query).toBe(GENERATED_ESQL);
  });

  it('aborts only after both the provided query and regeneration fail to execute', async () => {
    mockedExecuteEsql.mockRejectedValue(
      new Error('verification_exception: second argument of [half_ms * 1ms] must be [numeric]')
    );

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    // The provided query is discarded and regeneration is attempted; when that
    // also cannot execute, we abort instead of authoring around a broken query.
    expect(mockedGenerateEsql).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(state.spec).toBeNull();
    expect(state.error).toContain('Could not resolve a valid ES|QL query');
    expect(state.error).toContain('verification_exception');
  });

  it('aborts when generateEsql exhausts its retries and returns an error', async () => {
    mockedGenerateEsql.mockResolvedValue({
      query: 'FROM logs-* | EVAL x = half_ms * 1 millisecond',
      error: 'verification_exception: second argument of [half_ms * 1ms] must be [numeric]',
    } as Awaited<ReturnType<typeof generateEsql>>);

    const state = await run();

    // A query that generateEsql itself could not validate must not be authored.
    expect(invoke).not.toHaveBeenCalled();
    expect(state.spec).toBeNull();
    expect(state.error).toContain('Could not resolve a valid ES|QL query');
    expect(state.error).toContain('verification_exception');
  });

  it('gives up after the retry budget and reports an error', async () => {
    invoke.mockResolvedValue('still not json');

    const state = await run({ esqlQuery: PROVIDED_ESQL });

    expect(state.spec).toBeNull();
    expect(state.error).toEqual(expect.any(String));
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
