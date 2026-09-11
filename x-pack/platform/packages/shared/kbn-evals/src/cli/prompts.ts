/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { parse } from 'yaml';
import inquirer from 'inquirer';
import type { ToolingLog } from '@kbn/tooling-log';
import { resolveEvalSuites, type EvalSuiteDefinition } from './suites';

const KIBANA_DEV_YML = 'config/kibana.dev.yml';

export interface AvailableConnectorEntry {
  id: string;
  name: string;
  source: 'env' | 'kibana.dev.yml';
}

function parseEnvVar(envVarName: string): AvailableConnectorEntry[] {
  const raw = process.env[envVarName];
  if (!raw) return [];

  try {
    let parsed: Record<string, { name?: string }>;
    try {
      parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    } catch {
      parsed = JSON.parse(raw);
    }
    return Object.entries(parsed).map(([id, connector]) => ({
      id,
      name: connector?.name ?? id,
      source: 'env' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns connectors from both `KIBANA_TESTING_INFERENCE_ENDPOINTS` (inference endpoints)
 * and `KIBANA_TESTING_AI_CONNECTORS` (stack connectors). Inference endpoints are listed first;
 * duplicates from the stack connector env var are excluded.
 */
export const parseConnectorsFromEnv = (): AvailableConnectorEntry[] => {
  const inferenceEndpoints = parseEnvVar('KIBANA_TESTING_INFERENCE_ENDPOINTS');
  const stackConnectors = parseEnvVar('KIBANA_TESTING_AI_CONNECTORS');

  const seen = new Set(inferenceEndpoints.map((c) => c.id));
  const deduped = stackConnectors.filter((c) => !seen.has(c.id));

  return [...inferenceEndpoints, ...deduped];
};

interface KibanaDevYmlConnector {
  name?: string;
  actionTypeId?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}

export const parseConnectorsFromKibanaDevYml = (repoRoot: string): AvailableConnectorEntry[] => {
  const configPath = Path.join(repoRoot, KIBANA_DEV_YML);
  if (!Fs.existsSync(configPath)) {
    return [];
  }

  try {
    const raw = Fs.readFileSync(configPath, 'utf-8');
    const parsed = parse(raw) as Record<string, unknown> | null;
    if (!parsed) return [];

    const preconfigured = parsed['xpack.actions.preconfigured'] as
      | Record<string, KibanaDevYmlConnector>
      | undefined;
    if (!preconfigured || typeof preconfigured !== 'object') return [];

    return Object.entries(preconfigured).map(([id, connector]) => ({
      id,
      name: connector?.name ?? id,
      source: 'kibana.dev.yml' as const,
    }));
  } catch {
    return [];
  }
};

/**
 * Returns all available connectors, merging from KIBANA_TESTING_INFERENCE_ENDPOINTS,
 * KIBANA_TESTING_AI_CONNECTORS, and kibana.dev.yml. Inference endpoints are listed first;
 * duplicates from other sources are excluded.
 */
export const getAllAvailableConnectors = (repoRoot: string): AvailableConnectorEntry[] => {
  const envConnectors = parseConnectorsFromEnv();
  const ymlConnectors = parseConnectorsFromKibanaDevYml(repoRoot);

  const seen = new Set(envConnectors.map((c) => c.id));
  const deduped = ymlConnectors.filter((c) => !seen.has(c.id));

  return [...envConnectors, ...deduped];
};

export const promptForSuite = async (
  repoRoot: string,
  log: ToolingLog
): Promise<EvalSuiteDefinition> => {
  const suites = resolveEvalSuites(repoRoot, log);

  if (suites.length === 0) {
    throw new Error('No eval suites found. Run `node scripts/evals list --refresh` to discover.');
  }

  if (suites.length === 1) {
    log.info(`Using the only available suite: ${suites[0].id}`);
    return suites[0];
  }

  const { suiteId } = await inquirer.prompt<{ suiteId: string }>({
    type: 'list',
    name: 'suiteId',
    message: 'Select a suite:',
    choices: suites.map((s) => ({
      name: s.name !== s.id ? `${s.id} (${s.name})` : s.id,
      value: s.id,
    })),
  });

  return suites.find((s) => s.id === suiteId)!;
};

const formatConnectorChoice = (c: AvailableConnectorEntry): { name: string; value: string } => {
  const label = c.name !== c.id ? `${c.id} (${c.name})` : c.id;
  const tag = c.source === 'kibana.dev.yml' ? ' [kibana.dev.yml]' : '';
  return { name: `${label}${tag}`, value: c.id };
};

export const promptForConnector = async (
  repoRoot: string,
  log: ToolingLog,
  message = 'Select evaluation connector (judge):'
): Promise<string> => {
  const connectors = getAllAvailableConnectors(repoRoot);

  if (connectors.length === 0) {
    throw new Error(
      'No connectors available. Set KIBANA_TESTING_INFERENCE_ENDPOINTS (inference endpoints) or KIBANA_TESTING_AI_CONNECTORS (stack connectors), or run `node scripts/evals init`.'
    );
  }

  if (connectors.length === 1) {
    log.info(`Using the only available connector: ${connectors[0].id}`);
    return connectors[0].id;
  }

  const { connectorId } = await inquirer.prompt<{ connectorId: string }>({
    type: 'list',
    name: 'connectorId',
    message,
    choices: connectors.map(formatConnectorChoice),
  });

  return connectorId;
};

export const promptForProject = async (
  repoRoot: string,
  log: ToolingLog,
  message = 'Select model(s) to evaluate (the suite runs once per selection):'
): Promise<string[]> => {
  const connectors = getAllAvailableConnectors(repoRoot);

  if (connectors.length === 0) {
    throw new Error(
      'No connectors available. Set KIBANA_TESTING_INFERENCE_ENDPOINTS (inference endpoints) or KIBANA_TESTING_AI_CONNECTORS (stack connectors), or run `node scripts/evals init`.'
    );
  }

  if (connectors.length === 1) {
    log.info(`Using the only available connector project: ${connectors[0].id}`);
    return [connectors[0].id];
  }

  const { selected } = await inquirer.prompt<{ selected: string[] }>({
    type: 'checkbox',
    name: 'selected',
    message,
    choices: connectors.map(formatConnectorChoice),
    validate: (answer: string[]) =>
      answer.length > 0 ? true : 'Select at least one model to evaluate.',
  });

  return selected;
};

export const isTTY = (): boolean => Boolean(process.stdin.isTTY);

/**
 * Reads the first `elasticsearch.hosts` entry from config/kibana.dev.yml,
 * including auth credentials when available.
 * Handles both dot-notation (`elasticsearch.hosts: ...`) and nested YAML
 * (`elasticsearch:\n  hosts: ...`).
 * If no credentials are found, defaults to `elastic:changeme` (yarn es snapshot default).
 */
export const readLocalEsUrl = (repoRoot: string): string | undefined => {
  const configPath = Path.join(repoRoot, KIBANA_DEV_YML);
  if (!Fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const raw = Fs.readFileSync(configPath, 'utf-8');
    const parsed = parse(raw) as Record<string, unknown> | null;
    if (!parsed) return undefined;

    const nested = parsed.elasticsearch as Record<string, unknown> | undefined;

    const hosts =
      (parsed['elasticsearch.hosts'] as string | string[] | undefined) ??
      (nested?.hosts as string | string[] | undefined);

    let host: string | undefined;
    if (Array.isArray(hosts) && hosts.length > 0) {
      host = hosts[0];
    } else if (typeof hosts === 'string') {
      host = hosts;
    }

    if (!host) return undefined;

    const url = new URL(host);
    if (!url.username) {
      const username =
        (parsed['elasticsearch.username'] as string | undefined) ??
        (nested?.username as string | undefined) ??
        'elastic';
      const password =
        (parsed['elasticsearch.password'] as string | undefined) ??
        (nested?.password as string | undefined) ??
        'changeme';
      url.username = username;
      url.password = password;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

const DEFAULT_SERVER_CONFIG_SET = 'evals_tracing';

export const SCOUT_EVALS_ARGS = [
  'start-server',
  '--arch',
  'stateful',
  '--domain',
  'classic',
  '--serverConfigSet',
  DEFAULT_SERVER_CONFIG_SET,
] as const;

export const scoutEvalsArgs = (serverConfigSet?: string): string[] => [
  'start-server',
  '--arch',
  'stateful',
  '--domain',
  'classic',
  '--serverConfigSet',
  serverConfigSet ?? DEFAULT_SERVER_CONFIG_SET,
];
