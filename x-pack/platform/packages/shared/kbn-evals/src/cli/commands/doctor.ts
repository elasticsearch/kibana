/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import type { Command } from '@kbn/dev-cli-runner';
import { parseConnectorsFromEnv, isTTY } from '../prompts';
import {
  isServiceRunning,
  readState,
  startService,
  tailLog,
  EDOT_CONTAINER_NAME,
} from '../services';
import { safeExec } from '../utils';
import { defaultExportProfile, readVaultConfigFromFile, resolveVaultConfigPath } from '../profiles';

const SCOUT_LOCAL_SERVER_CONFIG_PATH = '.scout/servers/local.json';

type CheckStatus = 'pass' | 'fail' | 'warn' | 'unknown';

interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
  fix?: () => Promise<void>;
}

export const doctorCmd: Command<void> = {
  name: 'doctor',
  description: `
  Check common prerequisites for running evals locally.
  When run interactively, offers to fix issues automatically.

  Example:
    node scripts/evals doctor
  `,
  flags: {
    boolean: ['fix'],
    default: { fix: false },
  },
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    const autoFix = flagsReader.boolean('fix');
    const interactive = isTTY();
    const checks: CheckResult[] = [];

    // --- Check: connectors (inference endpoints + stack connectors) ---
    const connectors = parseConnectorsFromEnv();
    if (connectors.length > 0) {
      checks.push({
        label: 'Connectors (env)',
        status: 'pass',
        detail: `${connectors.length} connector(s)`,
      });
    } else {
      checks.push({
        label: 'Connectors (env)',
        status: 'fail',
        detail: 'KIBANA_TESTING_INFERENCE_ENDPOINTS and KIBANA_TESTING_AI_CONNECTORS are not set',
        fix: async () => {
          log.info('Run `node scripts/evals init` to set up connectors.');
        },
      });
    }

    // --- Check: Vault auth ---
    const vaultResult = safeExec('vault', ['token', 'lookup', '-format=json']);
    if (vaultResult !== null) {
      checks.push({ label: 'Vault auth', status: 'pass', detail: 'authenticated' });
    } else {
      const vaultAvailable = safeExec('vault', ['version']);
      if (vaultAvailable === null) {
        checks.push({ label: 'Vault auth', status: 'unknown', detail: 'vault CLI not found' });
      } else {
        checks.push({
          label: 'Vault auth',
          status: 'warn',
          detail: 'not authenticated',
          fix: async () => {
            log.info('Attempting: vault login --method oidc');
            const child = spawn('vault', ['login', '--method', 'oidc'], {
              stdio: 'inherit',
            });
            await new Promise<void>((resolve) => child.on('exit', () => resolve()));
          },
        });
      }
    }

    // --- Check: Docker ---
    const dockerVersion = safeExec('docker', ['version', '--format', '{{.Server.Version}}']);
    if (dockerVersion !== null) {
      checks.push({ label: 'Docker', status: 'pass', detail: `v${dockerVersion}` });
    } else {
      const dockerAvailable = safeExec('docker', ['--version']);
      checks.push({
        label: 'Docker',
        status: dockerAvailable ? 'fail' : 'unknown',
        detail: dockerAvailable ? 'daemon not running' : 'not installed',
      });
    }

    // --- Check: EDOT collector ---
    const edotManagedAlive = isServiceRunning(repoRoot, 'edot');
    const dockerPs = safeExec('docker', [
      'ps',
      '--filter',
      `name=${EDOT_CONTAINER_NAME}`,
      '--format',
      '{{.Names}}',
    ]);
    const edotDockerAlive =
      dockerPs !== null && dockerPs.split('\n').some((name) => name.trim() === EDOT_CONTAINER_NAME);

    if (edotManagedAlive || edotDockerAlive) {
      const source = edotManagedAlive ? 'managed' : 'docker';
      checks.push({ label: 'EDOT collector', status: 'pass', detail: `running (${source})` });
    } else if (dockerPs === null) {
      checks.push({ label: 'EDOT collector', status: 'unknown', detail: 'docker not available' });
    } else {
      checks.push({
        label: 'EDOT collector',
        status: 'fail',
        detail: 'not running',
        fix: async () => {
          log.info('Starting EDOT collector (backgrounded)...');
          startService(repoRoot, 'edot', 'node', ['scripts/edot_collector.js'], log);

          const stopTail = tailLog(repoRoot, 'edot', log, { fromStart: true });
          await new Promise((r) => setTimeout(r, 5000));
          stopTail();

          const edotUpAfterFix = safeExec('docker', [
            'ps',
            '--filter',
            `name=${EDOT_CONTAINER_NAME}`,
            '--format',
            '{{.Names}}',
          ]);
          if (
            edotUpAfterFix &&
            edotUpAfterFix.split('\n').some((n) => n.trim() === EDOT_CONTAINER_NAME)
          ) {
            log.info('EDOT collector started successfully');
          } else {
            log.warning(
              'EDOT collector may not have started. Check logs: node scripts/evals logs --service edot'
            );
          }
        },
      });
    }

    // --- Check: Scout server ---
    const scoutManagedAlive = isServiceRunning(repoRoot, 'scout');
    const psOutput = safeExec('ps', ['ax', '-o', 'command=']);
    const scoutProcessLine = psOutput
      ?.split('\n')
      .find((line) => line.includes('scripts/scout.js start-server'));
    const scoutIsRunning = scoutManagedAlive || Boolean(scoutProcessLine);

    if (scoutIsRunning) {
      let detail = 'running';
      if (scoutManagedAlive) {
        const state = readState(repoRoot);
        const configSet = state.scout?.serverConfigSet;
        const configSetInfo = configSet ? `, serverConfigSet=${configSet}` : '';
        detail = `running (managed, PID ${state.scout?.pid}${configSetInfo})`;
      } else if (scoutProcessLine) {
        const configMatch = scoutProcessLine.match(/--serverConfigSet(?:=|\s+)(\S+)/);
        const archMatch = /--arch(?:=|\s+)(stateful|serverless)/.exec(scoutProcessLine);
        const parts = [
          archMatch?.[1],
          configMatch ? `serverConfigSet=${configMatch[1]}` : undefined,
        ]
          .filter(Boolean)
          .join(', ');
        detail = parts.length > 0 ? `running (${parts})` : 'running';
      }
      checks.push({ label: 'Scout server', status: 'pass', detail });
    } else if (psOutput === null) {
      checks.push({ label: 'Scout server', status: 'unknown', detail: 'unable to list processes' });
    } else {
      checks.push({
        label: 'Scout server',
        status: 'fail',
        detail: 'not running',
        fix: async () => {
          log.info('Scout will start automatically with: node scripts/evals start');
          log.info('Or start it standalone: node scripts/evals scout');
        },
      });
    }

    // --- Check: Scout local config ---
    if (!scoutIsRunning) {
      const scoutConfigExists = Fs.existsSync(Path.join(repoRoot, SCOUT_LOCAL_SERVER_CONFIG_PATH));
      if (!scoutConfigExists) {
        checks.push({
          label: 'Scout config',
          status: 'warn',
          detail: `${SCOUT_LOCAL_SERVER_CONFIG_PATH} not found`,
        });
      }
    }

    // --- Print results ---
    log.info('');
    log.info('Checking prerequisites...');

    const statusIcons: Record<CheckStatus, string> = {
      pass: 'pass',
      fail: 'FAIL',
      warn: 'warn',
      unknown: '????',
    };

    let hasFailures = false;
    const fixableChecks: CheckResult[] = [];

    for (const check of checks) {
      const icon = statusIcons[check.status];
      const detail = check.detail ? ` ${check.detail}` : '';
      log.info(`  [${icon}] ${check.label}:${detail}`);

      if (check.status === 'fail') {
        hasFailures = true;
      }
      if (check.fix && (check.status === 'fail' || check.status === 'warn')) {
        fixableChecks.push(check);
      }
    }

    log.info('');

    // --- Offer fixes ---
    if (fixableChecks.length > 0 && (autoFix || interactive)) {
      for (const check of fixableChecks) {
        let shouldFix = autoFix;

        if (!shouldFix && interactive) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: `Fix "${check.label}"?`,
            default: true,
          });
          shouldFix = confirm;
        }

        if (shouldFix && check.fix) {
          await check.fix();
        }
      }
      log.info('');
    }

    if (!hasFailures) {
      log.info('All critical checks passed! Ready to run evals.');
    } else {
      log.info('Some checks failed. Fix the issues above, then re-run: node scripts/evals doctor');
    }

    log.info('');
    log.info('Quick start:');
    log.info('  node scripts/evals start --suite <suite-id>');

    // --- Profile hint: golden datasets + local export ---
    const goldenConfigExists = readVaultConfigFromFile(repoRoot) !== undefined;
    const localProfile = defaultExportProfile(repoRoot);
    const localConfigExists = localProfile != null;
    if (goldenConfigExists) {
      log.info('');
      log.info('Tip: golden datasets + local export');
      log.info(
        `  (datasets from ${resolveVaultConfigPath(repoRoot)}; export via ${
          localConfigExists ? resolveVaultConfigPath(repoRoot, localProfile) : 'local defaults'
        })`
      );
      if (!localConfigExists) {
        log.info('  Create local export profile: node scripts/evals init config --profile local');
      }
      log.info('  node scripts/evals start --suite attack-discovery --export-profile local');
    }
  },
};
