/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import { parse as yamlLoad } from 'yaml';
import { FIPS_GH_LABELS, FIPS_VERSION } from '#pipeline-utils/pr_labels';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ORIGINAL_CWD = process.cwd();

const mockAreChangesSkippable = jest.fn();
const mockDoAnyChangesMatch = jest.fn();
const mockDoAllChangesMatch = jest.fn();
const mockGetAgentImageConfig = jest.fn();
const mockFlushCancelOnGateFailureMetadata = jest.fn();
const mockRunPreBuild = jest.fn();
const mockGetEvalPipeline = jest.fn();
const mockIsAutomatedVersionBumpPR = jest.fn();

jest.mock('#pipeline-utils', () => {
  const actual = jest.requireActual('#pipeline-utils');
  return {
    ...actual,
    getKibanaDir: jest.fn().mockReturnValue('/kibana'),
    areChangesSkippable: mockAreChangesSkippable,
    doAnyChangesMatch: mockDoAnyChangesMatch,
    doAllChangesMatch: mockDoAllChangesMatch,
    getAgentImageConfig: mockGetAgentImageConfig,
    flushCancelOnGateFailureMetadata: mockFlushCancelOnGateFailureMetadata,
    isAutomatedVersionBumpPR: mockIsAutomatedVersionBumpPR,
  };
});

jest.mock('./pre_build', () => ({
  runPreBuild: mockRunPreBuild,
}));

jest.mock('../../../pipelines/evals/eval_pipeline', () => ({
  getEvalPipeline: mockGetEvalPipeline,
}));

const ORIGINAL_ENV = process.env;

const importPipelineModule = async () => {
  await jest.isolateModulesAsync(async () => {
    await import('./pipeline');
  });
};

const waitForEmission = () => {
  return new Promise<string>((resolve) => {
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      resolve(String(args[0]));
    });
  });
};

const waitForExit = () => {
  return new Promise<number>((resolve) => {
    jest.spyOn(process, 'exit').mockImplementation(((code: number) => {
      resolve(code);
    }) as never);
  });
};

describe('pull_request pipeline generation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    process.chdir(REPO_ROOT);
    process.env = { ...ORIGINAL_ENV };

    delete process.env.GITHUB_PR_LABELS;
    delete process.env.GITHUB_PR_TARGET_BRANCH;

    mockAreChangesSkippable.mockResolvedValue(false);
    mockDoAnyChangesMatch.mockResolvedValue(false);
    mockDoAllChangesMatch.mockResolvedValue(false);
    mockGetAgentImageConfig.mockReturnValue('agents:\n  provider: gcp\n');
    mockRunPreBuild.mockResolvedValue(undefined);
    mockGetEvalPipeline.mockReturnValue(null);
    mockIsAutomatedVersionBumpPR.mockResolvedValue(false);
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('emits valid empty pipeline when changes are skippable', async () => {
    mockAreChangesSkippable.mockResolvedValueOnce(true);
    const emitted = waitForEmission();

    await importPipelineModule();
    const output = await emitted;

    const parsed = yamlLoad(output) as Record<string, unknown>;
    expect(parsed).toEqual({ steps: [] });
    expect(mockRunPreBuild).not.toHaveBeenCalled();
  });

  it('emits valid renovate-only pipeline and skips pre-build', async () => {
    mockDoAllChangesMatch.mockResolvedValueOnce(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const emitted = waitForEmission();

    await importPipelineModule();
    const output = await emitted;

    expect(mockRunPreBuild).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Isolated changes to renovate.json. Skipping main PR pipeline.'
    );

    const parsed = yamlLoad(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('steps');
    expect(output).toContain('renovate.sh');
  });

  it('includes the warm-start memory bench step for non-skipped PRs', async () => {
    const emitted = waitForEmission();

    await importPipelineModule();
    const output = await emitted;

    expect(output).toContain('warm_start_memory_bench');
    expect(output).toContain('warm_start_memory_bench.sh');
    expect(output).toContain('soft_fail: true');
    expect(output).toContain('depends_on');
    expect(output).toContain('build');
  });

  it('waits for pre-build then emits valid YAML with base pipeline structure', async () => {
    let resolvePreBuild!: () => void;
    mockRunPreBuild.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePreBuild = resolve;
      })
    );

    const emitted = waitForEmission();

    await importPipelineModule();
    await new Promise((r) => setImmediate(r));

    expect(console.log).not.toHaveBeenCalled();

    resolvePreBuild();
    const output = await emitted;

    const parsed = yamlLoad(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('steps');
    const steps = parsed.steps as unknown[];
    expect(steps.length).toBeGreaterThan(0);
    expect(output).toContain('Build Kibana Distribution');
    expect(output).toContain('post_build.sh');
  });

  it('includes FIPS verification step when FIPS label is present', async () => {
    process.env.GITHUB_PR_LABELS = FIPS_GH_LABELS[FIPS_VERSION.TWO];
    const emitted = waitForEmission();

    await importPipelineModule();
    const output = await emitted;

    expect(output).toContain('Verify FIPS Enabled');
  });

  it('does not emit pipeline and exits when pre-build fails', async () => {
    mockRunPreBuild.mockRejectedValue(new Error('pre-build failed'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logSpy = jest.spyOn(console, 'log');
    const exited = waitForExit();

    await importPipelineModule();
    const exitCode = await exited;

    expect(exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error while generating the pipeline steps:'),
      expect.any(Error)
    );
  });

  it('emits empty pipeline for automated version bump PRs from kibanamachine', async () => {
    mockIsAutomatedVersionBumpPR.mockResolvedValueOnce(true);
    const emitted = waitForEmission();

    await importPipelineModule();
    const output = await emitted;

    const parsed = yamlLoad(output) as Record<string, unknown>;
    expect(parsed).toEqual({ steps: [] });
    expect(mockRunPreBuild).not.toHaveBeenCalled();
    expect(mockAreChangesSkippable).not.toHaveBeenCalled();
  });
});
