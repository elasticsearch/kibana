/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('@kbn/dev-cli-runner', () => ({
  run: jest.fn(),
}));

jest.mock('@kbn/dev-cli-errors', () => ({
  createFailError: (message: string) => new Error(message),
}));

jest.mock('@kbn/dev-validation-runner', () => ({
  readValidationRunFlags: jest.fn(),
  resolveValidationBaseContext: jest.fn(),
  resolveValidationAffectedProjects: jest.fn(),
  VALIDATION_RUN_HELP: [],
  VALIDATION_RUN_STRING_FLAGS: [],
}));

jest.mock('@kbn/repo-info', () => ({
  REPO_ROOT: '/repo',
}));

jest.mock('./type_check_validation_loader', () => ({
  executeTypeCheckValidation: jest.fn(),
}));

jest.mock('./eslint/run_eslint_contract', () => ({
  executeEslintValidation: jest.fn(),
}));

jest.mock('@kbn/dev-proc-runner', () => ({
  ProcRunner: jest.fn().mockImplementation(() => ({
    teardown: jest.fn(),
  })),
}));

jest.mock('@kbn/tooling-log', () => ({
  ToolingLog: jest.fn().mockImplementation(() => ({
    writers: [] as Array<{ write: (msg: { args: unknown[]; type: string }) => boolean }>,
    setWriters: jest.fn(function (this: { writers: unknown[] }, writers: unknown[]) {
      this.writers = writers;
    }),
  })),
}));

const mockRunJestViaMoon = jest.fn();

jest.mock('@kbn/test', () => ({
  runJestViaMoon: (...args: unknown[]) => mockRunJestViaMoon(...args),
  JEST_CONFIG_NAMES: [
    'jest.config.dev.js',
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.mjs',
    'jest.config.ts',
    'jest.config.json',
  ],
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

const mockExecaFn = jest.fn();
jest.mock('execa', () => ({ __esModule: true, default: mockExecaFn }));

const mockRun = jest.requireMock('@kbn/dev-cli-runner').run as jest.Mock;
const mockReadValidationRunFlags = jest.requireMock('@kbn/dev-validation-runner')
  .readValidationRunFlags as jest.Mock;
const mockResolveValidationBaseContext = jest.requireMock('@kbn/dev-validation-runner')
  .resolveValidationBaseContext as jest.Mock;
const mockResolveValidationAffectedProjects = jest.requireMock('@kbn/dev-validation-runner')
  .resolveValidationAffectedProjects as jest.Mock;
const mockExecuteTypeCheckValidation = jest.requireMock('./type_check_validation_loader')
  .executeTypeCheckValidation as jest.Mock;
const mockExecuteEslintValidation = jest.requireMock('./eslint/run_eslint_contract')
  .executeEslintValidation as jest.Mock;
const mockExistsSync = jest.requireMock('fs').existsSync as jest.Mock;
const mockReaddirSync = jest.requireMock('fs').readdirSync as jest.Mock;
const mockExeca = mockExecaFn;

let handler: (args: {
  flags: {
    fix: boolean;
  };
  flagsReader: {
    boolean: (name: string) => boolean;
  };
}) => Promise<void>;

const createArgs = (overrides: { fix?: boolean; verbose?: boolean } = {}) => ({
  flags: {
    fix: overrides.fix ?? true,
  },
  flagsReader: {
    boolean: (name: string) => {
      if (name === 'fix') {
        return overrides.fix ?? true;
      }

      return name === 'verbose' ? overrides.verbose ?? false : false;
    },
  },
});

const baseContext = {
  mode: 'contract' as const,
  contract: {
    profile: 'quick',
    scope: 'local',
    testMode: 'related',
    downstream: 'none',
  },
  runContext: {
    kind: 'affected' as const,
    contract: {
      profile: 'quick',
      scope: 'local',
      testMode: 'related',
      downstream: 'none',
    },
    resolvedBase: undefined,
    changedFiles: ['packages/foo/src/index.ts'],
  },
};

describe('run_check', () => {
  let stdoutSpy: jest.SpyInstance;
  let previousExitCode: typeof process.exitCode;

  beforeAll(() => {
    require('./run_check');
    handler = mockRun.mock.calls[0][0];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    mockReadValidationRunFlags.mockReturnValue({});
    mockResolveValidationBaseContext.mockResolvedValue(baseContext);
    mockExistsSync.mockImplementation(
      (p: string) =>
        p === '/repo/packages/foo/jest.config.js' || p === '/repo/packages/bar/jest.config.js'
    );
    mockReaddirSync.mockReturnValue([]);
    mockExecuteEslintValidation.mockResolvedValue({
      fileCount: 3,
      fixedFiles: [],
      failedFiles: [],
      warningCount: 0,
    });
    mockExecuteTypeCheckValidation.mockResolvedValue({ projectCount: 2 });
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    // Default: tsproj resolves to no scoped projects (keeps existing assertions stable).
    mockResolveValidationAffectedProjects.mockResolvedValue({
      isRootProjectAffected: false,
      affectedSourceRoots: [],
    });

    // Default: successful Moon jest run
    mockRunJestViaMoon.mockResolvedValue({
      taskCount: 1,
      cachedCount: 0,
      totalTests: 5,
      failed: [],
      exitCode: 0,
    });
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    stdoutSpy.mockRestore();
  });

  it('prints compact output for successful checks', async () => {
    await handler(createArgs());

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('check  scope=local');
    expect(output).toContain('lint  ✓ 3 files');
    expect(output).toContain('jest  ✓ 1 config ran, 5 tests');
    expect(output).toContain('tsc   ✓ 2 projects');
  });

  it('prints skip lines when validators return null and no changed files', async () => {
    mockExecuteEslintValidation.mockResolvedValue(null);
    mockExecuteTypeCheckValidation.mockResolvedValue(null);
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: [],
      },
    });

    await handler(createArgs());

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('lint  — no files changed');
    expect(output).toContain('jest  — no changed files');
    expect(output).toContain('tsc   — no affected projects');
  });

  it('prints validation warnings before check results', async () => {
    mockResolveValidationBaseContext.mockImplementation(async ({ onWarning }) => {
      onWarning?.('affected file detection is unavailable in a shallow repository');
      onWarning?.('run `git fetch --unshallow`');
      return {
        ...baseContext,
        runContext: {
          ...baseContext.runContext,
          changedFiles: [],
        },
      };
    });
    mockExecuteEslintValidation.mockResolvedValue(null);
    mockExecuteTypeCheckValidation.mockResolvedValue(null);

    await handler(createArgs());

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain(
      'warn  ! affected file detection is unavailable in a shallow repository'
    );
    expect(output).toContain('warn  ! run `git fetch --unshallow`');
    expect(output).toContain('jest  — no changed files');
  });

  it('continues running checks and reports all failures', async () => {
    mockExecuteEslintValidation.mockResolvedValue({
      fileCount: 3,
      fixedFiles: [],
      failedFiles: ['src/foo.ts'],
      warningCount: 0,
    });
    mockExecuteTypeCheckValidation.mockRejectedValue(new Error('tsc error'));

    await handler(createArgs());

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('lint  ✗ failed');
    expect(output).toContain('node scripts/eslint src/foo.ts');
    expect(output).toContain('jest  ✓ 1 config ran, 5 tests');
    expect(output).toContain('tsc   ✗ failed');
  });

  it('shows fixed file count when eslint auto-fixes', async () => {
    mockExecuteEslintValidation.mockResolvedValue({
      fileCount: 10,
      fixedFiles: ['a.ts', 'b.ts'],
      failedFiles: [],
      warningCount: 0,
    });

    await handler(createArgs());

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('lint  ✓ 10 files (fixed 2 files)');
  });

  it('skips fast path for integration test files', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: ['src/core/server/integration_tests/user_storage/remove.test.ts'],
      },
    });

    mockExistsSync.mockImplementation(
      (p: string) =>
        p === '/repo/src/core/server/integration_tests/user_storage/jest.integration.config.js'
    );

    await handler(createArgs());

    expect(mockExeca).not.toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['scripts/jest']),
      expect.anything()
    );
    expect(mockRunJestViaMoon).toHaveBeenCalled();
  });

  it('skips fast path for Scout test files', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: [
          'x-pack/platform/plugins/shared/saved_objects_tagging/test/scout/api/tests/tags_security_get_all.spec.ts',
        ],
      },
    });

    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockImplementation((dir: string) =>
      dir === '/repo/x-pack/platform/plugins/shared/saved_objects_tagging/test/scout/api'
        ? ['playwright.config.ts']
        : []
    );

    await handler(createArgs());

    expect(mockExeca).not.toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['scripts/jest']),
      expect.anything()
    );
    expect(mockRunJestViaMoon).toHaveBeenCalled();
  });

  it('skips fast path for Scout test files with parallel playwright config', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: [
          'src/platform/plugins/shared/discover/test/scout/ui/parallel_tests/metrics_experience/fullscreen.spec.ts',
        ],
      },
    });

    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockImplementation((dir: string) =>
      dir === '/repo/src/platform/plugins/shared/discover/test/scout/ui'
        ? ['parallel.playwright.config.ts']
        : []
    );

    await handler(createArgs());

    expect(mockExeca).not.toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['scripts/jest']),
      expect.anything()
    );
    expect(mockRunJestViaMoon).toHaveBeenCalled();
  });

  it('uses test-only fast path when all changed files are jest unit test files', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: ['packages/foo/src/bar.test.ts', 'packages/foo/src/baz.test.ts'],
      },
    });

    mockExistsSync.mockImplementation((p: string) => p === '/repo/packages/foo/jest.config.js');

    mockExeca.mockResolvedValue({
      exitCode: 0,
      stdout: 'Tests:       8 passed, 8 total\n',
      stderr: '',
    });

    await handler(createArgs());

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('jest  ✓ 2 test files · 8 tests');
  });

  it('shows failing fast-path Jest output and a minimal rerun command', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      runContext: {
        ...baseContext.runContext,
        changedFiles: ['packages/foo/src/bar.test.ts'],
      },
    });

    mockExistsSync.mockImplementation((p: string) => p === '/repo/packages/foo/jest.config.js');

    mockExeca.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: [
        'FAIL packages/foo/src/bar.test.ts',
        '  Example failure',
        'Tests:       1 failed, 1 total',
      ].join('\n'),
    });

    await handler(createArgs());

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('jest  ✗ failed');
    expect(output).toContain('FAIL packages/foo/src/bar.test.ts');
    expect(output).toContain('node scripts/jest packages/foo/src/bar.test.ts');
  });

  it('passes downstream flag to runJestViaMoon', async () => {
    mockResolveValidationBaseContext.mockResolvedValue({
      ...baseContext,
      contract: {
        ...baseContext.contract,
        downstream: 'deep',
      },
      runContext: {
        ...baseContext.runContext,
        contract: {
          ...baseContext.runContext.contract,
          downstream: 'deep',
        },
        changedFiles: ['packages/baz/src/index.ts'],
      },
    });

    await handler(createArgs());

    expect(mockRunJestViaMoon).toHaveBeenCalledWith(
      expect.objectContaining({
        changedFiles: ['packages/baz/src/index.ts'],
        downstream: 'deep',
      })
    );

    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('jest  ✓ 1 config ran, 5 tests');
  });

  it('reports Moon Jest startup failures instead of saying no affected configs', async () => {
    mockRunJestViaMoon.mockResolvedValue({
      taskCount: 0,
      cachedCount: 0,
      totalTests: 0,
      failed: [],
      exitCode: 1,
      failureExcerpt: [
        '@kbn/foo:jest | Error: task_runner::run_failed',
        'Broken startup before Jest JSON output',
      ],
      warnings: [
        'Moon exited with code 1 but no Jest task output was parsed. The Jest task may have failed before producing JSON output — run jest directly to verify.',
      ],
    });

    await handler(createArgs());

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('jest  ✗ failed');
    expect(output).toContain('Broken startup before Jest JSON output');
    expect(output).not.toContain('jest  — no affected configs');
  });

  it('reports failed Jest configs with failure details', async () => {
    mockRunJestViaMoon.mockResolvedValue({
      taskCount: 2,
      cachedCount: 0,
      totalTests: 3,
      failed: [
        {
          project: '@kbn/foo',
          configPath: 'packages/foo/jest.config.js',
          cached: false,
          passed: false,
          testCount: 1,
          failures: [
            {
              file: 'packages/foo/src/bar.test.ts',
              line: 12,
              name: 'bar should work',
              message: 'Error: expected true\n    at /repo/packages/foo/src/bar.test.ts:12:3',
            },
          ],
        },
      ],
      exitCode: 1,
    });

    await handler(createArgs());

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('jest  ✗');
    expect(output).toContain('FAIL packages/foo/src/bar.test.ts:12');
    expect(output).toContain('node scripts/jest --config packages/foo/jest.config.js');
  });

  it('uses the repo root tsconfig in the tsc rerun command when no nearer config exists', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === '/repo/packages/foo/jest.config.js' || p === '/repo/tsconfig.json'
    );
    mockExecuteTypeCheckValidation.mockImplementation(async ({ log }) => {
      log.writers[0].write({
        args: ['proc [tsc] src/dev/run_check.ts(852,13): error TS1234: broken'],
        type: 'error',
      });
      throw new Error('tsc error');
    });

    await handler(createArgs());

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
    expect(output).toContain('src/dev/run_check.ts:852:13: error TS1234: broken');
    expect(output).toContain('node scripts/type_check --project tsconfig.json');
    expect(output).not.toContain('node scripts/type_check --profile quick');
  });

  const execaCallFor = (script: string) =>
    mockExeca.mock.calls.find(([, args]: [string, string[]]) => args?.includes(script));

  describe('tsproj step', () => {
    it('prints "no scoped projects" when only root-level inputs are affected', async () => {
      mockResolveValidationAffectedProjects.mockResolvedValue({
        isRootProjectAffected: true,
        affectedSourceRoots: ['packages/foo'],
      });

      await handler(createArgs());

      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('tsproj— no scoped projects');
      expect(execaCallFor('scripts/lint_ts_projects')).toBeUndefined();
      expect(process.exitCode).toBeUndefined();
    });

    it('runs lint_ts_projects on affected roots and reports success', async () => {
      mockResolveValidationAffectedProjects.mockResolvedValue({
        isRootProjectAffected: false,
        affectedSourceRoots: ['packages/foo', 'packages/bar'],
      });

      await handler(createArgs());

      expect(mockExeca).toHaveBeenCalledWith(
        process.execPath,
        ['scripts/lint_ts_projects', '--fix', 'packages/foo', 'packages/bar'],
        expect.objectContaining({ reject: false })
      );
      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('tsproj✓ 2 projects');
      expect(process.exitCode).toBeUndefined();
    });

    it('omits --fix when run with --no-fix', async () => {
      mockResolveValidationAffectedProjects.mockResolvedValue({
        isRootProjectAffected: false,
        affectedSourceRoots: ['packages/foo'],
      });

      await handler(createArgs({ fix: false }));

      const call = execaCallFor('scripts/lint_ts_projects');
      expect(call?.[1]).toEqual(['scripts/lint_ts_projects', 'packages/foo']);
    });

    it('reports a failure and rerun command when lint_ts_projects fails', async () => {
      mockResolveValidationAffectedProjects.mockResolvedValue({
        isRootProjectAffected: false,
        affectedSourceRoots: ['packages/foo'],
      });
      mockExeca.mockImplementation(async (_bin: string, args: string[]) =>
        args.includes('scripts/lint_ts_projects')
          ? { exitCode: 1, stdout: 'tsconfig drift detected', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' }
      );

      await handler(createArgs());

      expect(process.exitCode).toBe(1);
      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('tsproj✗ failed');
      expect(output).toContain('tsconfig drift detected');
      expect(output).toContain('node scripts/lint_ts_projects --fix packages/foo');
    });
  });

  describe('moon step', () => {
    it('runs regenerate with --update when fixing', async () => {
      await handler(createArgs({ fix: true }));

      expect(mockExeca).toHaveBeenCalledWith(
        process.execPath,
        ['scripts/regenerate_moon_projects.js', '--update'],
        expect.objectContaining({ reject: false })
      );
      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('moon  ✓ projects regenerated');
    });

    it('runs regenerate with --check (no write) when --no-fix', async () => {
      await handler(createArgs({ fix: false }));

      expect(mockExeca).toHaveBeenCalledWith(
        process.execPath,
        ['scripts/regenerate_moon_projects.js', '--check'],
        expect.objectContaining({ reject: false })
      );
      expect(mockExeca).not.toHaveBeenCalledWith(
        process.execPath,
        ['scripts/regenerate_moon_projects.js', '--update'],
        expect.anything()
      );
      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('moon  ✓ up to date');
    });

    it('fails when regenerate reports drift under --no-fix', async () => {
      mockExeca.mockImplementation(async (_bin: string, args: string[]) =>
        args.includes('scripts/regenerate_moon_projects.js')
          ? { exitCode: 1, stdout: '', stderr: '1 Moon project configuration(s) out of date' }
          : { exitCode: 0, stdout: '', stderr: '' }
      );

      await handler(createArgs({ fix: false }));

      expect(process.exitCode).toBe(1);
      const output = stdoutSpy.mock.calls.map(([text]: [string]) => text).join('');
      expect(output).toContain('moon  ✗ failed');
      expect(output).toContain('node scripts/regenerate_moon_projects.js --update');
    });
  });
});
