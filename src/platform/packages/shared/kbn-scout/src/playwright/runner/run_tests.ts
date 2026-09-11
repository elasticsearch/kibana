/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getTimeReporter } from '@kbn/ci-stats-reporter';
import { getFlags } from '@kbn/dev-cli-runner';
import type { ProcRunner } from '@kbn/dev-proc-runner';
import { withProcRunner } from '@kbn/dev-proc-runner';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ToolingLog } from '@kbn/tooling-log';
import { pickLevelFromFlags } from '@kbn/tooling-log';
import { basename, isAbsolute, relative, resolve } from 'path';
import { silence } from '../../common';
import {
  preCreateSecurityIndexesViaSamlAuth,
  runElasticsearch,
  runKibanaServer,
} from '../../servers';
import { getConfigRootDir, loadServersConfig } from '../../servers/configs';
import { getExtraKbnOpts } from '../../servers/run_kibana_server';
import type { ScoutPlaywrightProjects } from '../types';
import { execPromise, getPlaywrightGrepTag, withKibanaSwcRegister } from '../utils';
import type { RunTestsOptions } from './flags';

export const getPlaywrightProject = (
  testTarget: RunTestsOptions['testTarget']
): ScoutPlaywrightProjects => {
  switch (testTarget.location) {
    case 'local':
      return 'local';
    case 'cloud':
      return testTarget.arch === 'stateful' ? 'ech' : 'mki';
    default:
      throw new Error(`Unable to determine Playwright project for test target '${testTarget}'`);
  }
};

const getScoutRunCommandForReporting = (argv: string[]): string => {
  const [nodeBin, scriptPath, ...rest] = argv;
  const nodeDisplay =
    typeof nodeBin === 'string' && basename(nodeBin) === 'node' ? 'node' : nodeBin;

  if (typeof scriptPath !== 'string') {
    return [nodeDisplay, ...rest].filter(Boolean).join(' ');
  }

  const relativeScriptPath = isAbsolute(scriptPath) ? relative(REPO_ROOT, scriptPath) : scriptPath;
  const scriptDisplay =
    relativeScriptPath && !relativeScriptPath.startsWith('..') ? relativeScriptPath : scriptPath;

  return [nodeDisplay, scriptDisplay, ...rest].filter(Boolean).join(' ');
};

async function runPlaywrightTest(
  procs: ProcRunner,
  cmd: string,
  args: string[],
  env: Record<string, string> = {}
) {
  return procs.run(`playwright`, {
    cmd,
    args,
    cwd: resolve(REPO_ROOT),
    env: withKibanaSwcRegister({
      ...process.env,
      ...env,
    }),
    wait: true,
  });
}

export async function hasTestsInPlaywrightConfig(
  log: ToolingLog,
  cmd: string,
  cmdArgs: string[],
  configPath: string
): Promise<number> {
  log.info(`scout: Validate Playwright config has tests`);
  try {
    const validationCmd = [cmd, ...cmdArgs, '--list'].join(' ');

    const result = await execPromise(validationCmd, {
      env: withKibanaSwcRegister({
        ...process.env,
        SCOUT_REPORTER_ENABLED: 'false',
      }) as NodeJS.ProcessEnv,
    });
    const lastLine = result.stdout.trim().split('\n').pop() || '';

    log.info(`scout: ${lastLine}`);
    return 0; // success
  } catch (err) {
    const errorMessage = (err as Error).message || String(err);

    if (errorMessage.includes('No tests found')) {
      log.error(
        `scout: No tests found in [${configPath}]. ` +
          `Run 'npx playwright test --list --config ${configPath}' to see Playwright errors.`
      );
      return 2; // "no tests" code, no hard failure on CI
    }

    if (errorMessage.includes(`unknown command 'test'`)) {
      log.error(`scout: Playwright CLI is probably broken.\n${errorMessage}`);
      return 1;
    }

    log.error(`scout: Unknown error occurred.\n${errorMessage}`);
    return 1;
  }
}

async function runLocalServersAndTests(
  procs: ProcRunner,
  log: ToolingLog,
  options: RunTestsOptions,
  cmd: string,
  cmdArgs: string[],
  env: Record<string, string> = {}
) {
  const configRootDir = getConfigRootDir(options.configPath, options.testTarget);
  const config = await loadServersConfig(options.testTarget, log, configRootDir);
  const abortCtrl = new AbortController();

  const onEarlyExit = (msg: string) => {
    log.error(msg);
    abortCtrl.abort();
  };

  let shutdownEs;

  try {
    shutdownEs = await runElasticsearch({
      onEarlyExit,
      config,
      log,
      esFrom: options.esFrom,
      logsDir: options.logsDir,
    });

    await runKibanaServer({
      procs,
      onEarlyExit,
      config,
      installDir: options.installDir,
      extraKbnOpts: getExtraKbnOpts(options.installDir, config.get('serverless')),
    });

    // wait for 5 seconds
    await silence(log, 5000);

    // Pre-create Elasticsearch Security indexes after server startup
    await preCreateSecurityIndexesViaSamlAuth(config, log);

    await runPlaywrightTest(procs, cmd, cmdArgs, env);
  } finally {
    try {
      await procs.stop('kibana');
    } finally {
      if (shutdownEs) {
        await shutdownEs();
      }
    }
  }
}

export async function runTests(log: ToolingLog, options: RunTestsOptions) {
  const runStartTime = Date.now();
  const reportTime = getTimeReporter(log, 'scripts/scout run-tests');

  const scoutRunCommandForReporting = getScoutRunCommandForReporting(process.argv);

  const pwGrepTag = getPlaywrightGrepTag(options.testTarget);
  const pwConfigPath = options.configPath;
  const pwTestFiles = options.testFiles || [];
  const pwProject = getPlaywrightProject(options.testTarget);
  const globalFlags = getFlags(process.argv.slice(2), {
    allowUnexpected: true,
  });
  // Temporarily use `debug` log level for Playwright tests to better understand performance issues;
  // We are going to change it to `info` in the future. This change doesn't affect Test Servers logging.
  const logsLevel = pickLevelFromFlags(globalFlags, { default: 'debug' });

  if (pwTestFiles.length > 0) {
    log.info(`scout: Running Scout tests located in:\n${pwTestFiles.join('\n')}`);
  }

  if (options.repeatEach) {
    log.info(
      `scout: Each test will be repeated ${options.repeatEach} time(s) for flakiness validation`
    );
  }

  const pwBinPath = resolve(REPO_ROOT, './node_modules/.bin/playwright');
  const pwCmdArgs = [
    'test',
    ...(pwTestFiles.length ? pwTestFiles : []),
    `--config=${pwConfigPath}`,
    `--grep=${pwGrepTag}`,
    `--project=${pwProject}`,
    ...(options.headed ? ['--headed'] : []),
    ...(options.repeatEach ? [`--repeat-each=${options.repeatEach}`] : []),
  ];

  await withProcRunner(log, async (procs) => {
    const exitCode = await hasTestsInPlaywrightConfig(log, pwBinPath, pwCmdArgs, pwConfigPath);
    const pwEnv = {
      SCOUT_LOG_LEVEL: logsLevel,
      SCOUT_TARGET_LOCATION: options.testTarget.location,
      SCOUT_TARGET_ARCH: options.testTarget.arch,
      SCOUT_TARGET_DOMAIN: options.testTarget.domain,
      SCOUT_RUN_COMMAND: scoutRunCommandForReporting,
    };

    if (exitCode !== 0) {
      process.exit(exitCode);
    }

    if (pwProject === 'local') {
      await runLocalServersAndTests(procs, log, options, pwBinPath, pwCmdArgs, pwEnv);
    } else {
      await runPlaywrightTest(procs, pwBinPath, pwCmdArgs, pwEnv);
    }

    reportTime(runStartTime, 'ready', {
      success: true,
      ...options,
    });
  });
}

export async function runPlaywrightTestCheck(log: ToolingLog) {
  const runStartTime = Date.now();
  const reportTime = getTimeReporter(log, 'scripts/scout run-playwright-test-check');
  log.info(`scout: Validate 'playwright test' command can run successfully`);

  const pwBinPath = resolve(REPO_ROOT, './node_modules/.bin/playwright');
  const pwCmdArgs = [
    'test',
    `--config=x-pack/platform/plugins/private/discover_enhanced/test/scout/ui/playwright.config.ts`,
    `--list`,
  ];

  const pwEnv = {
    SCOUT_TARGET_LOCATION: 'local',
    SCOUT_TARGET_ARCH: 'stateful',
    SCOUT_TARGET_DOMAIN: 'classic',
  };

  await withProcRunner(log, async (procs) => {
    await runPlaywrightTest(procs, pwBinPath, pwCmdArgs, pwEnv);

    reportTime(runStartTime, 'ready', {
      success: true,
    });
  });
}
