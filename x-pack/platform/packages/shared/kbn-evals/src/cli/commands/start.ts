/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn } from 'child_process';
import type { Command } from '@kbn/dev-cli-runner';
import { ensureEvalStack } from '../eval_stack';
import {
  ensureEvalInit,
  resolveEvalSuite,
  resolveEvalRunContext,
  buildEvalRunArgs,
  buildEvalRunEnv,
  formatEvalCliCommand,
  evalRunFlags,
} from '../run_helpers';

export const startCmd: Command<void> = {
  name: 'start',
  description: `
  Start the full eval stack (EDOT collector + Scout server + EIS CCM) and run an eval suite.

  Services (EDOT, Scout) run as background daemons and persist between eval runs.
  Use \`node scripts/evals stop\` to shut them down.

  Examples:
    node scripts/evals start
    node scripts/evals start --suite agent-builder
    node scripts/evals start --suite agent-builder --model eis-gpt-4.1
    node scripts/evals start --suite agent-builder --model eis-gpt-4.1,eis-claude-4-sonnet
    node scripts/evals start --suite agent-builder --grep "product documentation"
    node scripts/evals start --suite agent-builder --skip-server
    node scripts/evals stop
  `,
  flags: evalRunFlags,
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    const profile = await ensureEvalInit(repoRoot, log, flagsReader);

    const { suite, suiteId, configPath, resolvedConfigPath } = await resolveEvalSuite(
      repoRoot,
      log,
      flagsReader
    );

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
    log.info(`Suite:     ${suiteId ?? configPath}`);
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
    log.info('');

    const rerunArgs = buildEvalRunArgs({
      suiteId,
      configPath,
      evaluationConnectorId,
      projects,
      profile,
      flagsReader,
      skipServer,
    });

    log.info(`Re-run command: ${formatEvalCliCommand(['start', ...rerunArgs])}`);
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

    log.info(`[run] Running suite: ${suiteId ?? configPath}`);
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

    const args = ['scripts/playwright', 'test', '--config', resolvedConfigPath];
    for (const p of projects) {
      args.push('--project', p);
    }

    const grep = flagsReader.string('grep');
    if (grep) {
      args.push('--grep', grep);
    }

    await new Promise<void>((resolve, reject) => {
      const childEnv: Record<string, string> = { ...process.env, ...envOverrides } as Record<
        string,
        string
      >;
      delete childEnv.NO_COLOR;
      const child = spawn('node', args, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Playwright exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });

    log.info('');
    log.info('EDOT and Scout are still running in the background.');
    log.info('To stop them: node scripts/evals stop');
  },
};
