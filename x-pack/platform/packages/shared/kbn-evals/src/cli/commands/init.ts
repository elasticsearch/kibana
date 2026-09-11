/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execSync, spawnSync, spawn } from 'child_process';
import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import inquirer from 'inquirer';
import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { set } from '@kbn/safer-lodash-set';
import { resolveCcmApiKey } from '@kbn/es';
import { isTTY, parseConnectorsFromEnv, parseConnectorsFromKibanaDevYml } from '../prompts';
import { safeExec, getVaultAddr } from '../utils';
import { readCachedEisConnectors, writeCachedEisConnectors } from '../eis_connectors_cache';
import { VAULT_CONFIG_DIR, resolveVaultConfigPath, readVaultConfigFromDevVault } from '../profiles';

const CONFIG_EXAMPLE_FILENAME = 'config.example.json';

const resolveUserIdentifier = (): string => {
  try {
    const email = execSync('git config user.email', { encoding: 'utf8' }).trim();
    if (email) return email;
  } catch {
    // fall through
  }
  return Os.hostname();
};

const LOCAL_DEFAULTS = {
  evaluationsEs: { url: 'http://elastic:changeme@localhost:9200', apiKey: '' },
  evaluationsKbn: { url: 'http://elastic:changeme@localhost:5601/dev', apiKey: '' },
  tracingEs: { url: 'http://elastic:changeme@localhost:9200', apiKey: '' },
  tracingExporters: [{ http: { url: 'http://localhost:4318/v1/traces' } }],
};

const buildKbnUrl = (basePath: string): string => {
  const trimmed = basePath.trim().replace(/^\/+|\/+$/g, '');
  return trimmed
    ? `http://elastic:changeme@localhost:5601/${trimmed}`
    : 'http://elastic:changeme@localhost:5601';
};

export const ensureLocalConfig = async (repoRoot: string, log: ToolingLog): Promise<void> => {
  const configPath = resolveVaultConfigPath(repoRoot, 'local');
  if (Fs.existsSync(configPath)) return;

  const config: Record<string, unknown> = {
    description: 'kbn-evals local config',
    owner: resolveUserIdentifier(),
    environment: 'local',
    evaluationsEs: { ...LOCAL_DEFAULTS.evaluationsEs },
    tracingEs: { ...LOCAL_DEFAULTS.tracingEs },
    tracingExporters: [...LOCAL_DEFAULTS.tracingExporters],
  };

  if (isTTY()) {
    const { basePath } = await inquirer.prompt<{ basePath: string }>({
      type: 'input',
      name: 'basePath',
      message: 'Kibana base path (e.g. /dev, or empty for none):',
      default: '/dev',
    });

    config.evaluationsKbn = { url: buildKbnUrl(basePath), apiKey: '' };

    type GcsChoice = 'vault' | 'file' | 'skip';
    const { gcsChoice } = await inquirer.prompt<{ gcsChoice: GcsChoice }>({
      type: 'list',
      name: 'gcsChoice',
      message: 'GCS dataset credentials (needed for snapshot restore):',
      choices: [
        { name: 'Pull from dev-vault (requires Vault auth)', value: 'vault' },
        { name: 'Load from local JSON file', value: 'file' },
        { name: 'Skip (configure later)', value: 'skip' },
      ],
    });

    if (gcsChoice === 'vault') {
      await ensureVaultAuth(log);
      const vaultCfg = readVaultConfigFromDevVault();
      if (vaultCfg?.gcsDatasetAccessCredentials) {
        config.gcsDatasetAccessCredentials = vaultCfg.gcsDatasetAccessCredentials;
        log.info('GCS credentials pulled from dev-vault.');
      } else {
        log.warning('Could not retrieve GCS credentials from dev-vault.');
      }
    } else if (gcsChoice === 'file') {
      const { gcsPath } = await inquirer.prompt<{ gcsPath: string }>({
        type: 'input',
        name: 'gcsPath',
        message: 'Path to GCS service account JSON file:',
        default: '',
      });
      if (gcsPath.trim() && Fs.existsSync(gcsPath.trim())) {
        try {
          const gcsCreds = JSON.parse(Fs.readFileSync(gcsPath.trim(), 'utf-8'));
          config.gcsDatasetAccessCredentials = gcsCreds;
          log.info('GCS credentials loaded from file.');
        } catch {
          log.warning('Failed to parse GCS credentials file. Edit config.local.json manually.');
        }
      }
    }
  } else {
    config.evaluationsKbn = { ...LOCAL_DEFAULTS.evaluationsKbn };
  }

  Fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  log.info(`Written local config to ${configPath}`);
  log.info('');
  log.info(
    'Note: the local profile expects Elasticsearch on localhost:9200 and Kibana on localhost:5601.'
  );
  log.info(
    'Make sure both are running before starting evals (e.g. yarn es snapshot && yarn start).'
  );
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const arrayMatch = path.match(/^(.+)\[(\d+)\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrayPath, indexStr, rest] = arrayMatch;
    const arr = getNestedValue(obj, arrayPath) as unknown[];
    if (!Array.isArray(arr)) return undefined;
    return getNestedValue(arr[Number(indexStr)] as Record<string, unknown>, rest);
  }
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur && typeof cur === 'object' && Object.hasOwn(cur as Record<string, unknown>, key)) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

export const runConfigInit = async (
  repoRoot: string,
  log: ToolingLog,
  options?: { profile?: string }
): Promise<boolean> => {
  if (options?.profile === 'local') {
    await ensureLocalConfig(repoRoot, log);
    return true;
  }

  const configPath = resolveVaultConfigPath(repoRoot, options?.profile);
  const configFileName = Path.basename(configPath);
  const examplePath = Path.join(Path.dirname(configPath), CONFIG_EXAMPLE_FILENAME);
  const userIdentifier = resolveUserIdentifier();

  if (Fs.existsSync(configPath)) {
    log.info(`Config already exists at ${VAULT_CONFIG_DIR}/${configFileName}`);
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>({
      type: 'confirm',
      name: 'overwrite',
      message: `Overwrite existing ${configFileName}?`,
      default: false,
    });
    if (!overwrite) {
      log.info('Keeping existing config.');
      return true;
    }
  }

  if (!Fs.existsSync(examplePath)) {
    log.warning(`Example config not found at ${examplePath}`);
    return false;
  }

  const example = JSON.parse(Fs.readFileSync(examplePath, 'utf-8')) as Record<string, unknown>;

  example.description = `kbn-evals custom config for ${userIdentifier}`;
  example.contact = userIdentifier;
  example.owner = userIdentifier;

  log.info('');
  log.info('Provide your custom infrastructure URLs and credentials.');
  log.info('');

  const urlFields = [
    { jsonPath: 'evaluationsKbn.url', label: 'Evaluations Kibana URL' },
    { jsonPath: 'tracingEs.url', label: 'Tracing ES URL' },
  ];

  for (const field of urlFields) {
    const currentValue = getNestedValue(example, field.jsonPath);
    const defaultValue = typeof currentValue === 'string' ? currentValue : '';
    const { value } = await inquirer.prompt<{ value: string }>({
      type: 'input',
      name: 'value',
      message: `${field.label}:`,
      default: defaultValue,
    });
    if (value.trim()) {
      set(example, field.jsonPath, value.trim());
    }
  }

  const { tracingExporterUrl } = await inquirer.prompt<{ tracingExporterUrl: string }>({
    type: 'input',
    name: 'tracingExporterUrl',
    message: 'Tracing exporter URL:',
    default: 'http://localhost:4318/v1/traces',
  });

  if (tracingExporterUrl.trim()) {
    example.tracingExporters = [{ http: { url: tracingExporterUrl.trim() } }];
  }

  log.info('');

  const apiKeyFields = [
    { jsonPath: 'evaluationsKbn.apiKey', label: 'Evaluations Kibana API key' },
    { jsonPath: 'tracingEs.apiKey', label: 'Tracing ES API key' },
    {
      jsonPath: 'tracingExporters[0].http.headers.Authorization',
      label: 'Tracing exporter Authorization header (e.g. ApiKey ...)',
    },
  ];

  for (const field of apiKeyFields) {
    const { value } = await inquirer.prompt<{ value: string }>({
      type: 'password',
      name: 'value',
      message: `${field.label}:`,
      mask: '*',
    });
    set(example, field.jsonPath, value.trim() || '');
  }

  const openrouterApiKey = getNestedValue(example, 'openrouter.apiKey');
  if (typeof openrouterApiKey === 'string' && openrouterApiKey.includes('REPLACE_ME')) {
    const { value } = await inquirer.prompt<{ value: string }>({
      type: 'password',
      name: 'value',
      message: 'OpenRouter API key:',
      mask: '*',
    });
    if (value.trim()) {
      set(example, 'openrouter.apiKey', value.trim());
    }
  }

  const { wantGcs } = await inquirer.prompt<{ wantGcs: boolean }>({
    type: 'confirm',
    name: 'wantGcs',
    message: 'Do you have GCS service account credentials for snapshot datasets?',
    default: false,
  });

  if (!wantGcs) {
    delete example.gcsDatasetAccessCredentials;
  } else {
    const { gcsPath } = await inquirer.prompt<{ gcsPath: string }>({
      type: 'input',
      name: 'gcsPath',
      message: 'Path to GCS service account JSON file (leave empty to fill later):',
      default: '',
    });
    if (gcsPath.trim() && Fs.existsSync(gcsPath.trim())) {
      try {
        const gcsCreds = JSON.parse(Fs.readFileSync(gcsPath.trim(), 'utf-8'));
        example.gcsDatasetAccessCredentials = gcsCreds;
        log.info('GCS credentials loaded from file.');
      } catch {
        log.warning('Failed to parse GCS credentials file. Fill in config.json manually.');
      }
    }
  }

  Fs.writeFileSync(configPath, JSON.stringify(example, null, 2) + '\n');
  log.info('');
  log.info(`Config written to ${VAULT_CONFIG_DIR}/${configFileName}`);
  log.info('Edit it to fill in any remaining REPLACE_ME values.');
  log.info('');
  log.info('Start an eval:');
  log.info(
    `  node scripts/evals start --suite <suite-id> --profile ${options?.profile ?? 'config'}`
  );
  return true;
};

const checkVaultAuth = (): boolean => {
  return safeExec('vault', ['token', 'lookup', '-format=json']) !== null;
};

const vaultLogin = async (log: ToolingLog): Promise<void> => {
  const vaultAddr = getVaultAddr();
  log.info(`Launching Vault OIDC login against ${vaultAddr}...`);
  log.info('A browser window should open. If it does not, follow the URL printed below.');

  const child = spawn('vault', ['login', '--method', 'oidc'], {
    env: { ...process.env, VAULT_ADDR: vaultAddr },
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => resolve(code));
  });

  if (exitCode !== 0) {
    throw new Error(
      [
        `Vault login failed (exit code ${exitCode}).`,
        '',
        'See https://docs.elastic.dev/vault for setup instructions.',
      ].join('\n')
    );
  }
};

export const ensureVaultAuth = async (log: ToolingLog): Promise<void> => {
  if (checkVaultAuth()) {
    return;
  }
  log.info('Vault session expired or not found — attempting login...');
  await vaultLogin(log);
  if (!checkVaultAuth()) {
    throw new Error('Vault authentication still failing after login attempt.');
  }
};

const runDiscoverEisModels = (repoRoot: string, apiKey: string): void => {
  const result = spawnSync('node', ['scripts/discover_eis_models.js'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, KIBANA_EIS_CCM_API_KEY: apiKey },
  });

  if (result.status !== 0) {
    throw new Error(`discover_eis_models failed with exit code ${result.status}`);
  }
};

const runGenerateEisConnectors = (repoRoot: string): string => {
  const scriptPath = Path.join(
    'x-pack/platform/packages/shared/kbn-evals/scripts/ci/generate_eis_connectors.js'
  );

  const result = spawnSync('node', [scriptPath, '--format=base64'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    throw new Error(`generate_eis_connectors failed: ${stderr || `exit code ${result.status}`}`);
  }

  return result.stdout.trim();
};

const listConnectorIds = (base64Payload: string): Array<{ id: string; name: string }> => {
  try {
    const parsed = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8')) as Record<
      string,
      { name?: string }
    >;
    return Object.entries(parsed).map(([id, connector]) => ({
      id,
      name: connector?.name ?? id,
    }));
  } catch {
    return [];
  }
};

export const runConnectorSetup = async (repoRoot: string, log: ToolingLog): Promise<void> => {
  if (!isTTY()) {
    throw new Error(
      'No connectors available. Set KIBANA_TESTING_INFERENCE_ENDPOINTS (inference endpoints) or KIBANA_TESTING_AI_CONNECTORS (stack connectors), or run with a TTY to use the setup wizard.'
    );
  }

  const existingConnectors = parseConnectorsFromEnv();
  const hasExistingConnectors = existingConnectors.length > 0;
  const kibanaDevYmlConnectors = parseConnectorsFromKibanaDevYml(repoRoot);
  const hasKibanaDevYmlConnectors = kibanaDevYmlConnectors.length > 0;

  const choices = [{ name: 'EIS (Cloud Connected Mode) -- recommended', value: 'eis' }];
  if (hasKibanaDevYmlConnectors) {
    choices.push({
      name: `kibana.dev.yml (${kibanaDevYmlConnectors.length} preconfigured connector(s) found)`,
      value: 'kibana-dev-yml',
    });
  }
  if (hasExistingConnectors) {
    choices.push({
      name: `Already set (${existingConnectors.length} connector(s) found in env)`,
      value: 'existing',
    });
  }

  const { connectorSource } = await inquirer.prompt<{ connectorSource: string }>({
    type: 'list',
    name: 'connectorSource',
    message: 'How are your LLM connectors configured?',
    choices,
  });

  if (connectorSource === 'existing') {
    log.info('');
    log.info('Available connectors:');
    existingConnectors.forEach((c) => log.info(`  - ${c.id} (${c.name})`));
    log.info('');
    log.info('You are all set! Run an eval with:');
    log.info('  node scripts/evals start --suite <suite-id>');
    log.info('  node scripts/evals run --suite <suite-id> --evaluation-connector-id <id>');
    return;
  }

  if (connectorSource === 'kibana-dev-yml') {
    log.info('');
    log.info(
      `Found ${kibanaDevYmlConnectors.length} preconfigured connector(s) in config/kibana.dev.yml:`
    );
    kibanaDevYmlConnectors.forEach((c) => log.info(`  - ${c.id} (${c.name})`));
    log.info('');
    log.info(
      'These connectors will be used automatically when KIBANA_TESTING_AI_CONNECTORS is not set.'
    );
    log.info('Set KBN_EVALS_SKIP_CONNECTOR_SETUP=true to skip connector setup/teardown.');
    log.info('');
    log.info('Run an eval with:');
    log.info(
      '  KBN_EVALS_SKIP_CONNECTOR_SETUP=true node scripts/evals run --suite <suite-id> --evaluation-connector-id <connector-id>'
    );
    return;
  }

  log.info('');

  const cachedConnectors = readCachedEisConnectors();
  if (cachedConnectors) {
    const connectorEntries = Object.entries(cachedConnectors);
    const base64Payload = Buffer.from(JSON.stringify(cachedConnectors)).toString('base64');
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = base64Payload;

    log.info(`Using cached EIS connectors (${connectorEntries.length} connector(s)):`);
    connectorEntries.forEach(([id]) => log.info(`  - ${id}`));
    log.info('');
    log.info('To force re-discovery, run: node scripts/evals init');
    return;
  }

  const vaultAddr = getVaultAddr();

  log.info(`Checking Vault auth (VAULT_ADDR=${vaultAddr})...`);
  await ensureVaultAuth(log);
  log.info('Vault auth OK');

  const apiKey = await resolveCcmApiKey(log);
  log.info('CCM API key retrieved');

  log.info('');
  log.info('Discovering available EIS models (this starts a temporary ES cluster)...');
  log.info('');
  runDiscoverEisModels(repoRoot, apiKey);

  log.info('Generating connector payload...');
  const base64Payload = runGenerateEisConnectors(repoRoot);
  const connectors = listConnectorIds(base64Payload);

  if (connectors.length === 0) {
    throw new Error('No connectors generated from EIS models.');
  }

  const parsedConnectors = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8'));
  writeCachedEisConnectors(parsedConnectors);

  log.info(`Generated and cached ${connectors.length} connector(s)`);

  log.info('');
  log.info('Done! Run the following to export connectors to your shell:');
  log.info('');
  log.info(`  export KIBANA_TESTING_INFERENCE_ENDPOINTS="${base64Payload}"`);
  process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS = base64Payload;
  log.info('');
  log.info('Available connector IDs:');
  connectors.forEach((c) => log.info(`  - ${c.id}`));
  log.info('');
  log.info('Then start an eval:');
  log.info('  node scripts/evals start --suite <suite-id>');
  log.info('  node scripts/evals run --suite <suite-id> --evaluation-connector-id <id>');
};

export const initCmd: Command<void> = {
  name: 'init',
  description: `
  Set up custom config and connectors for running evals.

  Subcommands:
    node scripts/evals init              Full setup (config + connectors)
    node scripts/evals init config       Only create/update a custom config file

  Creates a config file with your own URLs and credentials.
  For golden cluster access, use --profile dev-vault with the start command.
  For local development, use --profile local with the start command.

  Examples:
    node scripts/evals init
    node scripts/evals init config
    node scripts/evals init config --profile mysetup
  `,
  flags: {
    string: ['profile'],
    help: `
      --profile <name>   Write config to config.<name>.json instead of config.json
                          (e.g. --profile mysetup creates config.mysetup.json)
    `,
  },
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    const positionals = flagsReader.getPositionals();
    const configOnly = positionals.includes('config');
    const profile = flagsReader.string('profile') ?? undefined;

    const knownPositionals = new Set(['config']);
    const unknownPositionals = positionals.filter((p) => !knownPositionals.has(p));
    if (unknownPositionals.length > 0) {
      const hint = unknownPositionals.length === 1 && !profile ? unknownPositionals[0] : null;
      throw new Error(
        [
          `Unknown argument${unknownPositionals.length > 1 ? 's' : ''}: ${unknownPositionals.join(
            ', '
          )}`,
          hint
            ? `Did you mean --profile ${hint}? (e.g. node scripts/evals init config --profile ${hint})`
            : 'Use --profile <name> to specify a config profile name.',
        ].join('\n')
      );
    }

    log.info('Welcome to kbn-evals setup!');
    log.info('');
    await runConfigInit(repoRoot, log, { profile });
    if (!configOnly) {
      await runConnectorSetup(repoRoot, log);
    }
  },
};
