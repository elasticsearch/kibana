/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { existsSync, readdirSync } from 'fs';

const dirHasPlaywrightConfig = (dir: string): boolean => {
  try {
    return readdirSync(dir).some((f) => f.endsWith('playwright.config.ts'));
  } catch {
    return false;
  }
};
import Path from 'path';

import { run } from '@kbn/dev-cli-runner';
import { ProcRunner } from '@kbn/dev-proc-runner';
import {
  readValidationRunFlags,
  resolveValidationAffectedProjects,
  resolveValidationBaseContext,
  type ValidationBaseContext,
  VALIDATION_RUN_HELP,
  VALIDATION_RUN_STRING_FLAGS,
} from '@kbn/dev-validation-runner';
import { REPO_ROOT } from '@kbn/repo-info';
import { ToolingLog, type Message, type Writer } from '@kbn/tooling-log';
import {
  runJestViaMoon,
  JEST_CONFIG_NAMES,
  type MoonJestResult,
  type JestFailedTest,
} from '@kbn/test';
import { executeTypeCheckValidation } from './type_check_validation_loader';

import { executeEslintValidation } from './eslint/run_eslint_contract';

// ── Output helpers ──────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY === true;
const write = (text: string) => process.stdout.write(text);
const writeln = (text: string) => write(text + '\n');
const clearLine = () => write('\r\x1B[2K');

const formatDuration = (ms: number) =>
  ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1_000).toFixed(1)}s`;

const pluralize = (count: number, singular: string) =>
  `${count} ${singular}${count === 1 ? '' : 's'}`;

const pad = (label: string) => label.padEnd(6);

const line = (label: string, symbol: string, detail: string, duration?: string) =>
  `  ${pad(label)}${symbol} ${detail}${duration ? `  ${duration}` : ''}`;

/** Start a ticking progress line. Returns { stop, writeResult } to finalize. */
const startProgress = (label: string, detail?: string) => {
  const start = Date.now();
  let msg = detail ? `${detail} ...` : '...';

  const render = () => {
    write(`  ${pad(label)}${msg}`);
  };

  if (isTTY) {
    render();
  }

  const timer = isTTY
    ? setInterval(() => {
        clearLine();
        render();
        write(` ${formatDuration(Date.now() - start)}`);
      }, 1_000)
    : undefined;

  return {
    elapsed: () => formatDuration(Date.now() - start),
    setDetail: (detailText?: string) => {
      msg = detailText ? `${detailText} ...` : '...';
      if (isTTY) {
        clearLine();
        render();
      }
    },
    writeResult: (text: string) => {
      if (timer) clearInterval(timer);
      if (isTTY) clearLine();
      writeln(text);
    },
  };
};

// ── Silent logging ──────────────────────────────────────────────────────────

const createCapturingWriter = (): { writer: Writer; captured: string[] } => {
  const captured: string[] = [];
  return {
    captured,
    writer: {
      write(msg: Message) {
        const text = msg.args.map(String).join(' ').trim();
        if (text && (msg.type === 'error' || msg.type === 'warning' || msg.type === 'write')) {
          captured.push(text);
        }
        return true;
      },
    },
  };
};

const createSilentLog = () => {
  const { writer, captured } = createCapturingWriter();
  const log = new ToolingLog();
  log.setWriters([writer]);
  return { log, captured };
};

// ── Header ──────────────────────────────────────────────────────────────────

const formatHeader = (baseContext: ValidationBaseContext) => {
  if (baseContext.mode === 'direct_target') {
    return `check  target=${baseContext.directTarget}`;
  }

  const { contract, runContext } = baseContext;

  if (runContext.kind === 'affected' && runContext.resolvedBase && contract.scope === 'branch') {
    const base = runContext.resolvedBase.baseRef;
    const sha = runContext.resolvedBase.base.slice(0, 12);
    const commits =
      runContext.branchCommitCount !== undefined ? `  ${runContext.branchCommitCount} commits` : '';
    return `check  branch  ${base} (${sha})..HEAD${commits}`;
  }

  return `check  scope=${contract.scope}`;
};

// ── Jest via Moon ───────────────────────────────────────────────────────────

const TEST_FILE_RE = /\.(?:test|spec)\.(js|mjs|ts|tsx)$/;

const isTestFile = (filePath: string) => TEST_FILE_RE.test(filePath);

/** Walk up from a test file to find the nearest jest unit config, stopping at integration or Scout configs. */
const findJestUnitConfig = (filePath: string): string | undefined => {
  let dir = Path.dirname(Path.resolve(REPO_ROOT, filePath));
  while (true) {
    if (existsSync(Path.join(dir, 'jest.integration.config.js')) || dirHasPlaywrightConfig(dir)) {
      return undefined;
    }
    for (const configName of JEST_CONFIG_NAMES) {
      if (existsSync(Path.join(dir, configName))) {
        return Path.relative(REPO_ROOT, Path.join(dir, configName));
      }
    }
    if (dir === REPO_ROOT || dir === Path.dirname(dir)) break;
    dir = Path.dirname(dir);
  }
  return undefined;
};

const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

const runLintTsProjects = async (
  affectedSourceRoots: string[],
  fix: boolean
): Promise<{ passed: boolean; output: string }> => {
  const execa = (await import('execa')).default;
  const args = ['scripts/lint_ts_projects'];
  if (fix) args.push('--fix');
  args.push(...affectedSourceRoots);

  const result = await execa(process.execPath, args, {
    cwd: REPO_ROOT,
    reject: false,
  });

  return {
    passed: result.exitCode === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
  };
};

const runMoonRegeneration = async (fix: boolean): Promise<{ passed: boolean; output: string }> => {
  const execa = (await import('execa')).default;
  // --update writes regenerated configs; --check fails on drift without writing.
  const result = await execa(
    process.execPath,
    ['scripts/regenerate_moon_projects.js', fix ? '--update' : '--check'],
    { cwd: REPO_ROOT, reject: false }
  );

  return {
    passed: result.exitCode === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
  };
};

const runJestTestsDirectly = async (
  testFiles: string[]
): Promise<{ testCount: number; passed: boolean; output: string }> => {
  const execa = (await import('execa')).default;
  const absolutePaths = testFiles.map((f) => Path.resolve(REPO_ROOT, f));

  const result = await execa(
    process.execPath,
    ['scripts/jest', '--runTestsByPath', ...absolutePaths, '--maxWorkers=2'],
    {
      cwd: REPO_ROOT,
      reject: false,
    }
  );

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const testsMatch = output.match(/Tests:\s+.*?(\d+) total/);
  const testCount = testsMatch ? parseInt(testsMatch[1], 10) : 0;

  return {
    testCount,
    passed: result.exitCode === 0,
    output,
  };
};

// ── Main ────────────────────────────────────────────────────────────────────

run(
  async ({ flagsReader }) => {
    const verbose = flagsReader.boolean('verbose');
    const fix = flagsReader.boolean('fix');
    const parsedValidationFlags = readValidationRunFlags(flagsReader);
    const hasValidationFlags = Object.values(parsedValidationFlags).some(
      (value) => value !== undefined
    );
    const validationFlags = hasValidationFlags
      ? parsedValidationFlags
      : { ...parsedValidationFlags, profile: 'quick' };

    const profile = validationFlags.profile ?? 'quick';
    if (isTTY) {
      write(`check  profile=${profile} ...`);
    }

    const warnings: string[] = [];
    const baseContext = await resolveValidationBaseContext({
      flags: validationFlags,
      runnerDescription: 'check',
      onWarning: (message) => warnings.push(message),
    });

    if (isTTY) {
      clearLine();
    }
    writeln(formatHeader(baseContext));
    for (const warning of warnings) {
      writeln(line('warn', '!', warning));
    }

    const errors: Error[] = [];

    // Resolve changed files once for all checks.
    const changedFiles =
      baseContext.mode === 'contract' && baseContext.runContext.kind === 'affected'
        ? baseContext.runContext.changedFiles
        : [];
    const isSkipOrFull =
      baseContext.mode === 'contract' &&
      (baseContext.runContext.kind === 'skip' ||
        baseContext.runContext.kind === 'full' ||
        baseContext.contract.testMode === 'all');

    // Steps run in a fixed order: tsproj → moon → lint → jest → tsc.
    // @kbn/ts-projects is cached for the process; tsproj autofixes tsconfigs in a
    // subprocess, so lint/tsc must not load TS_PROJECTS until those fixes are on disk.
    // Do not reorder or add top-level imports that pull in @kbn/ts-projects earlier.

    // ── ts projects ────────────────────────────────────────────────────

    {
      const tsProjectsProgress = startProgress('tsproj');

      if (isSkipOrFull) {
        tsProjectsProgress.writeResult(
          line('tsproj', '—', 'skipped', tsProjectsProgress.elapsed())
        );
      } else if (changedFiles.length === 0) {
        tsProjectsProgress.writeResult(
          line('tsproj', '—', 'no changed files', tsProjectsProgress.elapsed())
        );
      } else {
        try {
          const affected = await resolveValidationAffectedProjects({
            changedFilesJson: JSON.stringify({ files: changedFiles }),
            downstream: baseContext.mode === 'contract' ? baseContext.contract.downstream : 'none',
          });

          if (affected.isRootProjectAffected || affected.affectedSourceRoots.length === 0) {
            // Root-level inputs touched (or nothing to scope to) — skip the scoped run; the
            // repo-wide lint_ts_projects check still runs in its own dedicated CI step.
            tsProjectsProgress.writeResult(
              line('tsproj', '—', 'no scoped projects', tsProjectsProgress.elapsed())
            );
          } else {
            const result = await runLintTsProjects(affected.affectedSourceRoots, fix);
            if (result.passed) {
              tsProjectsProgress.writeResult(
                line(
                  'tsproj',
                  '✓',
                  pluralize(affected.affectedSourceRoots.length, 'project'),
                  tsProjectsProgress.elapsed()
                )
              );
            } else {
              tsProjectsProgress.writeResult(
                line('tsproj', '✗', 'failed', tsProjectsProgress.elapsed())
              );
              writeln('');
              const excerpt = result.output.split('\n').slice(-20);
              for (const l of excerpt) writeln(`    ${l}`);
              writeln(
                `    $ node scripts/lint_ts_projects${
                  fix ? ' --fix' : ''
                } ${affected.affectedSourceRoots.join(' ')}`
              );
              writeln('');
              errors.push(new Error('lint_ts_projects failed'));
            }
          }
        } catch (error) {
          tsProjectsProgress.writeResult(
            line('tsproj', '✗', 'failed', tsProjectsProgress.elapsed())
          );
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    // ── moon ───────────────────────────────────────────────────────────

    {
      const moonProgress = startProgress('moon');
      try {
        const result = await runMoonRegeneration(fix);
        if (result.passed) {
          moonProgress.writeResult(
            line('moon', '✓', fix ? 'projects regenerated' : 'up to date', moonProgress.elapsed())
          );
        } else {
          moonProgress.writeResult(line('moon', '✗', 'failed', moonProgress.elapsed()));
          writeln('');
          const excerpt = result.output.split('\n').slice(-15);
          for (const l of excerpt) writeln(`    ${l}`);
          writeln('    $ node scripts/regenerate_moon_projects.js --update');
          writeln('');
          errors.push(new Error('regenerate_moon_projects failed'));
        }
      } catch (error) {
        moonProgress.writeResult(line('moon', '✗', 'failed', moonProgress.elapsed()));
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // ── lint ───────────────────────────────────────────────────────────

    {
      const { log, captured } = createSilentLog();
      const progress = startProgress('lint');
      try {
        const result = await executeEslintValidation({ baseContext, log, fix });
        if (!result) {
          progress.writeResult(line('lint', '—', 'no files changed'));
        } else if (result.failedFiles.length > 0) {
          progress.writeResult(line('lint', '✗', 'failed', progress.elapsed()));
          if (captured.length > 0) {
            writeln('');
            for (const msg of captured) writeln(`    ${msg}`);
          }
          writeln(`    $ node scripts/eslint ${result.failedFiles.join(' ')}`);
          writeln('');
          errors.push(new Error('eslint failed'));
        } else {
          const notes: string[] = [];
          if (result.fixedFiles.length > 0) {
            notes.push(`fixed ${pluralize(result.fixedFiles.length, 'file')}`);
          }
          if (result.warningCount > 0) {
            notes.push(pluralize(result.warningCount, 'warning'));
          }
          const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
          progress.writeResult(
            line(
              'lint',
              result.warningCount > 0 ? '⚠' : '✓',
              `${pluralize(result.fileCount, 'file')}${suffix}`,
              progress.elapsed()
            )
          );
          if (verbose && result.fixedFiles.length > 0) {
            for (const file of result.fixedFiles) {
              writeln(`         fixed: ${file}`);
            }
          }
        }
      } catch (error) {
        progress.writeResult(line('lint', '✗', 'failed', progress.elapsed()));
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // ── jest ───────────────────────────────────────────────────────────

    {
      const jestProgress = startProgress('jest');

      if (isSkipOrFull) {
        jestProgress.writeResult(
          line('jest', '—', 'skipped (use scripts/jest directly)', jestProgress.elapsed())
        );
      } else if (changedFiles.length === 0) {
        jestProgress.writeResult(line('jest', '—', 'no changed files', jestProgress.elapsed()));
      } else if (
        changedFiles.every(isTestFile) &&
        (() => {
          // Fast path only safe when all test files share exactly one jest unit config.
          // findJestUnitConfig returns undefined for integration and Scout test files.
          const configs = new Set(changedFiles.map(findJestUnitConfig).filter(Boolean));
          return configs.size === 1;
        })()
      ) {
        // Fast path: all changes are test files under one config — run them directly.
        try {
          const result = await runJestTestsDirectly(changedFiles);
          if (result.passed) {
            const tests = result.testCount > 0 ? ` · ${result.testCount} tests` : '';
            jestProgress.writeResult(
              line('jest', '✓', `${changedFiles.length} test files${tests}`, jestProgress.elapsed())
            );
          } else {
            jestProgress.writeResult(line('jest', '✗', 'failed', jestProgress.elapsed()));
            writeln('');
            const excerpt = result.output.split('\n').slice(-15);
            for (const l of excerpt) writeln(`    ${l}`);
            const rerunCommand =
              changedFiles.length === 1
                ? `node scripts/jest ${changedFiles[0]}`
                : `node scripts/jest --runTestsByPath ${changedFiles.join(' ')}`;
            writeln(`    $ ${rerunCommand}`);
            writeln('');
            errors.push(new Error('jest failed'));
          }
        } catch (error) {
          jestProgress.writeResult(line('jest', '✗', 'failed', jestProgress.elapsed()));
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      } else {
        // Normal path: run affected jest tasks via Moon.
        try {
          const downstream =
            baseContext.mode === 'contract' ? baseContext.contract.downstream : 'none';
          const result = await runJestViaMoon({
            changedFiles,
            verbose,
            downstream,
            onProgress: (progress) => {
              jestProgress.setDetail(`[${progress.completedCount} complete]`);
            },
          });

          const printVerbose = () => {
            if (result?.warnings) {
              for (const warning of result.warnings) {
                writeln(line('warn', '!', warning));
              }
            }
            if (result?.verboseDetail) {
              writeln(`         ${result.verboseDetail}`);
            }
          };

          const formatJestSummary = (r: MoonJestResult) => {
            const ran = r.taskCount - r.cachedCount;
            const parts = [];
            if (ran > 0) parts.push(`${pluralize(ran, 'config')} ran`);
            if (r.cachedCount > 0) parts.push(`${pluralize(r.cachedCount, 'config')} cached`);
            if (r.totalTests > 0) parts.push(pluralize(r.totalTests, 'test'));
            return parts.join(', ');
          };

          if (!result || (result.taskCount === 0 && result.exitCode === 0)) {
            jestProgress.writeResult(
              line('jest', '—', 'no affected configs', jestProgress.elapsed())
            );
            printVerbose();
          } else if (result.taskCount === 0) {
            jestProgress.writeResult(line('jest', '✗', 'failed', jestProgress.elapsed()));
            writeln('');
            for (const excerptLine of result.failureExcerpt ?? []) {
              writeln(`    ${excerptLine}`);
            }
            writeln('    $ node scripts/jest --profile quick');
            writeln('');
            printVerbose();
            errors.push(new Error('jest failed'));
          } else if (result.failed.length > 0) {
            const failCount = result.failed.length;
            jestProgress.writeResult(
              line(
                'jest',
                '✗',
                `${pluralize(failCount, 'config')} failed, ${formatJestSummary(result)}`,
                jestProgress.elapsed()
              )
            );
            writeln('');
            for (const task of result.failed) {
              // Group failures by file
              const byFile = new Map<string, JestFailedTest[]>();
              for (const f of task.failures) {
                const list = byFile.get(f.file) ?? [];
                list.push(f);
                byFile.set(f.file, list);
              }

              for (const [file, failures] of byFile) {
                const firstLine = failures[0]?.line;
                const fileRef = firstLine ? `${file}:${firstLine}` : file;
                writeln(`    FAIL ${fileRef}`);
                for (const f of failures) {
                  writeln(`      ● ${f.name}`);
                  writeln('');
                  // Strip ANSI for clean display, trim deep stack frames
                  const lines = stripAnsi(f.message).split('\n');
                  let pastFirstStackFrame = false;
                  for (const msgLine of lines) {
                    const trimmedLine = msgLine.trim();
                    if (trimmedLine.startsWith('at ') && pastFirstStackFrame) {
                      // Skip subsequent stack frames after the first
                      continue;
                    }
                    if (trimmedLine.startsWith('at ')) {
                      pastFirstStackFrame = true;
                    }
                    writeln(`        ${msgLine}`);
                  }
                  writeln('');
                }
              }

              const jestCmd = task.configPath
                ? `node scripts/jest --config ${task.configPath}`
                : `node scripts/jest`;
              writeln(`    $ ${jestCmd}`);
              writeln('');
            }
            printVerbose();
            errors.push(new Error('jest failed'));
          } else {
            jestProgress.writeResult(
              line('jest', '✓', formatJestSummary(result), jestProgress.elapsed())
            );
            printVerbose();
          }
        } catch (error) {
          jestProgress.writeResult(line('jest', '✗', 'failed', jestProgress.elapsed()));
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    // ── tsc ────────────────────────────────────────────────────────────

    {
      const { log, captured } = createSilentLog();
      const procRunner = new ProcRunner(log);
      const tscProgress = startProgress('tsc');

      try {
        const result = await executeTypeCheckValidation({
          baseContext,
          log,
          procRunner,
          pretty: false,
          cleanup: true,
        });

        if (!result) {
          tscProgress.writeResult(line('tsc', '—', 'no affected projects'));
        } else {
          tscProgress.writeResult(
            line('tsc', '✓', pluralize(result.projectCount, 'project'), tscProgress.elapsed())
          );
        }
      } catch (error) {
        tscProgress.writeResult(line('tsc', '✗', 'failed', tscProgress.elapsed()));

        // Parse error lines: convert file(line,col) → file:line:col, group by owning tsconfig
        const errorLines = captured
          .map((msg) =>
            stripAnsi(msg)
              .replace(/^\s*proc\s+\[tsc\]\s*/, '')
              .replace(/^([^\s(]+)\((\d+),(\d+)\)/, '$1:$2:$3')
              .trimEnd()
          )
          .filter((l) => l.includes('error TS'));

        const errorsByProject = new Map<string, string[]>();
        for (const errorLine of errorLines) {
          const fileMatch = errorLine.match(/^([^\s:]+):\d+:\d+/);
          let tsconfig = '';
          if (fileMatch) {
            let dir = Path.dirname(Path.resolve(REPO_ROOT, fileMatch[1]));
            while (true) {
              if (existsSync(Path.join(dir, 'tsconfig.json'))) {
                tsconfig = Path.relative(REPO_ROOT, Path.join(dir, 'tsconfig.json'));
                break;
              }
              if (dir === REPO_ROOT || dir === Path.dirname(dir)) {
                break;
              }
              dir = Path.dirname(dir);
            }
          }
          const list = errorsByProject.get(tsconfig) ?? [];
          list.push(errorLine);
          errorsByProject.set(tsconfig, list);
        }

        writeln('');
        for (const [tsconfig, tscErrors] of errorsByProject) {
          for (const errorLine of tscErrors) {
            writeln(`    ${errorLine}`);
          }
          writeln(
            tsconfig
              ? `    $ node scripts/type_check --project ${tsconfig}`
              : `    $ node scripts/type_check --profile quick`
          );
          writeln('');
        }

        if (errorsByProject.size === 0) {
          writeln(`    $ node scripts/type_check --profile quick`);
          writeln('');
        }
        errors.push(error instanceof Error ? error : new Error(String(error)));
      } finally {
        await procRunner.teardown();
      }
    }

    if (errors.length > 0) {
      process.exitCode = 1;
    }
  },
  {
    description: `
      Run type_check, eslint, and jest with one shared validation contract.

      Defaults to --profile quick when no validation flags are provided.

      Examples:
        node scripts/check --scope local
        node scripts/check --profile agent
        node scripts/check --scope branch --base-ref origin/main
    `,
    flags: {
      string: [...VALIDATION_RUN_STRING_FLAGS],
      boolean: ['fix'],
      default: {
        fix: true,
      },
      help: [...VALIDATION_RUN_HELP, { flag: '--no-fix', description: 'Disable lint auto-fix' }],
    },
  }
);
