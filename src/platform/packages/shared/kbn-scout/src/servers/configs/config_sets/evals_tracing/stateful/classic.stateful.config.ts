/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';

const EIS_QA_URL = 'https://inference.eu-west-1.aws.svc.qa.elastic.cloud';

interface AvailableConnector {
  name: string;
  actionTypeId: string;
  exposeConfig?: boolean;
  config: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}

function getPreconfiguredEisConnectorsArg(): string | undefined {
  const raw = process.env.KIBANA_TESTING_AI_CONNECTORS;
  if (!raw) return;

  let connectors: Record<string, AvailableConnector>;
  try {
    connectors = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<
      string,
      AvailableConnector
    >;
  } catch (e) {
    throw new Error(
      `Failed to parse base64 JSON from KIBANA_TESTING_AI_CONNECTORS: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  const eisConnectors: Record<string, AvailableConnector> = {};
  for (const [id, connector] of Object.entries(connectors)) {
    if (!connector || typeof connector !== 'object') continue;
    if (connector.actionTypeId !== '.inference') continue;
    if (connector.config?.provider !== 'elastic') continue;
    // Preconfigured connectors do not expose `config` unless `exposeConfig: true` is set.
    // The inference plugin relies on `.inference` connector config (taskType, inferenceId, ...)
    // to validate compatibility.
    eisConnectors[id] = { ...connector, exposeConfig: true };
  }

  if (Object.keys(eisConnectors).length === 0) return;

  return `--xpack.actions.preconfigured=${JSON.stringify(eisConnectors)}`;
}

const preconfiguredEisConnectorsArg = getPreconfiguredEisConnectorsArg();

const gcsCredentials = process.env.GCS_CREDENTIALS;
let gcsSecureFile: string | undefined;

if (gcsCredentials) {
  const gcsCredentialsFilePath = join(
    tmpdir(),
    `gcs-credentials-${Date.now()}-${process.pid}.json`
  );
  writeFileSync(gcsCredentialsFilePath, gcsCredentials);
  gcsSecureFile = `gcs.client.default.credentials_file=${gcsCredentialsFilePath}`;
  process.on('exit', () => {
    try {
      unlinkSync(gcsCredentialsFilePath);
    } catch {
      // Ignore errors if file was already deleted
    }
  });
}
const defaultExporters = JSON.stringify([
  {
    http: {
      url: 'http://localhost:4318/v1/traces',
    },
  },
  {
    phoenix: {
      base_url: 'http://localhost:6006',
      public_url: 'http://localhost:6006',
      project_name: 'kibana-evals',
    },
  },
]);

// When TRACING_EXPORTERS is set (e.g. in CI), use it instead of the localhost defaults.
const { TRACING_EXPORTERS: tracingExporters } = process.env;
if (tracingExporters) {
  JSON.parse(tracingExporters); // validate parseable JSON; throws early if malformed
}
const isCi = Boolean(process.env.CI);
const shouldEnableTracing = Boolean(tracingExporters) || !isCi;
const exporters = tracingExporters ?? defaultExporters;

/**
 * Custom Scout stateful server configuration that enables OTLP trace exporting
 * from Kibana to a local OpenTelemetry collector (e.g. `node scripts/edot_collector.js`).
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_tracing
 */
export const servers: ScoutServerConfig = {
  ...defaultConfig,
  esTestCluster: {
    ...defaultConfig.esTestCluster,
    secureFiles: [...(gcsSecureFile ? [gcsSecureFile] : [])],
    serverArgs: [
      ...defaultConfig.esTestCluster.serverArgs,
      `xpack.inference.elastic.url=${EIS_QA_URL}`,
    ],
  },
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    env: {
      ...defaultConfig.kbnTestServer.env,
      ...(shouldEnableTracing
        ? {
            ELASTIC_APM_ACTIVE: 'false',
            ELASTIC_APM_CONTEXT_PROPAGATION_ONLY: 'false',
          }
        : {}),
    },
    serverArgs: [
      ...defaultConfig.kbnTestServer.serverArgs,
      '--xpack.evals.enabled=true',
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'dexAiSkillFindRules',
        'investigateRuleSkill',
      ])}`,
      ...(preconfiguredEisConnectorsArg ? [preconfiguredEisConnectorsArg] : []),
      ...(shouldEnableTracing
        ? [
            '--elastic.apm.active=false',
            '--elastic.apm.contextPropagationOnly=false',
            '--telemetry.enabled=true',
            '--telemetry.tracing.enabled=true',
            '--telemetry.tracing.sample_rate=1',
            `--telemetry.tracing.exporters=${exporters}`,
          ]
        : []),
    ],
  },
};
