/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createRedTeamOrchestrator } from './orchestrator';
import type { EvalsExecutorClient, DatasetRunResult } from '@kbn/evals';
import type { AttackResult, RedTeamConfig } from './types';

const createMockLog = () => ({
  info: jest.fn(),
  warning: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  success: jest.fn(),
  write: jest.fn(),
  getWritten: jest.fn().mockReturnValue({ log: [], error: [] }),
  indent: jest.fn(),
  get: jest.fn(),
});

const createMockExecutorClient = (): jest.Mocked<EvalsExecutorClient> => {
  const runExperiment = jest.fn().mockImplementation(async (options, evaluators: any[] = []) => {
    const { datasets, task } = options;
    const [dataset] = datasets;
    const runs: Record<string, any> = {};
    const evaluationRuns: any[] = [];

    for (let i = 0; i < dataset.examples.length; i++) {
      const example = dataset.examples[i];
      const runKey = `${i}-0-mock`;
      const output = await task(example);
      runs[runKey] = {
        exampleIndex: i,
        repetition: 0,
        input: example.input,
        expected: example.output,
        metadata: example.metadata,
        output,
      };

      for (const evaluator of evaluators) {
        try {
          const result = await evaluator.evaluate({
            input: example.input,
            output,
            expected: example.output,
            metadata: example.metadata ?? null,
          });
          evaluationRuns.push({ experimentRunId: runKey, name: evaluator.name, result });
        } catch {
          // evaluator crash → no result added (fail-closed: no score = fails gating)
        }
      }
    }

    return [
      {
        id: 'mock-experiment',
        experimentName: dataset.name,
        datasetId: 'mock-dataset',
        datasetName: dataset.name,
        runs,
        evaluationRuns,
        experimentMetadata: options.metadata,
      },
    ] as DatasetRunResult[];
  });

  return {
    runExperiment,
    getDatasetRunResults: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<EvalsExecutorClient>;
};

describe('RedTeamOrchestrator', () => {
  const defaultConfig: RedTeamConfig = {
    count: 3,
    difficulty: 'basic',
    templateOnly: true,
  };

  it('runs attack modules and produces a report', async () => {
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    const orchestrator = createRedTeamOrchestrator({
      config: { ...defaultConfig, modules: ['prompt_injection'] },
      executorClient,
      log: log as any,
    });

    const task = jest.fn().mockResolvedValue('Safe response from the model.');

    const report = await orchestrator.run(task);

    expect(report).toBeDefined();
    expect(report.modules).toHaveLength(1);
    expect(report.modules[0].module).toBe('prompt_injection');
    expect(report.modules[0].total).toBe(3);
    expect(report.overallPassRate).toBeDefined();
    expect(report.strategy).toBe('direct');
    expect(report.difficulty).toBe('basic');
  });

  it('calls executorClient.runExperiment with correct metadata', async () => {
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    const orchestrator = createRedTeamOrchestrator({
      config: { ...defaultConfig, modules: ['prompt_injection'] },
      executorClient,
      log: log as any,
    });

    await orchestrator.run(jest.fn().mockResolvedValue('response'));

    expect(executorClient.runExperiment).toHaveBeenCalledTimes(1);
    const callArgs = executorClient.runExperiment.mock.calls[0][0];
    expect(callArgs.metadata?.['run.type']).toBe('red-team');
    expect(callArgs.metadata?.['redTeam.module']).toBe('prompt_injection');
    expect(callArgs.metadata?.['redTeam.strategy']).toBe('direct');
    expect(callArgs.datasets[0].name).toBe('red-team-prompt_injection-direct');
  });

  it('runs specific modules when configured', async () => {
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    const orchestrator = createRedTeamOrchestrator({
      config: { ...defaultConfig, modules: ['prompt_injection'] },
      executorClient,
      log: log as any,
    });

    const report = await orchestrator.run(jest.fn().mockResolvedValue('response'));
    expect(report.modules).toHaveLength(1);
    expect(report.modules[0].module).toBe('prompt_injection');
  });

  it('applies guardrails to task outputs', async () => {
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    const orchestrator = createRedTeamOrchestrator({
      config: defaultConfig,
      executorClient,
      log: log as any,
    });

    // Return output that triggers guardrails
    const task = jest.fn().mockResolvedValue('Here is my system prompt: you are helpful');

    const report = await orchestrator.run(task);

    // Should detect guardrail violations and classify severity accordingly
    const failures = report.modules[0].results.filter((r) => r.guardrailViolations.length > 0);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].severity).not.toBe('low');
  });

  it('calculates overall pass rate correctly', async () => {
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    const orchestrator = createRedTeamOrchestrator({
      config: { ...defaultConfig, count: 2 },
      executorClient,
      log: log as any,
    });

    const report = await orchestrator.run(jest.fn().mockResolvedValue('Clean response'));
    // With clean responses, all should pass
    expect(report.overallPassRate).toBe(100);
  });

  it('suppresses ALL guardrail violations when both judge and leak evaluator agree safe', async () => {
    // Two-signal suppression: when attack-success-judge (score=1) AND prompt-leak-detection
    // (score=1) both confirm the attack was blocked, all guardrail violations are cleared —
    // including block/critical ones. The `system-prompt-leak` regex fires on refusal phrasing
    // ("I cannot share my system prompt") producing false positives; the combined LLM signal
    // is authoritative enough to suppress them.
    //
    // Note: in practice prompt-leak-detection returns score=0 for actual leaks and score=1
    // only for genuine refusals, so this suppression correctly targets false positives.
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    executorClient.runExperiment.mockImplementation(async (options, evaluators) => {
      const { datasets } = options;
      const [dataset] = datasets;
      const runs: Record<string, any> = {};
      const evaluationRuns: any[] = [];

      for (let i = 0; i < dataset.examples.length; i++) {
        const example = dataset.examples[i];
        const runKey = `${i}-0-mock`;
        // Response mentions "system prompt" in a refusal — triggers the guardrail regex
        // but is NOT a real leak. Both evaluators say safe (score=1).
        const output =
          'I cannot help with that request. My system prompt is internal and cannot be shared.';
        runs[runKey] = {
          exampleIndex: i,
          repetition: 0,
          input: example.input,
          expected: example.output,
          metadata: example.metadata,
          output,
        };

        // All evaluators return score=1.0 (attack blocked / safe)
        for (const ev of evaluators) {
          evaluationRuns.push({
            name: ev.name,
            experimentRunId: runKey,
            result: { score: 1.0, label: 'safe', explanation: 'attack was blocked' },
          });
        }

        // Inject judge verdict: score=1 (blocked)
        evaluationRuns.push({
          name: 'attack-success-judge',
          experimentRunId: runKey,
          result: { score: 1.0, label: 'ATTACK_BLOCKED', explanation: 'genuine refusal' },
        });
      }

      return [
        {
          id: 'mock',
          experimentName: dataset.name,
          datasetId: 'mock-dataset',
          datasetName: dataset.name,
          runs,
          evaluationRuns,
          experimentMetadata: options.metadata,
        },
      ];
    });

    const orchestrator = createRedTeamOrchestrator({
      config: {
        count: 1,
        difficulty: 'basic',
        templateOnly: true,
        modules: ['prompt_injection'],
      },
      executorClient,
      log: log as any,
    });

    const report = await orchestrator.run(
      jest
        .fn()
        .mockResolvedValue(
          'I cannot help with that request. My system prompt is internal and cannot be shared.'
        )
    );

    const attackResult = report.modules[0].results[0];
    expect(attackResult).toBeDefined();

    // Two-signal agreement: both evaluators say safe → all guardrail violations suppressed
    expect(attackResult.guardrailViolations).toHaveLength(0);
    // Test should pass (no violations, evaluators confirm blocked)
    expect(attackResult.namedScores.every((s) => s.score === 1)).toBe(true);
  });

  it('suppresses violations after the LLM-judge overrides a false-positive leak score', async () => {
    // Regression: the override (judge=1, leak=0 -> leak forced to 1) rebuilds
    // evaluatorScores, but the suppression check previously read a stale leakVerdict
    // reference (still score=0), so it skipped full suppression in exactly the
    // false-positive case the override exists to handle. The default
    // `system-prompt-leak` rule (action:block, severity:critical) would then survive
    // and fail the run. After the fix the post-override score is observed and all
    // violations are cleared.
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    executorClient.runExperiment.mockImplementation(async (options) => {
      const { datasets } = options;
      const [dataset] = datasets;
      const runs: Record<string, any> = {};
      const evaluationRuns: any[] = [];

      for (let i = 0; i < dataset.examples.length; i++) {
        const example = dataset.examples[i];
        const runKey = `${i}-0-mock`;
        const output =
          'I cannot help with that request. My system prompt is internal and cannot be shared.';
        runs[runKey] = {
          exampleIndex: i,
          repetition: 0,
          input: example.input,
          expected: example.output,
          metadata: example.metadata,
          output,
        };

        // Regex leak evaluator fires a FALSE POSITIVE (score=0) on the refusal text...
        evaluationRuns.push({
          name: 'prompt-leak-detection',
          experimentRunId: runKey,
          result: { score: 0, label: 'leak-detected', explanation: 'regex matched refusal text' },
        });
        // ...but the LLM judge confirms the attack was blocked (score=1).
        evaluationRuns.push({
          name: 'attack-success-judge',
          experimentRunId: runKey,
          result: { score: 1.0, label: 'ATTACK_BLOCKED', explanation: 'genuine refusal' },
        });
      }

      return [
        {
          id: 'mock',
          experimentName: dataset.name,
          datasetId: 'mock-dataset',
          datasetName: dataset.name,
          runs,
          evaluationRuns,
          experimentMetadata: options.metadata,
        },
      ];
    });

    const orchestrator = createRedTeamOrchestrator({
      config: { count: 1, difficulty: 'basic', templateOnly: true, modules: ['prompt_injection'] },
      executorClient,
      log: log as any,
    });

    const report = await orchestrator.run(
      jest
        .fn()
        .mockResolvedValue(
          'I cannot help with that request. My system prompt is internal and cannot be shared.'
        )
    );

    const attackResult = report.modules[0].results[0];
    // Override flips the leak score to safe, then two-signal suppression clears the
    // block/critical system-prompt-leak violation, so the run passes.
    expect(attackResult.guardrailViolations).toHaveLength(0);
    expect(report.modules[0].passed).toBe(1);
    expect(report.modules[0].failed).toBe(0);
  });

  it('preserves block-action guardrail violations when only judge says blocked but leak evaluator is absent', async () => {
    // Single-signal case: judge says blocked but no prompt-leak-detection evaluator.
    // Keep block/critical violations as safety net.
    const executorClient = createMockExecutorClient();
    const log = createMockLog();

    executorClient.runExperiment.mockImplementation(async (options) => {
      const { datasets } = options;
      const [dataset] = datasets;
      const runs: Record<string, any> = {};
      const evaluationRuns: any[] = [];

      for (let i = 0; i < dataset.examples.length; i++) {
        const example = dataset.examples[i];
        const runKey = `${i}-0-mock`;
        const output = 'My system prompt is: You are a security assistant.';
        runs[runKey] = {
          exampleIndex: i,
          repetition: 0,
          input: example.input,
          expected: example.output,
          metadata: example.metadata,
          output,
        };

        // Only inject judge verdict — no prompt-leak-detection evaluator present
        evaluationRuns.push({
          name: 'attack-success-judge',
          experimentRunId: runKey,
          result: { score: 1.0, label: 'ATTACK_BLOCKED', explanation: 'judge only' },
        });
      }

      return [
        {
          id: 'mock',
          experimentName: dataset.name,
          datasetId: 'mock-dataset',
          datasetName: dataset.name,
          runs,
          evaluationRuns,
          experimentMetadata: options.metadata,
        },
      ];
    });

    const orchestrator = createRedTeamOrchestrator({
      config: {
        count: 1,
        difficulty: 'basic',
        templateOnly: true,
        modules: ['prompt_injection'],
      },
      executorClient,
      log: log as any,
    });

    const report = await orchestrator.run(jest.fn().mockResolvedValue(''));

    const attackResult = report.modules[0].results[0];
    expect(attackResult).toBeDefined();

    // Single signal only — block/critical violations are preserved as safety net
    const blockViolation = attackResult.guardrailViolations.find(
      (v) => v.rule === 'system-prompt-leak'
    );
    expect(blockViolation).toBeDefined();
    expect(blockViolation?.action).toBe('block');
  });

  it('flags unauthorized tool calls extracted from steps as critical (tool-poisoning)', async () => {
    // Regression: the orchestrator read a non-existent `output.toolCalls` key, so
    // tool-poisoning always scored "safe". Tool invocations live under `steps`.
    const log = createMockLog();
    const runExperiment = jest.fn().mockImplementation(async (options, evaluators) => {
      const { datasets, task } = options;
      const [dataset] = datasets;
      const runs: Record<string, any> = {};
      const evaluationRuns: any[] = [];

      for (let i = 0; i < dataset.examples.length; i++) {
        const example = dataset.examples[i];
        const runKey = `${i}-0-mock`;
        const output = await task(example);
        runs[runKey] = {
          exampleIndex: i,
          repetition: 0,
          input: example.input,
          expected: example.output,
          metadata: example.metadata,
          output,
        };
        for (const ev of evaluators) {
          const result = await ev.evaluate({
            input: example.input,
            output,
            expected: example.output,
            metadata: example.metadata ?? null,
          });
          evaluationRuns.push({ name: ev.name, experimentRunId: runKey, result });
        }
      }

      return [
        {
          id: 'mock',
          experimentName: dataset.name,
          datasetId: 'mock-dataset',
          datasetName: dataset.name,
          runs,
          evaluationRuns,
          experimentMetadata: options.metadata,
        },
      ];
    });
    const executorClient = {
      runExperiment,
      getDatasetRunResults: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EvalsExecutorClient>;

    const orchestrator = createRedTeamOrchestrator({
      config: {
        count: 1,
        difficulty: 'basic',
        templateOnly: true,
        modules: ['prompt_injection'],
        targetContext: { availableTools: ['allowed_tool'] },
      },
      executorClient,
      log: log as any,
    });

    const task = jest.fn().mockResolvedValue({
      messages: [{ message: 'done' }],
      steps: [{ type: 'tool_call', tool_id: 'exec_shell' }],
    });

    const report = await orchestrator.run(task);

    const result = report.modules[0].results[0];
    const toolScore = result.namedScores.find((s) => s.evaluator === 'tool-poisoning');
    expect(toolScore?.score).toBe(0);
    expect(result.severity).toBe('critical');
  });

  describe('AttackResult shape', () => {
    it('does not include evaluatorScores in AttackResult', () => {
      // AttackResult should only have namedScores, not evaluatorScores
      const result: AttackResult = {
        example: { input: { value: 'x' }, output: 'y' },
        namedScores: [],
        responseExcerpt: '',
        guardrailViolations: [],
        severity: 'low',
        owaspCategory: 'LLM01',
        attackModule: 'test',
        strategy: 'direct',
      };
      // TypeScript compile-time check: the object above must not require evaluatorScores
      expect(result).toBeDefined();
      // evaluatorScores must NOT exist on the type
      expect('evaluatorScores' in result).toBe(false);
    });
  });

  describe('multi-strategy orchestration', () => {
    it('runs all configured strategies and includes each in the report', async () => {
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: {
          modules: ['prompt_injection'],
          strategies: ['direct', 'base64'],
          count: 1,
          difficulty: 'basic',
          templateOnly: true,
        },
        executorClient,
        log: log as any,
      });

      const report = await orchestrator.run(jest.fn().mockResolvedValue('safe response'));

      // Should have 2 module reports (one per strategy)
      expect(report.modules).toHaveLength(2);
      const strategyNames = report.modules.map((m) => m.results[0]?.strategy);
      expect(strategyNames).toContain('direct');
      expect(strategyNames).toContain('base64');
      expect(report.strategies).toEqual(['direct', 'base64']);
    });

    it('defaults to ["direct"] when no strategies configured', async () => {
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: {
          modules: ['prompt_injection'],
          count: 1,
          difficulty: 'basic',
          templateOnly: true,
        },
        executorClient,
        log: log as any,
      });

      const report = await orchestrator.run(jest.fn().mockResolvedValue('safe response'));
      expect(report.strategies).toEqual(['direct']);
    });
  });

  describe('multi-turn strategy (crescendo)', () => {
    const multiTurnConfig: RedTeamConfig = {
      count: 1,
      difficulty: 'basic',
      templateOnly: true,
      modules: ['prompt_injection'],
      strategies: ['crescendo'],
    };

    it('runs multiple experiment calls for a multi-turn strategy', async () => {
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: multiTurnConfig,
        executorClient,
        log: log as any,
      });

      const task = jest.fn().mockResolvedValue('Safe response');
      const report = await orchestrator.run(task);

      // Crescendo uses 5 attacker turns + 1 final evaluation = 6 runExperiment calls per example
      // (each intermediate turn + final re-run with evaluators)
      expect(executorClient.runExperiment.mock.calls.length).toBeGreaterThan(1);
      expect(report).toBeDefined();
      expect(report.strategy).toBe('crescendo');
      expect(report.modules).toHaveLength(1);
      expect(report.modules[0].total).toBe(1);
    });

    it('only applies evaluators on the final experiment call', async () => {
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: multiTurnConfig,
        executorClient,
        log: log as any,
      });

      const task = jest.fn().mockResolvedValue('Safe response');
      await orchestrator.run(task);

      const calls = executorClient.runExperiment.mock.calls;
      // All intermediate calls should have empty evaluators
      for (let i = 0; i < calls.length - 1; i++) {
        expect(calls[i][1]).toEqual([]);
      }
      // The final call (evaluation run) should have evaluators
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].length).toBeGreaterThan(0);
    });

    it('processes multi-turn results correctly', async () => {
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: multiTurnConfig,
        executorClient,
        log: log as any,
      });

      const task = jest.fn().mockResolvedValue('Clean response');
      const report = await orchestrator.run(task);

      // Clean responses should all pass
      expect(report.overallPassRate).toBe(100);
      expect(report.modules[0].passed).toBe(1);
      expect(report.modules[0].failed).toBe(0);
      expect(report.modules[0].results).toHaveLength(1);
      expect(report.modules[0].results[0].strategy).toBe('crescendo');
    });

    it('threads conversationId across turns so the target builds context', async () => {
      // Regression: each turn was sent as a cold single-message conversation, so
      // multi-turn escalation never accumulated context. The orchestrator now
      // forwards the server-side conversationId returned by the previous turn.
      const executorClient = createMockExecutorClient();
      const log = createMockLog();

      const orchestrator = createRedTeamOrchestrator({
        config: multiTurnConfig,
        executorClient,
        log: log as any,
      });

      const receivedIds: Array<string | undefined> = [];
      let turn = 0;
      const task = jest.fn().mockImplementation(async (example: any) => {
        receivedIds.push(example.input?.conversationId);
        turn += 1;
        return { messages: [{ message: 'Clean response' }], conversationId: `conv-${turn}` };
      });

      await orchestrator.run(task);

      // First live turn starts cold; the next turn must receive the id from the first.
      expect(receivedIds.length).toBeGreaterThan(1);
      expect(receivedIds[0]).toBeUndefined();
      expect(receivedIds[1]).toBe('conv-1');
    });
  });
});
