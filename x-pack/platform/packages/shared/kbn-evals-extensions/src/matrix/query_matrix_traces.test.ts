/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument } from '@kbn/evals-common';
import {
  aliasTraceKeys,
  countRepetitions,
  exampleScoresByEvaluator,
  exampleSpreadByEvaluator,
  overlayRepeatedCacheTrails,
  queryMatrixTraces,
} from './query_matrix_traces';
import type { MatrixTraceData } from './trace_types';

const doc = (evaluatorName: string | undefined, score: number | null): EvaluationScoreDocument =>
  ({
    evaluator: { name: evaluatorName, score },
  } as EvaluationScoreDocument);

describe('exampleScoresByEvaluator', () => {
  it('means scores per evaluator across repetitions', () => {
    const result = exampleScoresByEvaluator([
      doc('ExpectedToolCalled', 0.8),
      doc('ExpectedToolCalled', 1),
      doc('Correctness', 0.5),
    ]);
    expect(result).toEqual({ ExpectedToolCalled: 0.9, Correctness: 0.5 });
  });

  it('skips documents without an evaluator name or a numeric score', () => {
    const result = exampleScoresByEvaluator([
      doc('ExpectedToolCalled', 0.8),
      doc('ExpectedToolCalled', null),
      doc(undefined, 0.4),
    ]);
    expect(result).toEqual({ ExpectedToolCalled: 0.8 });
  });

  it('returns an empty map when nothing is scorable', () => {
    expect(exampleScoresByEvaluator([doc('ExpectedToolCalled', null)])).toEqual({});
    expect(exampleScoresByEvaluator([])).toEqual({});
  });
});

describe('exampleSpreadByEvaluator', () => {
  const repDoc = (name: string, score: number, repetition: number) =>
    ({
      evaluator: { name, score },
      task: { repetition_index: repetition },
    } as unknown as EvaluationScoreDocument);

  it('reports max - min per evaluator across repetitions', () => {
    expect(
      exampleSpreadByEvaluator([repDoc('Groundedness', 0, 0), repDoc('Groundedness', 20, 1)])
    ).toEqual({ Groundedness: 20 });
  });

  it('distinguishes a volatile cell from a stable one with the same mean', () => {
    // Both average to 10 — the mean alone cannot tell these apart, which is
    // the entire reason this function exists.
    const stable = [
      repDoc('Relevance', 10, 0),
      repDoc('Relevance', 10, 1),
      repDoc('Relevance', 10, 2),
    ];
    const volatile = [
      repDoc('Relevance', 0, 0),
      repDoc('Relevance', 10, 1),
      repDoc('Relevance', 20, 2),
    ];

    expect(exampleScoresByEvaluator(stable)).toEqual(exampleScoresByEvaluator(volatile));
    expect(exampleSpreadByEvaluator(stable)).toEqual({ Relevance: 0 });
    expect(exampleSpreadByEvaluator(volatile)).toEqual({ Relevance: 20 });
  });

  it('omits evaluators observed only once rather than claiming zero spread', () => {
    // A single observation has no measured stability; emitting 0 would assert
    // one that was never tested.
    expect(exampleSpreadByEvaluator([repDoc('Factuality', 7, 0)])).toEqual({});
  });

  it('ignores documents with no numeric score', () => {
    const missing = { evaluator: { name: 'criteria' } } as unknown as EvaluationScoreDocument;
    expect(
      exampleSpreadByEvaluator([repDoc('criteria', 1, 0), missing, repDoc('criteria', 0, 1)])
    ).toEqual({ criteria: 1 });
  });
});

describe('countRepetitions', () => {
  const repDoc = (repetitionIndex: number | undefined): EvaluationScoreDocument =>
    ({ task: { repetition_index: repetitionIndex } } as EvaluationScoreDocument);

  it('counts distinct repetition indices', () => {
    expect(countRepetitions([repDoc(0), repDoc(0), repDoc(1), repDoc(2)])).toBe(3);
  });

  it('treats a missing index as repetition 0', () => {
    expect(countRepetitions([repDoc(undefined), repDoc(0)])).toBe(1);
  });
});

describe('queryMatrixTraces example fetching', () => {
  const completeDoc = (executionId: string): EvaluationScoreDocument =>
    ({
      example: { id: 'example-1' },
      evaluator: { name: 'Correctness', score: 1 },
      metadata: { execution_id: executionId },
      task: {
        model: { id: 'model-x' },
        output: { messages: [{ message: 'done' }] },
        repetition_index: 0,
      },
    } as unknown as EvaluationScoreDocument);

  const makeClient = (opts: { filtered: boolean }) => {
    const getExampleScores = jest.fn(
      async (_exampleId: string, filters?: { executionId?: string }) =>
        // A server that knows the filters returns only that execution; an old
        // server ignores them and returns every execution mixed together.
        opts.filtered
          ? [completeDoc(filters?.executionId ?? 'exec-a')]
          : [completeDoc('exec-a'), completeDoc('exec-b')]
    );
    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores,
    };
    return client;
  };

  const aggregatedFor = (experimentId: string) => [
    {
      modelId: 'model-x',
      suites: [{ suiteId: 'suite-1', experimentId, datasets: [], evaluators: [] }],
    },
  ];

  const logStub = {
    debug: jest.fn(),
    warning: jest.fn(),
  };

  it('applies configured model aliases to the resolved trace keys', async () => {
    // Wiring guard: aliasTraceKeys must be called by queryMatrixTraces itself.
    // Without the call, aliased OpenRouter rows resolve zero trace cells even
    // though the helper is correct in isolation.
    const client = makeClient({ filtered: true });
    const traces = await queryMatrixTraces(
      client as never,
      logStub as never,
      aggregatedFor('exec-a') as never,
      undefined,
      0,
      new Map([['openrouter-model-x', ['model-x']]])
    );
    expect(traces['model-x:example-1']).toBeDefined();
    expect(traces['openrouter-model-x:example-1']).toEqual(traces['model-x:example-1']);
  });

  it('arms the legacy fallback when a later response reveals unfiltered scores', async () => {
    // Discriminates the latch specifically: the FIRST response is empty (proves
    // nothing), the SECOND returns mixed executions (proves the server ignores
    // filters). With the old `scores.length === 0 ||` latch the first response
    // pinned serverSupportsFilter=true and this warning never fired.
    let call = 0;
    const getExampleScores = jest.fn(async () => {
      call += 1;
      return call === 1 ? [] : [completeDoc('exec-a'), completeDoc('exec-b')];
    });
    const client = {
      getExperimentScores: jest.fn(
        async () =>
          [
            { example: { id: 'example-1' } },
            { example: { id: 'example-2' } },
          ] as EvaluationScoreDocument[]
      ),
      getExampleScores,
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(client as never, log as never, aggregatedFor('exec-a') as never);

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('Example-scores route ignores execution filters')
    );
  });

  it('reports runaway tool loops above the configured threshold', async () => {
    const heavy = (calls: number, trail: number): EvaluationScoreDocument =>
      ({
        example: { id: 'example-1' },
        evaluator: { name: 'Tool Calls', score: calls },
        metadata: { execution_id: 'exec-a' },
        task: {
          model: { id: 'model-x' },
          output: {
            messages: [{ message: 'done' }],
            steps: Array.from({ length: trail }, () => ({
              type: 'tool_call',
              tool_id: 'platform.core.search',
            })),
          },
          repetition_index: 0,
        },
      } as unknown as EvaluationScoreDocument);

    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores: jest.fn(async () => [heavy(44, 44)]),
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(
      client as never,
      log as never,
      aggregatedFor('exec-a') as never,
      undefined,
      40
    );

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('Possible runaway tool loops')
    );
  });

  it('does not cite a tool-call count the recorded trail cannot corroborate', async () => {
    // The real shape from golden: openai-gpt-5.2:alert-analysis-c scored 115
    // against a 29-call trail (ratio 4.0) on 2026-08-22, while its five sibling
    // executions of the same cell scored ~1.2x their trails. Reported as a loop
    // length it became the headline "115 calls" in downstream summaries — a
    // number no trace supports.
    const scoredWithTrail = (calls: number, trail: number): EvaluationScoreDocument =>
      ({
        example: { id: 'example-1' },
        evaluator: { name: 'Tool Calls', score: calls },
        metadata: { execution_id: 'exec-a' },
        task: {
          model: { id: 'model-x' },
          output: {
            messages: [{ message: 'done' }],
            steps: Array.from({ length: trail }, () => ({
              type: 'tool_call',
              tool_id: 'platform.core.search',
            })),
          },
          repetition_index: 0,
        },
      } as unknown as EvaluationScoreDocument);

    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores: jest.fn(async () => [scoredWithTrail(115, 29)]),
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(
      client as never,
      log as never,
      aggregatedFor('exec-a') as never,
      undefined,
      40
    );

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining("'Tool Calls' exceeds the recorded tool trail")
    );
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('=115 (trail 29)'));
    // It must NOT also be presented as a genuine loop length.
    expect(log.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('Possible runaway tool loops')
    );
  });

  it('still reports a high count when no trail is available to refute it', async () => {
    // A cell with no cached steps cannot corroborate OR refute the count, so it
    // must stay reportable rather than being silently dropped as suspect.
    const noTrailDoc = {
      example: { id: 'example-1' },
      evaluator: { name: 'Tool Calls', score: 115 },
      metadata: { execution_id: 'exec-a' },
      task: {
        model: { id: 'model-x' },
        output: { messages: [{ message: 'done' }] },
        repetition_index: 0,
      },
    } as unknown as EvaluationScoreDocument;

    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores: jest.fn(async () => [noTrailDoc]),
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(
      client as never,
      log as never,
      aggregatedFor('exec-a') as never,
      undefined,
      40
    );

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('Possible runaway tool loops')
    );
  });

  it('does not report tool loops when the threshold is disabled', async () => {
    const client = makeClient({ filtered: true });
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(client as never, log as never, aggregatedFor('exec-a') as never);

    expect(log.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('Possible runaway tool loops')
    );
  });

  it('does not treat an empty response as proof the server honours filters', async () => {
    // The regression: an empty first response latched serverSupportsFilter=true,
    // so the legacy fallback never armed and every later cell came back empty —
    // 442/442 hollow traces while scores rendered perfectly.
    const empty = jest.fn(async () => [] as EvaluationScoreDocument[]);
    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores: empty,
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(client as never, log as never, aggregatedFor('exec-a') as never);

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('Trace fetch returned no documents')
    );
  });

  it('stays quiet about total trace loss when documents do come back', async () => {
    const client = makeClient({ filtered: true });
    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(client as never, log as never, aggregatedFor('exec-a') as never);

    expect(log.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('Trace fetch returned no documents')
    );
  });

  it('passes the execution filter to the example-scores route', async () => {
    const client = makeClient({ filtered: true });
    const traces = await queryMatrixTraces(
      client as never,
      logStub as never,
      aggregatedFor('exec-a') as never
    );
    expect(client.getExampleScores).toHaveBeenCalledWith('example-1', {
      executionId: 'exec-a',
      modelId: 'model-x',
    });
    expect(Object.keys(traces)).toContain('model-x:example-1');
  });

  it('detects an unfiltered (legacy) server and reuses the shared fetch across runs', async () => {
    const client = makeClient({ filtered: false });
    await queryMatrixTraces(
      client as never,
      logStub as never,
      [...aggregatedFor('exec-a'), ...aggregatedFor('exec-b')] as never
    );
    // Second run for the same example reuses the first fetch instead of
    // re-downloading the full unfiltered payload.
    expect(client.getExampleScores).toHaveBeenCalledTimes(1);
  });

  it('serves cells from the trace cache without touching the server', async () => {
    const client = makeClient({ filtered: true });
    const traceCache = {
      'exec-a::example-1': [completeDoc('exec-a')],
    };
    const traces = await queryMatrixTraces(
      client as never,
      logStub as never,
      aggregatedFor('exec-a') as never,
      traceCache as never
    );
    expect(client.getExampleScores).not.toHaveBeenCalled();
    expect(traces['model-x:example-1']).toMatchObject({
      scores: { Correctness: 1 },
      repetitions: 1,
    });
  });

  it('does not duplicate the direct example key under prefix:<exampleId>', async () => {
    const client = makeClient({ filtered: true });
    // Per-example columns set examplePrefixes to the full example id, which
    // would emit prefix:example-1 as a byte-duplicate of example-1.
    const aggregated = [
      {
        modelId: 'model-x',
        suites: [
          {
            suiteId: 'suite-1',
            experimentId: 'exec-a',
            datasets: [{ datasetId: 'prefix:example-1' }],
            evaluators: [],
          },
        ],
      },
    ];
    const traces = await queryMatrixTraces(client as never, logStub as never, aggregated as never);
    expect(Object.keys(traces)).toContain('model-x:example-1');
    expect(Object.keys(traces)).not.toContain('model-x:prefix:example-1');
  });

  it('fetches once per example on a legacy server even with many runs', async () => {
    const client = makeClient({ filtered: false });
    const aggregated = Array.from({ length: 6 }, (_, i) => aggregatedFor(`exec-${i}`)).flat();
    await queryMatrixTraces(client as never, logStub as never, aggregated as never);
    expect(client.getExampleScores).toHaveBeenCalledTimes(1);
  });

  it('fans out over every execution id of a sharded suite row', async () => {
    // A sharded sweep splits one model's examples across executions. Trace
    // enumeration that reads only experimentId sees ONE shard's examples and
    // the other shard's cells render "trace unavailable" forever.
    const shardedDoc = (executionId: string, exampleId: string): EvaluationScoreDocument =>
      ({
        example: { id: exampleId },
        metadata: { execution_id: executionId },
        evaluator: { name: 'Correctness', score: 1 },
        task: {
          model: { id: 'model-x' },
          output: { messages: [{ message: 'done' }] },
          repetition_index: 0,
        },
      } as unknown as EvaluationScoreDocument);

    const getExperimentScores = jest.fn(
      async (_experimentId: string, { executionId }: { executionId?: string }) =>
        executionId === 'sweep-9-s1of2::suite::model-x'
          ? [shardedDoc('sweep-9-s1of2::suite::model-x', 'example-1')]
          : [shardedDoc('sweep-9-s2of2::suite::model-x', 'example-2')]
    );
    const getExampleScores = jest.fn(
      async (_exampleId: string, { executionId }: { executionId?: string }) => [
        shardedDoc(executionId ?? '?', _exampleId),
      ]
    );
    const client = { getExperimentScores, getExampleScores };
    const log = { debug: jest.fn(), warning: jest.fn() };

    const aggregated = [
      {
        modelId: 'model-x',
        suites: [
          {
            suiteId: 'suite-1',
            experimentId: 'sweep-9-s1of2::suite::model-x',
            executionIds: ['sweep-9-s1of2::suite::model-x', 'sweep-9-s2of2::suite::model-x'],
            datasets: [],
          },
        ],
      },
    ];

    await queryMatrixTraces(client as never, log as never, aggregated as never);

    // Both shards enumerated: each contributed its own example.
    expect(getExperimentScores).toHaveBeenCalledTimes(2);
    const enumeratedExecs = getExperimentScores.mock.calls.map((c) => c[1]?.executionId).sort();
    expect(enumeratedExecs).toEqual([
      'sweep-9-s1of2::suite::model-x',
      'sweep-9-s2of2::suite::model-x',
    ]);
    // No "trace unavailable" for the second shard's example.
    expect(log.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('No complete score documents found')
    );
  });

  it('fetches each (run, example) pair on a filtered server with no cross-run aliasing', async () => {
    const client = makeClient({ filtered: true });
    await queryMatrixTraces(
      client as never,
      logStub as never,
      [...aggregatedFor('exec-a'), ...aggregatedFor('exec-b')] as never
    );
    expect(client.getExampleScores).toHaveBeenCalledTimes(2);
    const executions = client.getExampleScores.mock.calls.map(([, f]) => f?.executionId).sort();
    expect(executions).toEqual(['exec-a', 'exec-b']);
  });

  it('bounds example-fetch concurrency and overlaps work across runs', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const getExampleScores = jest.fn(
      async (_exampleId: string, filters?: { executionId?: string }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return [completeDoc(filters?.executionId ?? 'exec-a')];
      }
    );
    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores,
    };
    const aggregated = Array.from({ length: 12 }, (_, i) => aggregatedFor(`exec-${i}`)).flat();
    await queryMatrixTraces(client as never, logStub as never, aggregated as never);
    // First pair runs alone for filter detection; the remaining 11 pool at ≤8.
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(getExampleScores).toHaveBeenCalledTimes(12);
  });

  it('warns with model and example names when some scored cells lose their trace', async () => {
    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }, { example: { id: 'example-2' } }] as never
      ),
      // example-2 comes back with no documents at all: scores were aggregated
      // for it upstream, but no trace doc exists for this execution.
      getExampleScores: jest.fn(async (exampleId: string) =>
        exampleId === 'example-1' ? [completeDoc('exec-a')] : []
      ),
    };
    const log = { debug: jest.fn(), warning: jest.fn() };
    const traces = await queryMatrixTraces(
      client as never,
      log as never,
      aggregatedFor('exec-a') as never
    );
    expect(Object.keys(traces)).toContain('model-x:example-1');
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('Trace coverage incomplete'));
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('example-2'));
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('model-x'));
  });

  it('retries a transient fetch failure once before dropping the trace', async () => {
    let calls = 0;
    const getExampleScores = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('503 Service Unavailable');
      return [completeDoc('exec-a')];
    });
    const client = {
      getExperimentScores: jest.fn(
        async () => [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[]
      ),
      getExampleScores,
    };
    const traces = await queryMatrixTraces(
      client as never,
      logStub as never,
      aggregatedFor('exec-a') as never
    );
    expect(getExampleScores).toHaveBeenCalledTimes(2);
    expect(Object.keys(traces)).toContain('model-x:example-1');
  });

  it('enumerates experiments concurrently in phase 1', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const getExperimentScores = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [{ example: { id: 'example-1' } }] as EvaluationScoreDocument[];
    });
    const client = {
      getExperimentScores,
      getExampleScores: jest.fn(async () => [completeDoc('exec-a')]),
    };
    const aggregated = Array.from({ length: 8 }, (_, i) => aggregatedFor(`exec-${i}`)).flat();
    await queryMatrixTraces(client as never, logStub as never, aggregated as never);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(getExperimentScores).toHaveBeenCalledTimes(8);
  });

  it('flags a broken Tool Calls metric when the trail is non-empty but the score is 0', async () => {
    // Observed on real golden data: 4.5-sonnet scored Tool Calls=0 on 20/20
    // cells whose traces showed 43+ real calls. Unreported that publishes as
    // "this model uses no tools" and hides genuine tool-loop failures.
    const zeroToolCallDoc = {
      example: { id: 'example-1' },
      evaluator: { name: 'Tool Calls', score: 0 },
      metadata: { execution_id: 'exec-a' },
      task: {
        model: { id: 'model-x' },
        output: {
          messages: [{ message: 'done' }],
          steps: [
            { type: 'tool_call', tool_id: 'load_skill' },
            { type: 'tool_call', tool_id: 'load_skill' },
          ],
        },
        repetition_index: 0,
      },
    } as unknown as EvaluationScoreDocument;

    const log = { debug: jest.fn(), warning: jest.fn() };
    await queryMatrixTraces(
      makeClient({ filtered: true }) as never,
      log as never,
      aggregatedFor('exec-a') as never,
      { 'exec-a::example-1': [zeroToolCallDoc] } as never,
      40
    );

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining("'Tool Calls' reads 0 despite a non-empty tool trail")
    );
  });
});

describe('overlayRepeatedCacheTrails', () => {
  const scored = (model: string, toolId: string, repetition: number): EvaluationScoreDocument =>
    ({
      task: {
        model: { id: model },
        repetition_index: repetition,
        output: { steps: [{ type: 'tool_call', tool_id: toolId }] },
      },
    } as unknown as EvaluationScoreDocument);

  it('overlays the genuine 3-rep execution and ignores sibling 1-rep weekly runs', () => {
    const traces: MatrixTraceData = {
      'opus:workflow-authoring-a': { toolTrail: ['weekly'] },
    };
    overlayRepeatedCacheTrails(traces, {
      'old::security-persona-matrix::opus::workflow-authoring-a': [
        scored('opus', 'generate_workflow', 0),
        scored('opus', 'generate_workflow', 1),
        scored('opus', 'sml_search', 2),
      ],
      'weekly::security-persona-matrix::opus::workflow-authoring-a': [
        scored('opus', 'execute_api', 0),
      ],
    });
    expect(traces['opus:workflow-authoring-a'].repTrails).toEqual([
      ['generate_workflow'],
      ['generate_workflow'],
      ['sml_search'],
    ]);
  });

  it('does not invent repeats by concatenating two 1-rep executions', () => {
    const traces: MatrixTraceData = {};
    overlayRepeatedCacheTrails(traces, {
      'run-a::security-persona-matrix::gpt::workflow-authoring-a': [scored('gpt', 'search', 0)],
      'run-b::security-persona-matrix::gpt::workflow-authoring-a': [scored('gpt', 'load_skill', 0)],
    });
    expect(traces['gpt:workflow-authoring-a']).toBeUndefined();
  });
});

describe('aliasTraceKeys', () => {
  const entry = (stepCount: number) => ({ stepCount } as MatrixTraceData[string]);

  it('mirrors provider-keyed cells onto the row id for aliased models', () => {
    // Regression: OpenRouter rows are keyed by connector id
    // (openrouter-deepseek-v4-pro) while score docs report task.model.id as the
    // upstream slug (deepseek/deepseek-v4-pro-0813), so every cell rendered
    // "Trace unavailable" despite a full set of traces being present.
    const traces: MatrixTraceData = {
      'deepseek/deepseek-v4-pro-0813:alert-analysis-a': entry(24),
      'deepseek/deepseek-v4-pro-0813:detection-rule-edit-b': entry(11),
    };
    aliasTraceKeys(
      traces,
      new Map([['openrouter-deepseek-v4-pro', ['deepseek/deepseek-v4-pro-0813']]])
    );
    expect(traces['openrouter-deepseek-v4-pro:alert-analysis-a']).toEqual(entry(24));
    expect(traces['openrouter-deepseek-v4-pro:detection-rule-edit-b']).toEqual(entry(11));
  });

  it('does not clobber a cell the row already resolved under its own id', () => {
    const traces: MatrixTraceData = {
      'row:alert-analysis-a': entry(5),
      'provider/slug:alert-analysis-a': entry(99),
    };
    aliasTraceKeys(traces, new Map([['row', ['provider/slug']]]));
    expect(traces['row:alert-analysis-a']).toEqual(entry(5));
  });

  it('leaves non-aliased (EIS) rows untouched', () => {
    const traces: MatrixTraceData = { 'anthropic-claude-4.5-haiku:alert-analysis-a': entry(7) };
    const before = { ...traces };
    aliasTraceKeys(traces, new Map());
    expect(traces).toEqual(before);
  });

  it('only rewrites the example suffix, not example ids containing the alias', () => {
    const traces: MatrixTraceData = { 'provider/slug:prefix:alert-analysis': entry(3) };
    aliasTraceKeys(traces, new Map([['row', ['provider/slug']]]));
    expect(traces['row:prefix:alert-analysis']).toEqual(entry(3));
  });
});
