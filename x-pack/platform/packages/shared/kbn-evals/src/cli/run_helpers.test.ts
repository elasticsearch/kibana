/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolingLog } from '@kbn/tooling-log';
import type { FlagsReader } from '@kbn/dev-cli-runner';
import { resolveEvaluationConnectorId, evalRunFlags } from './run_helpers';

const log = new ToolingLog();

/**
 * Minimal FlagsReader stub: only the accessors this code path touches.
 */
const flags = (values: Record<string, string | boolean | undefined>): FlagsReader =>
  ({
    string: (name: string) => values[name] as string | undefined,
    boolean: (name: string) => Boolean(values[name]),
  } as unknown as FlagsReader);

describe('resolveEvaluationConnectorId', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('returns the connector id from the flag', async () => {
    await expect(
      resolveEvaluationConnectorId('/repo', log, flags({ 'evaluation-connector-id': 'eis-x' }))
    ).resolves.toBe('eis-x');
  });

  it('falls back to EVAL_CONNECTOR_ID', async () => {
    process.env.EVAL_CONNECTOR_ID = 'eis-from-env';
    await expect(resolveEvaluationConnectorId('/repo', log, flags({}))).resolves.toBe(
      'eis-from-env'
    );
  });

  describe('--require-eis-judge', () => {
    it('rejects a self-hosted judge that graded golden data before', async () => {
      // This exact id appears 714 times in the persona-matrix golden index.
      await expect(
        resolveEvaluationConnectorId(
          '/repo',
          log,
          flags({
            'evaluation-connector-id': 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
            'require-eis-judge': true,
          })
        )
      ).rejects.toThrow(/not EIS-backed/);
    });

    it('rejects a LiteLLM alias', async () => {
      await expect(
        resolveEvaluationConnectorId(
          '/repo',
          log,
          flags({
            'evaluation-connector-id': 'LiteLLM Qwen3-Coder-30B-A3B-Instruct-AWQ',
            'require-eis-judge': true,
          })
        )
      ).rejects.toThrow(/not EIS-backed/);
    });

    it('accepts an eis-* connector', async () => {
      await expect(
        resolveEvaluationConnectorId(
          '/repo',
          log,
          flags({
            'evaluation-connector-id': 'eis-anthropic-claude-4-6-sonnet',
            'require-eis-judge': true,
          })
        )
      ).resolves.toBe('eis-anthropic-claude-4-6-sonnet');
    });

    it('is opt-in: a non-EIS judge passes when the flag is absent', async () => {
      await expect(
        resolveEvaluationConnectorId(
          '/repo',
          log,
          flags({ 'evaluation-connector-id': 'Qwen/Qwen3-Coder-30B-A3B-Instruct' })
        )
      ).resolves.toBe('Qwen/Qwen3-Coder-30B-A3B-Instruct');
    });

    it('can be enabled from the environment for CI', async () => {
      process.env.EVAL_REQUIRE_EIS_JUDGE = 'true';
      await expect(
        resolveEvaluationConnectorId(
          '/repo',
          log,
          flags({ 'evaluation-connector-id': 'NousResearch/Hermes-3-Llama-3.1-70B' })
        )
      ).rejects.toThrow(/not EIS-backed/);
    });
  });
});

describe('evalRunFlags', () => {
  // resolveEvaluationConnectorId reads `require-eis-judge` via flagsReader.boolean(),
  // and FlagsReader throws on any flag absent from the command's declaration.
  // `start` and `run` both call it, so the flag must live in the SHARED set --
  // declaring it on `run` alone made every `evals start` die with
  // "expected --require-eis-judge to be a boolean".
  it.each(['require-eis-judge', 'skip-server', 'dry-run', 'skip-init'])(
    'declares %s so both start and run can read it',
    (flag) => {
      expect(evalRunFlags.boolean).toContain(flag);
      expect(evalRunFlags.default).toHaveProperty(flag, false);
    }
  );

  it('aliases judge to evaluation-connector-id', () => {
    expect(evalRunFlags.alias).toMatchObject({ judge: 'evaluation-connector-id' });
  });
});
