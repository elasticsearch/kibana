/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn } from 'child_process';
import type { Command } from '@kbn/dev-cli-runner';
import {
  resolveEvalSuite,
  resolveEvaluationConnectorId,
  resolveProfileEnvOverrides,
} from '../run_helpers';

const EXECUTORS = ['phoenix', 'kibana'] as const;
type Executor = (typeof EXECUTORS)[number];

const formatEnvPrefix = (overrides: Record<string, string>) =>
  Object.entries(overrides)
    .map(([key, value]) => {
      const isSensitive =
        key.includes('API_KEY') ||
        key.includes('CREDENTIALS') ||
        key.includes('TOKEN') ||
        key === 'GCS_CREDENTIALS';
      return `${key}=${isSensitive ? '[redacted]' : value}`;
    })
    .join(' ');

export const runSuiteCmd: Command<void> = {
  name: 'run',
  description: `
  Run an evaluation suite.

  Examples:
    node scripts/evals run --suite agent-builder --judge bedrock-claude
    node scripts/evals run --suite obs-ai-assistant --model azure-gpt4o --repetitions 3
    node scripts/evals run --suite agent-builder --grep "product documentation"
    node scripts/evals run --suite streams --dry-run
  `,
  flags: {
    string: [
      'suite',
      'config',
      'project',
      'executor',
      'evaluation-connector-id',
      'repetitions',
      'grep',
      'profile',
      'datasets-profile',
      'export-profile',
      'trace-es-url',
      'trace-es-api-key',
      'evaluations-kbn-url',
      'evaluations-kbn-api-key',
      'phoenix-base-url',
      'phoenix-api-key',
    ],
    boolean: ['dry-run'],
    alias: { model: 'project', judge: 'evaluation-connector-id' },
    default: { 'dry-run': false },
  },
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    const executor = flagsReader.enum('executor', EXECUTORS) as Executor | undefined;

    const { suite, resolvedConfigPath } = await resolveEvalSuite(repoRoot, log, flagsReader);

    const evaluationConnectorId = await resolveEvaluationConnectorId(repoRoot, log, flagsReader);

    const envOverrides: Record<string, string> = {
      EVALUATION_CONNECTOR_ID: evaluationConnectorId,
    };

    if (suite) {
      envOverrides.EVAL_SUITE_ID = suite.id;
    }

    const { datasetsProfile, exportProfile, profileEnvOverrides } =
      await resolveProfileEnvOverrides({
        repoRoot,
        log,
        flagsReader,
        profile: flagsReader.string('profile') ?? undefined,
      });
    Object.assign(envOverrides, profileEnvOverrides);

    log.info(`Profiles: datasets=${datasetsProfile ?? 'config'} export=${exportProfile ?? 'none'}`);

    if (executor === 'phoenix') {
      envOverrides.KBN_EVALS_EXECUTOR = 'phoenix';
    }

    const repetitions = flagsReader.string('repetitions');
    if (repetitions) {
      envOverrides.EVALUATION_REPETITIONS = repetitions;
    }

    const traceEsUrl = flagsReader.string('trace-es-url');
    if (traceEsUrl) {
      envOverrides.TRACING_ES_URL = traceEsUrl;
    }

    const traceEsApiKey = flagsReader.string('trace-es-api-key');
    if (traceEsApiKey) {
      envOverrides.TRACING_ES_API_KEY = traceEsApiKey;
    }

    const evaluationsKbnUrl = flagsReader.string('evaluations-kbn-url');
    if (evaluationsKbnUrl) {
      envOverrides.EVALUATIONS_KBN_URL = evaluationsKbnUrl;
    }

    const evaluationsKbnApiKey = flagsReader.string('evaluations-kbn-api-key');
    if (evaluationsKbnApiKey) {
      envOverrides.EVALUATIONS_KBN_API_KEY = evaluationsKbnApiKey;
    }

    const phoenixBaseUrl = flagsReader.string('phoenix-base-url');
    if (phoenixBaseUrl) {
      envOverrides.PHOENIX_BASE_URL = phoenixBaseUrl;
    }

    const phoenixApiKey = flagsReader.string('phoenix-api-key');
    if (phoenixApiKey) {
      envOverrides.PHOENIX_API_KEY = phoenixApiKey;
    }

    const args = ['scripts/playwright', 'test', '--config', resolvedConfigPath];
    const project = flagsReader.string('project');
    if (project) {
      args.push('--project', project);
    }

    const grep = flagsReader.string('grep');
    if (grep) {
      args.push('--grep', grep);
    }

    const positionals = flagsReader.getPositionals();
    if (positionals.length > 0) {
      args.push(...positionals);
    }

    const commandPreview = `${formatEnvPrefix(envOverrides)} node ${args.join(' ')}`.trim();
    log.info(`Running: ${commandPreview}`);

    if (flagsReader.boolean('dry-run')) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const childEnv: Record<string, string> = { ...process.env, ...envOverrides } as Record<
        string,
        string
      >;
      // Kibana exits on unrecognized Node warnings; avoid Playwright NO_COLOR warning.
      delete childEnv.NO_COLOR;
      const child = spawn('node', args, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Playwright exited with code ${code}`));
      });

      child.on('error', reject);
    });
  },
};
