/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import inquirer from 'inquirer';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { resolveEvalSuites, type EvalSuiteDefinition } from './suites';
import {
  promptForSuite,
  promptForConnector,
  promptForProject,
  isTTY,
  getAllAvailableConnectors,
} from './prompts';
import {
  isDevVaultProfile,
  resolveVaultConfigPath,
  defaultExportProfile,
  envFromDatasetsProfile,
  envFromExportProfile,
  stripTrailingSlash,
  probeHttp,
  isExportProfileImplicitLocal,
} from './profiles';
import { readCachedEisConnectors } from './eis_connectors_cache';
import {
  runConfigInit,
  runConnectorSetup,
  ensureVaultAuth,
  ensureLocalConfig,
} from './commands/init';

const shellQuote = (value: string): string => {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  const escaped = value.replace(/(["\\$`])/g, '\\$1');
  return `"${escaped}"`;
};

export const formatEvalCliCommand = (args: string[]): string =>
  ['node', 'scripts/evals', ...args.map((a) => (a.includes(' ') ? shellQuote(a) : a))].join(' ');

const ensureSuite = (suiteId: string, repoRoot: string, log: ToolingLog) => {
  const suites = resolveEvalSuites(repoRoot, log);
  const match = suites.find((suite) => suite.id === suiteId);
  if (match) return match;

  log.info(`Suite "${suiteId}" not found in metadata; refreshing discovery...`);
  const refreshed = resolveEvalSuites(repoRoot, log, { refresh: true });
  const refreshedMatch = refreshed.find((suite) => suite.id === suiteId);
  if (refreshedMatch) return refreshedMatch;

  const available = refreshed.map((suite) => suite.id).join(', ');
  throw createFlagError(
    `Unknown suite "${suiteId}". Available suites: ${available || 'none found'}`
  );
};

export const ensureEvalInit = async (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
): Promise<string | undefined> => {
  let profile = flagsReader.string('profile') ?? undefined;

  if (!flagsReader.boolean('skip-init')) {
    if (!profile) {
      if (!isTTY()) {
        throw createFlagError(
          '--profile is required in non-interactive mode (e.g. --profile dev-vault, --profile local).'
        );
      }

      type InfraChoice = 'local' | 'golden-cluster' | 'custom';
      const { choice } = await inquirer.prompt<{ choice: InfraChoice }>({
        type: 'list',
        name: 'choice',
        message: 'How do you want to run evals and export results and traces?',
        choices: [
          { name: 'Local (localhost ES/Kibana)', value: 'local' },
          {
            name: 'Golden cluster (uses Vault -- no config file needed)',
            value: 'golden-cluster',
          },
          { name: 'Custom (create a config file with your own URLs)', value: 'custom' },
        ],
      });

      if (choice === 'local') {
        await ensureLocalConfig(repoRoot, log);
        profile = 'local';
      } else if (choice === 'golden-cluster') {
        await ensureVaultAuth(log);
        profile = 'dev-vault';
      } else {
        const { customProfile } = await inquirer.prompt<{ customProfile: string }>({
          type: 'input',
          name: 'customProfile',
          message: 'Config profile name (creates config.<name>.json, or empty for config.json):',
          default: '',
        });
        const resolvedProfile = customProfile.trim() || 'default';
        await runConfigInit(repoRoot, log, { profile: resolvedProfile });
        profile = resolvedProfile;
      }
    } else if (isDevVaultProfile(profile)) {
      await ensureVaultAuth(log);
    } else if (profile === 'local') {
      await ensureLocalConfig(repoRoot, log);
    } else {
      const vaultConfigPath = resolveVaultConfigPath(repoRoot, profile);
      if (!Fs.existsSync(vaultConfigPath)) {
        if (!isTTY()) {
          throw createFlagError(
            `Config not found: ${vaultConfigPath}. Run \`node scripts/evals init config --profile ${profile}\` to create it.`
          );
        }
        log.info(`Config file for profile "${profile}" not found. Running setup wizard...`);
        log.info('');
        await runConfigInit(repoRoot, log, { profile });
      }
    }

    if (getAllAvailableConnectors(repoRoot).length === 0) {
      if (!isTTY()) {
        throw createFlagError(
          'No connectors available. Set KIBANA_TESTING_AI_CONNECTORS or run with a TTY to use the setup wizard.'
        );
      }
    }

    if (isTTY()) {
      await runConnectorSetup(repoRoot, log);
    }
  }

  return profile;
};

export interface EvalSuiteResolution {
  suite?: EvalSuiteDefinition;
  suiteId?: string;
  configPath?: string;
  resolvedConfigPath: string;
}

export const resolveEvalSuite = async (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
): Promise<EvalSuiteResolution> => {
  let suiteId = flagsReader.string('suite');
  const configPath = flagsReader.string('config');

  if (!suiteId && !configPath) {
    if (isTTY()) {
      const selected = await promptForSuite(repoRoot, log);
      suiteId = selected.id;
    } else {
      throw createFlagError('Missing --suite (or provide --config).');
    }
  }

  if (suiteId && configPath) {
    throw createFlagError('Use either --suite or --config, not both.');
  }

  const suite = suiteId ? ensureSuite(suiteId, repoRoot, log) : undefined;
  const resolvedConfigPath = suite
    ? suite.absoluteConfigPath
    : Path.resolve(repoRoot, configPath as string);

  return {
    suite,
    suiteId,
    configPath,
    resolvedConfigPath,
  };
};

export interface ResolvedProfileEnv {
  datasetsProfile?: string;
  exportProfile?: string;
  profileEnvOverrides: Record<string, string>;
}

export interface ResolveProfileEnvOverridesOptions {
  repoRoot: string;
  log: ToolingLog;
  flagsReader: FlagsReader;
  profile?: string;
}

export const resolveProfileEnvOverrides = async ({
  repoRoot,
  log,
  flagsReader,
  profile,
}: ResolveProfileEnvOverridesOptions): Promise<ResolvedProfileEnv> => {
  const datasetsProfile = flagsReader.string('datasets-profile') ?? profile;
  const exportProfile =
    flagsReader.string('export-profile') ?? profile ?? defaultExportProfile(repoRoot);

  const profileEnvOverrides: Record<string, string> = {
    ...envFromDatasetsProfile(repoRoot, datasetsProfile),
    ...envFromExportProfile(repoRoot, exportProfile, {
      defaultTracingExporters: exportProfile === 'local',
    }),
  };

  if (!profile && isExportProfileImplicitLocal(flagsReader, exportProfile)) {
    const tracingEsUrl = profileEnvOverrides.TRACING_ES_URL;

    const tracingReachable = tracingEsUrl
      ? await probeHttp(stripTrailingSlash(tracingEsUrl))
      : true;

    if (!tracingReachable) {
      log.warning(
        `Export profile "local" was auto-selected but TRACING_ES_URL is not reachable (${tracingEsUrl}). ` +
          'Continuing without external trace queries. To require export, pass --export-profile local.'
      );
      delete profileEnvOverrides.TRACING_ES_URL;
      delete profileEnvOverrides.TRACING_ES_API_KEY;
    }
  }

  return { datasetsProfile, exportProfile, profileEnvOverrides };
};

export const resolveEvaluationConnectorId = async (
  repoRoot: string,
  log: ToolingLog,
  flagsReader: FlagsReader
): Promise<string> => {
  const evaluationConnectorId =
    flagsReader.string('evaluation-connector-id') ?? process.env.EVALUATION_CONNECTOR_ID;

  if (evaluationConnectorId) {
    return evaluationConnectorId;
  }

  if (isTTY()) {
    return promptForConnector(repoRoot, log);
  }

  throw createFlagError(
    'EVALUATION_CONNECTOR_ID is required. Set --evaluation-connector-id or env.'
  );
};

const isEisConnectorId = (id: string): boolean => id.startsWith('eis-');

export interface EvalRunContext {
  evaluationConnectorId: string;
  projects: string[];
  profileEnvOverrides: Record<string, string>;
  datasetsProfile?: string;
  exportProfile?: string;
  requiresEisCcm: boolean;
}

export interface ResolveEvalRunContextOptions {
  repoRoot: string;
  log: ToolingLog;
  flagsReader: FlagsReader;
  profile?: string;
}

export const resolveEvalRunContext = async ({
  repoRoot,
  log,
  flagsReader,
  profile,
}: ResolveEvalRunContextOptions): Promise<EvalRunContext> => {
  const evaluationConnectorId = await resolveEvaluationConnectorId(repoRoot, log, flagsReader);

  let projects: string[] = [];
  const projectFlag = flagsReader.string('project');

  if (projectFlag) {
    projects = projectFlag.split(',').map((p) => p.trim());
  } else {
    const allConnectors = getAllAvailableConnectors(repoRoot);
    if (allConnectors.length > 1 && isTTY()) {
      projects = await promptForProject(repoRoot, log);
    }
  }

  const requiresEisCcm =
    isEisConnectorId(evaluationConnectorId) ||
    (projects.length > 0
      ? projects.some(isEisConnectorId)
      : getAllAvailableConnectors(repoRoot).some((c) => isEisConnectorId(c.id)));

  if (requiresEisCcm && !process.env.KIBANA_TESTING_AI_CONNECTORS) {
    const cached = readCachedEisConnectors();
    if (cached) {
      process.env.KIBANA_TESTING_AI_CONNECTORS = Buffer.from(JSON.stringify(cached)).toString(
        'base64'
      );
      log.info('EIS connectors loaded from cache (~/.elastic/eis-connectors-cache.json)');
    }
  }

  const { datasetsProfile, exportProfile, profileEnvOverrides } = await resolveProfileEnvOverrides({
    repoRoot,
    log,
    flagsReader,
    profile,
  });

  return {
    evaluationConnectorId,
    projects,
    profileEnvOverrides,
    datasetsProfile,
    exportProfile,
    requiresEisCcm,
  };
};

export const buildEvalRunEnv = ({
  evaluationConnectorId,
  requiresEisCcm,
  skipServer,
  suite,
  profileEnvOverrides,
  flagsReader,
  log,
}: {
  evaluationConnectorId: string;
  requiresEisCcm: boolean;
  skipServer: boolean;
  suite?: EvalSuiteDefinition;
  profileEnvOverrides: Record<string, string>;
  flagsReader: FlagsReader;
  log: ToolingLog;
}): Record<string, string> => {
  const envOverrides: Record<string, string> = {
    EVALUATION_CONNECTOR_ID: evaluationConnectorId,
  };

  if (requiresEisCcm && !skipServer) {
    envOverrides.KBN_EVALS_AWAIT_CCM_CONNECTORS = '1';
  }

  if (suite) {
    envOverrides.EVAL_SUITE_ID = suite.id;
  }

  Object.assign(envOverrides, profileEnvOverrides);

  if (envOverrides.TRACING_ES_URL) {
    log.info(`Trace evaluators will query: ${envOverrides.TRACING_ES_URL}`);
  }

  const repetitions = flagsReader.string('repetitions');
  if (repetitions) {
    envOverrides.EVALUATION_REPETITIONS = repetitions;
  }

  const evaluationsKbnUrl = flagsReader.string('evaluations-kbn-url');
  if (evaluationsKbnUrl) {
    envOverrides.EVALUATIONS_KBN_URL = evaluationsKbnUrl;
  }

  const evaluationsKbnApiKey = flagsReader.string('evaluations-kbn-api-key');
  if (evaluationsKbnApiKey) {
    envOverrides.EVALUATIONS_KBN_API_KEY = evaluationsKbnApiKey;
  }

  return envOverrides;
};

export interface BuildEvalRunArgsOptions {
  suiteId?: string;
  configPath?: string;
  evaluationConnectorId: string;
  projects: string[];
  profile?: string;
  flagsReader: FlagsReader;
  skipServer?: boolean;
}

export const buildEvalRunArgs = ({
  suiteId,
  configPath,
  evaluationConnectorId,
  projects,
  profile,
  flagsReader,
  skipServer,
}: BuildEvalRunArgsOptions): string[] => {
  const runArgs: string[] = [];
  if (suiteId) {
    runArgs.push('--suite', suiteId);
  } else if (configPath) {
    runArgs.push('--config', configPath);
  }

  runArgs.push('--judge', evaluationConnectorId);

  if (projects.length > 0) {
    runArgs.push('--model', projects.join(','));
  }

  if (profile) {
    runArgs.push('--profile', profile);
  }
  const passedDatasetsProfile = flagsReader.string('datasets-profile');
  const passedExportProfile = flagsReader.string('export-profile');
  if (passedDatasetsProfile) {
    runArgs.push('--datasets-profile', passedDatasetsProfile);
  }
  if (passedExportProfile) {
    runArgs.push('--export-profile', passedExportProfile);
  }

  const grep = flagsReader.string('grep');
  if (grep) {
    runArgs.push('--grep', grep);
  }

  const repetitions = flagsReader.string('repetitions');
  if (repetitions) {
    runArgs.push('--repetitions', repetitions);
  }

  if (skipServer) {
    runArgs.push('--skip-server');
  }

  return runArgs;
};

export const evalRunFlags: FlagOptions = {
  string: [
    'suite',
    'config',
    'evaluation-connector-id',
    'project',
    'repetitions',
    'grep',
    'profile',
    'datasets-profile',
    'export-profile',
    'evaluations-kbn-url',
    'evaluations-kbn-api-key',
  ],
  boolean: ['skip-server', 'dry-run', 'skip-init'],
  alias: { model: 'project', judge: 'evaluation-connector-id' },
  default: { 'skip-server': false, 'dry-run': false, 'skip-init': false },
};
