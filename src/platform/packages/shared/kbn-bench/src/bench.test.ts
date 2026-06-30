/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ToolingLog } from '@kbn/tooling-log';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { bench } from './bench';
import type { InitialBenchConfig } from './config/types';

// Mock workspace operations to avoid real git checkouts
jest.mock('@kbn/workspaces', () => ({
  activateWorktreeOrUseSourceRepo: jest.fn(),
}));

// Mock collectConfigPaths to avoid git ls-files in temp directory
jest.mock('./config/collect_config_paths', () => ({
  collectConfigPaths: jest.fn(),
}));

import { activateWorktreeOrUseSourceRepo } from '@kbn/workspaces';
import { collectConfigPaths } from './config/collect_config_paths';

// Type the mocked functions
const mockedCollectConfigPaths = collectConfigPaths as jest.MockedFunction<
  typeof collectConfigPaths
>;

// Mock setup for activated worktree functions

describe('bench E2E', () => {
  let tempDir: string;
  let log: ToolingLog;
  let capturedOutput: string[] = [];
  let fastBenchmarkConfigPath: string;
  let createMockWorkspace: (displayName?: string) => {
    getDisplayName: () => string;
    getCommitLine: () => Promise<string>;
    getDir: () => string;
    ensureCheckout: () => Promise<void>;
    ensureBootstrap: () => Promise<void>;
    ensureBuild: jest.Mock<Promise<void>, []>;
    exec: jest.Mock;
  };

  beforeAll(() => {
    // Create a temporary directory for test data
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kbn-bench-e2e-'));

    // Create fast-running benchmark modules
    const fastModulePath = path.join(tempDir, 'fast_benchmark.js');
    fs.writeFileSync(
      fastModulePath,
      `
      exports.run = function fastBenchmark() {
        const start = Date.now();
        // Minimal work to simulate computation
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return {
          customMetric: sum,
        };
      };
    `
    );

    const fastScriptPath = path.join(tempDir, 'fast_script.js');
    fs.writeFileSync(
      fastScriptPath,
      `
      // Fast script that exits quickly
      const start = Date.now();
      let result = 0;
      for (let i = 0; i < 500; i++) {
        result += Math.sqrt(i);
      }
      process.exit(0);
    `
    );

    // Create fast benchmark config
    const fastConfig: InitialBenchConfig = {
      runs: 1,
      name: 'fast-test',
      benchmarks: [
        {
          kind: 'module',
          name: 'fast.module',
          description: 'Fast module benchmark for testing',
          module: fastModulePath,
          compare: { missing: 'skip' },
        },
        {
          kind: 'script',
          name: 'fast.script',
          description: 'Fast script benchmark for testing',
          run: {
            cmd: 'node',
            args: [fastScriptPath],
          },
          compare: { missing: 'skip' },
        },
      ],
    };

    fastBenchmarkConfigPath = path.join(tempDir, 'fast.config.js');
    fs.writeFileSync(
      fastBenchmarkConfigPath,
      `
      module.exports = ${JSON.stringify(fastConfig, null, 2)};
    `
    );

    createMockWorkspace = (displayName = 'test-workspace') => ({
      getDisplayName: () => displayName,
      getCommitLine: async () => 'test-commit',
      getDir: () => tempDir,
      ensureCheckout: async () => {},
      ensureBootstrap: async () => {},
      ensureBuild: jest.fn(async () => {}),
      exec: jest.fn(),
    });

    (activateWorktreeOrUseSourceRepo as jest.Mock).mockResolvedValue(createMockWorkspace());

    // Create a log that captures output
    log = new ToolingLog({
      level: 'debug',
      writeTo: {
        write: (msg: string) => {
          capturedOutput.push(msg);
        },
      },
    });
  });

  afterAll(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    capturedOutput = [];
    (activateWorktreeOrUseSourceRepo as jest.Mock).mockReset();
    (activateWorktreeOrUseSourceRepo as jest.Mock).mockResolvedValue(createMockWorkspace());
    mockedCollectConfigPaths.mockReset();

    // Mock collectConfigPaths to return the fast config file
    mockedCollectConfigPaths.mockResolvedValue([fastBenchmarkConfigPath]);
  });

  it('should run single benchmark configuration and complete successfully', async () => {
    // Run bench with the fast config (single run, no comparison)
    const result = await bench({
      log,
      config: fastBenchmarkConfigPath,
      runs: 1, // Override to single run for faster test
    });

    // Verify output contains expected benchmark completion messages
    const output = capturedOutput.join('\n');

    // Should indicate benchmark execution started and completed
    expect(output).toContain('Running benchmarks');
    expect(output).toContain('Completed benchmarks');

    // Should indicate results were written
    expect(output).toContain('Wrote results to disk');

    // Test should complete without throwing errors
    expect(result).toBeUndefined(); // bench() returns void
  }, 10000);

  it('should reject when benchmark setup fails', async () => {
    const failingModulePath = path.join(tempDir, 'failing_before_all_benchmark.js');
    fs.writeFileSync(
      failingModulePath,
      `
      exports.beforeAll = async function beforeAll() {
        throw new Error('benchmark setup failed');
      };

      exports.run = async function run() {};
    `
    );

    const failingConfigPath = path.join(tempDir, 'failing_before_all.config.js');
    fs.writeFileSync(
      failingConfigPath,
      `
      module.exports = {
        name: 'failing-before-all-test',
        runs: 1,
        benchmarks: [{
          kind: 'module',
          name: 'failing_before_all',
          module: ${JSON.stringify(failingModulePath)},
        }],
      };
    `
    );

    mockedCollectConfigPaths.mockResolvedValue([failingConfigPath]);

    await expect(
      bench({
        log,
        config: failingConfigPath,
        runs: 1,
      })
    ).rejects.toThrow('benchmark setup failed');
  }, 10000);

  it('should run comparison between left and right when both are provided', async () => {
    // For this test, we'll compare mocked refs using fast benchmarks
    const leftRef = 'mock-left';
    const rightRef = 'mock-right';

    await bench({
      log,
      config: fastBenchmarkConfigPath,
      left: leftRef,
      right: rightRef,
      runs: 1, // Single run for faster test
    });

    expect(mockedCollectConfigPaths).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ patterns: [fastBenchmarkConfigPath] })
    );
    expect(mockedCollectConfigPaths).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ patterns: [fastBenchmarkConfigPath] })
    );

    const output = capturedOutput.join('\n');

    // Should contain benchmark execution for both sides
    expect(output).toContain('Running benchmarks');
    expect(output).toContain('Completed benchmarks');

    // Should show diff reporting structure
    expect(output).toContain('Benchmark diff:');

    // Should contain the fast benchmark names in diff output
    expect(output).toContain('fast.module');
    expect(output).toContain('fast.script');

    // Should contain delta columns (Δ and CI)
    expect(output).toMatch(/Δ/);
    expect(output).toMatch(/CI/);

    // When comparing identical mocked workspaces, deltas should be minimal
    // (allowing for some variance in execution timing)
  }, 20000);

  it('should handle grep filtering of benchmarks', async () => {
    await bench({
      log,
      config: fastBenchmarkConfigPath,
      grep: ['module'], // Only run benchmarks matching "module"
      runs: 1,
    });

    const output = capturedOutput.join('\n');

    // Should contain the filtered benchmark
    expect(output).toContain('fast.module');

    // Should NOT contain the script benchmark
    expect(output).not.toContain('fast.script');

    expect(output).toContain('Completed benchmarks');
  }, 10000);

  it('should handle multiple runs and show variance', async () => {
    await bench({
      log,
      config: fastBenchmarkConfigPath,
      runs: 3, // Multiple runs to see variance
      grep: ['module'], // Filter to just one benchmark for faster execution
    });

    const output = capturedOutput.join('\n');

    // Should show multiple runs in the output
    expect(output).toContain('fast.module');
    expect(output).toMatch(/\(3 runs?\)/); // Should indicate 3 runs

    expect(output).toContain('Completed benchmarks');
  }, 15000);

  it('should propagate side-specific build directory overrides to comparison runs', async () => {
    const recordsPath = path.join(tempDir, 'build_dir_records.txt');
    const buildDirBenchmarkPath = path.join(tempDir, 'build_dir_benchmark.js');
    const leftBuildDir = path.join(tempDir, 'left_build');
    const rightBuildDir = path.join(tempDir, 'right_build');

    fs.mkdirSync(leftBuildDir);
    fs.mkdirSync(rightBuildDir);
    fs.writeFileSync(
      buildDirBenchmarkPath,
      `
      const fs = require('fs');

      exports.run = function buildDirBenchmark(ctx) {
        fs.appendFileSync(
          ${JSON.stringify(recordsPath)},
          ctx.workspace.getDisplayName() + '=' + (ctx.buildDir || '<none>') + '\\n'
        );
      };
    `
    );

    const buildDirConfigPath = path.join(tempDir, 'build_dir.config.js');
    fs.writeFileSync(
      buildDirConfigPath,
      `
      module.exports = {
        name: 'build-dir-test',
        runs: 1,
        benchmarks: [{
          kind: 'module',
          name: 'records_build_dir',
          module: ${JSON.stringify(buildDirBenchmarkPath)},
          compare: { missing: 'skip' },
        }],
      };
    `
    );

    mockedCollectConfigPaths.mockResolvedValue([buildDirConfigPath]);
    await bench({
      log,
      config: buildDirConfigPath,
      leftBuildDir,
      rightBuildDir,
      runs: 1,
    });

    const records = fs.readFileSync(recordsPath, 'utf8');
    const output = capturedOutput.join('\n');

    expect(records).toContain(`left build-dir=${leftBuildDir}`);
    expect(records).toContain(`right build-dir=${rightBuildDir}`);
    expect(output).toContain('Benchmark diff: left build-dir -> right build-dir');
  }, 10000);

  it('should fail clearly when git refs and build directory overrides are combined', async () => {
    const leftBuildDir = path.join(tempDir, 'exclusive_left_build');
    const rightBuildDir = path.join(tempDir, 'exclusive_right_build');
    fs.mkdirSync(leftBuildDir);
    fs.mkdirSync(rightBuildDir);

    await expect(
      bench({
        log,
        config: fastBenchmarkConfigPath,
        left: 'base-ref',
        right: 'target-ref',
        leftBuildDir,
        rightBuildDir,
        runs: 1,
      })
    ).rejects.toThrow(
      '--left/--right git refs cannot be combined with --left-build-dir/--right-build-dir'
    );
  });

  it('should preserve undefined build directory context when no override is provided', async () => {
    const recordsPath = path.join(tempDir, 'no_build_dir_records.txt');
    const buildDirBenchmarkPath = path.join(tempDir, 'no_build_dir_benchmark.js');

    fs.writeFileSync(
      buildDirBenchmarkPath,
      `
      const fs = require('fs');

      exports.run = function buildDirBenchmark(ctx) {
        fs.appendFileSync(
          ${JSON.stringify(recordsPath)},
          ctx.workspace.getDisplayName() + '=' + (ctx.buildDir || '<none>') + '\\n'
        );
      };
    `
    );

    const buildDirConfigPath = path.join(tempDir, 'no_build_dir.config.js');
    fs.writeFileSync(
      buildDirConfigPath,
      `
      module.exports = {
        name: 'no-build-dir-test',
        runs: 1,
        benchmarks: [{
          kind: 'module',
          name: 'records_no_build_dir',
          module: ${JSON.stringify(buildDirBenchmarkPath)},
          compare: { missing: 'skip' },
        }],
      };
    `
    );

    mockedCollectConfigPaths.mockResolvedValue([buildDirConfigPath]);
    (activateWorktreeOrUseSourceRepo as jest.Mock)
      .mockResolvedValueOnce(createMockWorkspace('left-workspace'))
      .mockResolvedValueOnce(createMockWorkspace('right-workspace'));

    await bench({
      log,
      config: buildDirConfigPath,
      right: 'mock-right',
      runs: 1,
    });

    const records = fs.readFileSync(recordsPath, 'utf8');

    expect(records).toContain('left-workspace=<none>');
    expect(records).toContain('right-workspace=<none>');
  }, 10000);

  it('should fail clearly when a build directory override does not exist', async () => {
    const rightBuildDir = path.join(tempDir, 'existing_right_build');
    fs.mkdirSync(rightBuildDir);

    await expect(
      bench({
        log,
        config: fastBenchmarkConfigPath,
        leftBuildDir: path.join(tempDir, 'missing_left_build'),
        rightBuildDir,
        runs: 1,
      })
    ).rejects.toThrow('left build directory override does not exist');
  });

  it('should print the diff before a thrown onCompare callback fails the run', async () => {
    const leftBuildDir = path.join(tempDir, 'on_compare_left_build');
    const rightBuildDir = path.join(tempDir, 'on_compare_right_build');
    fs.mkdirSync(leftBuildDir);
    fs.mkdirSync(rightBuildDir);

    const onCompareConfigPath = path.join(tempDir, 'on_compare.config.js');
    fs.writeFileSync(
      onCompareConfigPath,
      `
      module.exports = {
        name: 'on-compare-test',
        runs: 1,
        onCompare() {
          throw new Error('comparison policy failed');
        },
        benchmarks: [{
          kind: 'module',
          name: 'fast.module',
          module: ${JSON.stringify(path.join(tempDir, 'fast_benchmark.js'))},
          compare: { missing: 'skip' },
        }],
      };
    `
    );

    mockedCollectConfigPaths.mockResolvedValue([onCompareConfigPath]);

    let rejection: Error | undefined;
    try {
      await bench({
        log,
        config: onCompareConfigPath,
        leftBuildDir,
        rightBuildDir,
        runs: 1,
      });
    } catch (error) {
      rejection = error as Error;
    }

    expect(rejection?.message).toContain('comparison policy failed');

    const output = capturedOutput.join('\n');

    expect(output).toContain('Benchmark diff:');
    expect(output).toContain('fast.module');
  }, 10000);

  it('should fail clearly when a build directory override is not a directory', async () => {
    const leftBuildPath = path.join(tempDir, 'left_build_file');
    const rightBuildDir = path.join(tempDir, 'existing_right_build_for_file_check');
    fs.writeFileSync(leftBuildPath, 'not a directory');
    fs.mkdirSync(rightBuildDir);

    await expect(
      bench({
        log,
        config: fastBenchmarkConfigPath,
        leftBuildDir: leftBuildPath,
        rightBuildDir,
        runs: 1,
      })
    ).rejects.toThrow('left build directory override is not a directory');
  });
});
