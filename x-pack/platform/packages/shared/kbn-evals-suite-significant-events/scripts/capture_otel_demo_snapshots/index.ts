/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { Client } from '@elastic/elasticsearch';
import moment from 'moment';
import {
  patchScenarios,
  getDemoScenarios,
  listAvailableDemos,
  deployDemo,
  teardownDemo,
  ensureMinikubeRunning,
} from '@kbn/otel-demo';
import type { DemoType, FailureScenario } from '@kbn/otel-demo';
import {
  GCS_BUCKET,
  BASELINE_WAIT_MS,
  FAILURE_WAIT_MS,
  HEALTHY_BASELINE_SCENARIO,
  DEFAULT_LOGS_INDEX,
  DEFAULT_DEMO_APP,
  KI_FEATURE_EXTRACTION_TIMEOUT_MS,
} from '../lib/constants';
import { getConnectionConfig, type ConnectionConfig } from '../lib/get_connection_config';
import { createSnapshot, generateGcsBasePath, registerGcsRepository } from '../lib/gcs';
import { sleep } from '../lib/sleep';
import {
  cleanupSigEventsExtractedKIsData,
  configureModelSelectionSettings,
  disableStreams,
  enableLogsNativeStream,
  enableSignificantEvents,
  logSigEventsExtractedKIFeatures,
  persistSigEventsExtractedKIsForSnapshot,
  triggerSigEventsKIFeatureExtraction,
  waitForSigEventsKIFeatureExtraction,
} from '../lib/significant_events_workflow';
import type { Scenario } from '../lib/types';

run(
  async ({ log, flags }) => {
    const config = await getConnectionConfig(flags, log);
    const esClient = new Client({
      node: config.esUrl,
      auth: { username: config.username, password: config.password },
    });

    const logsIndex = String(flags['logs-index'] || DEFAULT_LOGS_INDEX);

    const connectorId = String(flags['connector-id'] || '');
    const runId = String(flags['run-id'] || moment().format('YYYY-MM-DD'));

    const scenariosToRun = flags.scenario
      ? (Array.isArray(flags.scenario) ? flags.scenario : [flags.scenario]).map(String)
      : [];

    const dryRun = Boolean(flags['dry-run']);

    if (!connectorId) {
      throw new Error(
        'Required: --connector-id <id>\n' +
          'Provide the ID of an LLM connector for feature extraction ' +
          '(e.g.: "bedrock-opus-46").\n' +
          'This connector must be preconfigured in your kibana.dev.yml.'
      );
    }

    // Validate --demo-app
    const demoType = String(flags['demo-app'] || DEFAULT_DEMO_APP);
    const availableDemos = listAvailableDemos();
    if (!availableDemos.includes(demoType as DemoType)) {
      throw new Error(
        `Invalid --demo-app "${demoType}". Valid values: ${availableDemos.join(', ')}`
      );
    }

    const baselineWaitMs = parseDurationFlag(
      flags['baseline-wait'],
      'baseline-wait',
      BASELINE_WAIT_MS
    );
    const failureWaitMs = parseDurationFlag(flags['failure-wait'], 'failure-wait', FAILURE_WAIT_MS);
    const extractionTimeoutMs = parseDurationFlag(
      flags['extraction-timeout'],
      'extraction-timeout',
      KI_FEATURE_EXTRACTION_TIMEOUT_MS
    );

    const failureScenarios = getDemoScenarios(demoType as DemoType);
    const allScenarios: Scenario[] = [HEALTHY_BASELINE_SCENARIO, ...failureScenarios];

    const selectedScenarios =
      scenariosToRun.length > 0
        ? allScenarios.filter((s) => scenariosToRun.includes(s.id))
        : [...allScenarios];

    if (selectedScenarios.length === 0) {
      throw new Error(
        `No matching scenarios. Available: ${allScenarios.map((s) => s.id).join(', ')}`
      );
    }

    const basePath = generateGcsBasePath({ runId, appNamespace: demoType });
    log.info(`Creating ${selectedScenarios.length} snapshot(s) → GCS ${GCS_BUCKET}/${basePath}`);
    log.info(`Run ID: ${runId}`);
    log.info(`Demo app: ${demoType}`);
    log.info(`LLM connector: ${connectorId}`);
    log.info(`Elasticsearch: ${config.esUrl} | Kibana: ${config.kibanaUrl}`);

    if (dryRun) {
      log.info('');
      log.info('DRY RUN - would process these scenarios:');
      for (const s of selectedScenarios) {
        log.info(`  - gs://${GCS_BUCKET}/${basePath}/ → ${s.id}`);
      }
      return;
    }

    log.info('');
    log.info('Checking minikube...');
    await ensureMinikubeRunning(log);

    log.info('');
    log.info('Registering GCS snapshot repository...');
    await registerGcsRepository(esClient, log, runId, demoType);

    for (const scenario of selectedScenarios) {
      await processScenario(
        scenario,
        config,
        connectorId,
        runId,
        esClient,
        log,
        demoType as DemoType,
        baselineWaitMs,
        failureWaitMs,
        logsIndex,
        extractionTimeoutMs
      );
    }

    log.info('');
    log.info('='.repeat(70));
    log.info('ALL SNAPSHOTS CREATED SUCCESSFULLY');
    log.info('='.repeat(70));
    log.info('');
    log.info(`Run ID: ${runId}`);
    log.info(`GCS path: gs://${GCS_BUCKET}/${basePath}/`);
    log.info('');
    log.info('Snapshots:');
    for (const s of selectedScenarios) {
      log.info(`  ${s.id}`);
    }
    log.info('');
    log.info('Each snapshot contains:');
    log.info('  logs*                        - OTel Demo log data');
    log.info('  sigevents-streams-features-* - Extracted features (inferred + computed)');
    log.info('');
    log.info(`To use in evals, update SIGEVENTS_SNAPSHOT_RUN in replay.ts to "${runId}"`);
  },
  {
    description: `
      Automates creation of demo app snapshots for Significant Events evaluations.

      For each scenario the script:
        1. Deploys the demo app on minikube
        2. Waits for baseline traffic
        3. Optionally patches a failure scenario and waits
        4. Enables streams and triggers LLM feature extraction
        5. Snapshots logs + extracted features to GCS
        6. Cleans up and tears down the demo

      Prerequisites:
        - minikube running  (minikube start --cpus=4 --memory=8g)
        - Local Elasticsearch with GCS credentials in keystore:
            yarn es snapshot --license trial \\
              --secure-files gcs.client.default.credentials_file=/path/to/creds.json
        - Local Kibana running with a preconfigured LLM connector

      Example:
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --scenario healthy-baseline
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --run-id 2026-02-19
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --dry-run
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --demo-app online-boutique
    `,
    flags: {
      string: [
        'es-url',
        'kibana-url',
        'es-username',
        'es-password',
        'connector-id',
        'scenario',
        'run-id',
        'demo-app',
        'baseline-wait',
        'failure-wait',
        'extraction-timeout',
        'logs-index',
      ],
      boolean: ['dry-run'],
      help: `
        --logs-index       Logs index to use (default: logs)
        --connector-id     (required) LLM connector ID for feature extraction (e.g.: bedrock-opus-46)
        --run-id           Run identifier used as GCS subfolder (default: today's date in format YYYY-MM-DD)
        --scenario         Process only specific scenario(s) - can be repeated. Omit for all.
        --dry-run          Print what would happen without executing
        --demo-app         Demo app to use (default: otel-demo). Must be a registered demo type.
        --baseline-wait    Duration to wait for baseline traffic, e.g. 3m, 90s, 1h (default: 3m)
        --failure-wait     Duration to wait after applying failure scenario, e.g. 15m, 300s (default: 5m)
        --extraction-timeout  Max duration to wait for KI feature extraction, e.g. 15m, 30m (default: 15m)
        --es-url           Elasticsearch URL (default: from kibana.dev.yml)
        --kibana-url       Kibana URL (default: from kibana.dev.yml, with basePath)
        --es-username      ES username (default: from kibana.dev.yml)
        --es-password      ES password (default: from kibana.dev.yml)
      `,
    },
  }
);

const isFailureScenario = (scenario: Scenario): scenario is FailureScenario =>
  'category' in scenario;

async function processScenario(
  scenario: Scenario,
  config: ConnectionConfig,
  connectorId: string,
  runId: string,
  esClient: Client,
  log: ToolingLog,
  demoType: DemoType,
  baselineWaitMs: number,
  failureWaitMs: number,
  logsIndex: string = DEFAULT_LOGS_INDEX,
  extractionTimeoutMs: number = KI_FEATURE_EXTRACTION_TIMEOUT_MS
): Promise<void> {
  const isFailure = isFailureScenario(scenario);

  log.info('');
  log.info('='.repeat(70));
  log.info(`SCENARIO: ${scenario.id}${isFailure ? ' (failure)' : ' (baseline)'}`);
  log.info('='.repeat(70));

  // Step 1 — Enable the ES native "logs" stream so that its index template
  // exists before the OTel pods start writing. Must happen before deployDemo.
  log.info('[1/8] Enabling ES native logs stream...');
  await enableLogsNativeStream(esClient, log, logsIndex);

  try {
    // Step 2 — Deploy the demo app. deployDemo internally enables Kibana
    // Streams (wired definitions, pipelines) and waits for pods to be ready.
    log.info('[2/8] Deploying demo app...');
    await deployDemo({ demoType, log, logsIndex });
    log.info('[2/8] Deployment complete');

    // Step 3 — Configure significant events and the connector. Must run after
    // deployDemo (Step 2) which enables Kibana Streams and its settings APIs.
    log.info('[3/8] Configuring significant events...');
    await enableSignificantEvents(config, log);
    await configureModelSelectionSettings(config, log, connectorId);

    // Step 4 — Accumulate baseline traffic
    log.info('[4/8] Accumulating baseline traffic...');
    await sleep(baselineWaitMs, log, 'baseline traffic');

    // Step 5 — Apply failure (if applicable)
    if (isFailure) {
      log.info(`[5/8] Applying failure scenario "${scenario.id}"...`);
      await patchScenarios({ demoType, scenarioIds: [scenario.id], log });

      log.info('[5/8] Accumulating failure data...');
      await sleep(failureWaitMs, log, 'failure data');
    } else {
      log.info('[5/8] Skipped failure data accumulation (healthy baseline)');
    }

    // Step 6 — Run feature extraction
    log.info('[6/8] Running feature extraction...');
    await triggerSigEventsKIFeatureExtraction(config, log, logsIndex);
    await waitForSigEventsKIFeatureExtraction(config, log, logsIndex, extractionTimeoutMs);
    await logSigEventsExtractedKIFeatures(config, log, logsIndex);
    await persistSigEventsExtractedKIsForSnapshot(config, esClient, log, scenario.id, logsIndex);

    // Step 7 — Create a snapshot of the logs and extracted features
    log.info('[7/8] Creating GCS snapshot...');
    await createSnapshot({ esClient, log, snapshotName: scenario.id, runId });
  } finally {
    log.info('[8/8] Cleaning up...');
    await disableStreams(config, log).catch((e) => log.error(`disableStreams failed: ${e}`));
    await cleanupSigEventsExtractedKIsData(esClient, log).catch((e) =>
      log.error(`cleanupSigEventsExtractedKIsData failed: ${e}`)
    );
    await teardownDemo({ demoType, log }).catch((e) => log.error(`teardownDemo failed: ${e}`));
  }

  log.info(`Scenario "${scenario.id}" — done`);
}

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

const parseDurationFlag = (
  raw: string | string[] | boolean | undefined,
  flagName: string,
  defaultMs: number
): number => {
  if (!raw) return defaultMs;

  const value = String(raw);

  const match = value.match(DURATION_RE);
  if (!match) {
    throw new Error(`--${flagName} must be a duration like "3m", "90s", "1h". Got: "${value}"`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as moment.unitOfTime.DurationConstructor;
  return moment.duration(amount, unit).asMilliseconds();
};
