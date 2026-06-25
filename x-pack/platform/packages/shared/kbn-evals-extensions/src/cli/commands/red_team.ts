/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn } from 'child_process';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { Command, FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import {
  ensureEvalStack,
  ensureEvalInit,
  resolveEvalSuite,
  resolveEvalRunContext,
  buildEvalRunEnv,
  buildEvalRunArgs,
  formatEvalCliCommand,
  evalRunFlags,
} from '@kbn/evals';
import {
  runRedTeam,
  type RedTeamConfig,
  RED_TEAM_MODULE_IDS,
  type RedTeamModuleId,
} from '../../red_team';

const redTeamFlags: FlagOptions = {
  ...evalRunFlags,
  string: [...(evalRunFlags.string ?? []), 'modules', 'count'],
  alias: {
    ...evalRunFlags.alias,
    module: 'modules',
  },
};

const parseRedTeamModules = (flagsReader: FlagsReader): RedTeamModuleId[] | undefined => {
  const modulesFlag = flagsReader.string('modules');
  if (!modulesFlag) {
    return undefined;
  }

  const moduleIds = modulesFlag
    .split(',')
    .map((moduleId) => moduleId.trim())
    .filter(Boolean);
  if (moduleIds.length === 0) {
    throw createFlagError('--modules must list at least one module id.');
  }

  for (const id of moduleIds) {
    if (!(RED_TEAM_MODULE_IDS as readonly string[]).includes(id)) {
      throw createFlagError(
        `Unknown module "${id}". Valid modules: ${RED_TEAM_MODULE_IDS.join(', ')}`
      );
    }
  }

  return moduleIds as RedTeamModuleId[];
};

const resolveRedTeamConfig = (suiteId: string, flagsReader: FlagsReader): RedTeamConfig => {
  const countStr = flagsReader.string('count');
  let count: number | undefined;
  if (countStr !== undefined) {
    const parsed = parseInt(countStr, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw createFlagError('--count must be a positive integer.');
    }
    count = parsed;
  }
  return {
    suite: suiteId,
    modules: parseRedTeamModules(flagsReader),
    count,
  };
};

export const redTeamCmd: Command<void> = {
  name: 'red-team',
  description: `
  Run red-team adversarial evals for a suite (experimental scaffold).

  Boots the eval stack via shared @kbn/evals helpers, runs the stub orchestrator,
  then delegates to \`node scripts/evals run\`.

  Examples:
    node scripts/evals ext red-team --suite agent-builder --dry-run
    node scripts/evals ext red-team --suite agent-builder --judge eis-gpt-4.1 --skip-server
    node scripts/evals ext red-team --suite agent-builder --modules prompt_injection,jailbreaking --count 5
  `,
  flags: redTeamFlags,
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    const profile = await ensureEvalInit(repoRoot, log, flagsReader);

    const { suite, suiteId } = await resolveEvalSuite(repoRoot, log, flagsReader);

    if (!suiteId) {
      throw createFlagError(
        '--suite is required for red-team (config-only runs are not supported yet).'
      );
    }

    const redTeamConfig = resolveRedTeamConfig(suiteId, flagsReader);

    const {
      evaluationConnectorId,
      projects,
      profileEnvOverrides,
      exportProfile,
      datasetsProfile,
      requiresEisCcm,
    } = await resolveEvalRunContext({ repoRoot, log, flagsReader, profile });

    const skipServer = flagsReader.boolean('skip-server');

    log.info('');
    log.info(`Suite:     ${suiteId}`);
    log.info(`Judge:     ${evaluationConnectorId}`);
    if (projects.length > 0) {
      log.info(`Models:    ${projects.join(', ')}`);
    } else {
      log.info(`Models:    all (from KIBANA_TESTING_AI_CONNECTORS)`);
    }
    log.info(`Server:    ${skipServer ? 'skip (using existing)' : 'managed'}`);
    if (suite?.serverConfigSet) {
      log.info(`Config:    ${suite.serverConfigSet}`);
    }
    log.info(
      `Profiles:  datasets=${datasetsProfile ?? 'config'} export=${exportProfile ?? 'none'}`
    );
    if (redTeamConfig.modules?.length) {
      log.info(`Modules:   ${redTeamConfig.modules.join(', ')}`);
    }
    if (redTeamConfig.count !== undefined) {
      log.info(`Attacks:   ${redTeamConfig.count}`);
    }
    log.info('');

    const runArgs = buildEvalRunArgs({
      suiteId,
      evaluationConnectorId,
      projects,
      profile,
      flagsReader,
    });

    log.info(`Planned evals run: ${formatEvalCliCommand(['run', ...runArgs])}`);
    log.info('');

    if (flagsReader.boolean('dry-run')) {
      log.info('Dry run -- exiting.');
      return;
    }

    if (!skipServer) {
      await ensureEvalStack({
        repoRoot,
        log,
        profileEnvOverrides,
        serverConfigSet: suite?.serverConfigSet,
        requiresEisCcm,
      });
    }

    const report = await runRedTeam(redTeamConfig, log);
    log.info(
      `Stub report: ${report.attackCount} attacks, ${report.passCount} pass, ${report.failCount} fail`
    );
    log.info('');

    const envOverrides = buildEvalRunEnv({
      evaluationConnectorId,
      requiresEisCcm,
      skipServer,
      suite,
      profileEnvOverrides,
      flagsReader,
      log,
    });

    await new Promise<void>((resolve, reject) => {
      const childEnv: Record<string, string> = { ...process.env, ...envOverrides } as Record<
        string,
        string
      >;
      delete childEnv.NO_COLOR;
      const child = spawn('node', ['scripts/evals', 'run', ...runArgs], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
        } else if (signal) {
          reject(new Error(`evals run was killed by signal ${signal}`));
        } else {
          reject(new Error(`evals run exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  },
};
