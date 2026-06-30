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
import { KIsOnboardingStep } from '@kbn/significant-events-schema';
import {
  GCS_BUCKET,
  BASELINE_WAIT_MS,
  FAILURE_WAIT_MS,
  HEALTHY_BASELINE_SCENARIO,
  DEFAULT_LOGS_INDEX,
  DEFAULT_DEMO_APP,
  KI_FEATURE_EXTRACTION_TIMEOUT_MS,
  DISCOVERY_WAIT_MS,
} from '../lib/constants';
import { getConnectionConfig, type ConnectionConfig } from '../lib/get_connection_config';
import { createSnapshot, generateGcsBasePath, registerGcsRepository } from '../lib/gcs';
import { captureDiscoveryForScenario } from '../lib/capture_discovery';
import { sleep } from '../lib/sleep';
import {
  cleanupExtractedData,
  configureModelSelectionSettings,
  disableStreams,
  enableLogsNativeStream,
  enableSignificantEvents,
  logExtractedKIFeatures,
  persistKIFeaturesForSnapshot,
  persistKnowledgeIndicatorsForSnapshot,
  triggerKIExtraction,
  waitForKIExtraction,
} from '../lib/significant_events_workflow';
import type { Scenario } from '../lib/types';
import {
  FEATURES_TEMP_INDEX_PATTERN,
  KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN,
  DISCOVERIES_TEMP_INDEX_PATTERN,
  DETECTIONS_TEMP_INDEX_PATTERN,
} from '../../src/data_generators/snapshot_indices';
import { parseDurationFlag } from '../lib/snapshot_utils';

run(
  async ({ log, flags }) => {
    const config = await getConnectionConfig(flags, log);
    const esClient = new Client({
      node: config.esUrl,
      auth: { username: config.username, password: config.password },
    });

    const logsIndex = String(flags['logs-index'] || DEFAULT_LOGS_INDEX);

    const withDiscovery = Boolean(flags['with-discovery']);
    const discoveryWaitMs = parseDurationFlag(
      flags['discovery-wait'],
      'discovery-wait',
      DISCOVERY_WAIT_MS
    );

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

    const onboardingSteps = [
      KIsOnboardingStep.FeaturesIdentification,
      ...(withDiscovery ? [KIsOnboardingStep.QueriesGeneration] : []),
    ];

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
        extractionTimeoutMs,
        withDiscovery,
        discoveryWaitMs,
        onboardingSteps
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
    log.info(`  ${FEATURES_TEMP_INDEX_PATTERN} - Extracted KI features (inferred + computed)`);

    log.info(`  ${KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN} - Extracted Knowledge Indicators`);

    if (withDiscovery) {
      log.info(`  ${DISCOVERIES_TEMP_INDEX_PATTERN} - Discovery workflow discoveries`);
      log.info(`  ${DETECTIONS_TEMP_INDEX_PATTERN} - Discovery workflow detections`);
    }
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
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --with-discovery --discovery-wait 10m
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
        'discovery-wait',
        'extraction-timeout',
        'logs-index',
      ],
      boolean: ['dry-run', 'with-discovery'],
      help: `
        --logs-index       Logs index to use (default: logs)
        --connector-id     (required) LLM connector ID for feature extraction (e.g.: bedrock-opus-46)
        --run-id           Run identifier used as GCS subfolder (default: today's date in format YYYY-MM-DD)
        --scenario         Process only specific scenario(s) - can be repeated. Omit for all.
        --dry-run          Print what would happen without executing
        --with-discovery   Also run the discovery workflow and fold its discoveries + detections into the snapshot. Adds query-KI onboarding (features onboarding always runs); query KIs are what discovery resolves to ES|QL. Omit to skip discovery (features-only snapshot).
        --discovery-wait   Duration to let data accumulate before triggering discovery, e.g. 10m, 300s (default: 5m). Only applies with --with-discovery.
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
  extractionTimeoutMs: number = KI_FEATURE_EXTRACTION_TIMEOUT_MS,
  withDiscovery: boolean = false,
  discoveryWaitMs: number = DISCOVERY_WAIT_MS,
  onboardingSteps: KIsOnboardingStep[] = [KIsOnboardingStep.FeaturesIdentification]
): Promise<void> {
  const isFailure = isFailureScenario(scenario);

  const snapshotIndices: string[] = ['logs*'];

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

    // Step 6 — Run KI onboarding (persists features for the snapshot)
    log.info(`[6/8] Running KI onboarding (${onboardingSteps.join(', ')})...`);
    await triggerKIExtraction(config, log, logsIndex, onboardingSteps);
    await waitForKIExtraction(config, log, logsIndex, extractionTimeoutMs);
    await logExtractedKIFeatures(config, log, logsIndex);
    const featuresResult = await persistKIFeaturesForSnapshot(
      config,
      esClient,
      log,
      scenario.id,
      logsIndex
    );
    log.info(`[6/8] Persisted ${featuresResult.count} feature KI(s)`);
    snapshotIndices.push(featuresResult.index);

    log.info('[6/8] Persisting knowledge indicators for snapshot...');
    const knowledgeIndicatorsResult = await persistKnowledgeIndicatorsForSnapshot(
      config,
      esClient,
      log,
      scenario.id,
      logsIndex
    );
    log.info(`[6/8] Persisted ${knowledgeIndicatorsResult.count} knowledge indicators`);
    snapshotIndices.push(knowledgeIndicatorsResult.index);

    if (withDiscovery) {
      // Let data accumulate after feature extraction so the discovery workflow's detection
      // step has signal to analyze before we trigger it.
      if (discoveryWaitMs > 0) {
        log.info('[6a/8] Waiting for data to accumulate before discovery...');
        await sleep(discoveryWaitMs, log, 'pre-discovery data');
      }

      log.info('[6b/8] Running discovery workflow...');
      const discoveryResult = await captureDiscoveryForScenario({
        config,
        esClient,
        log,
        connectorId,
        scenarioId: scenario.id,
      });
      log.info(
        `[6b/8] Captured ${discoveryResult.discoveriesCount} discovery(s), ` +
          `${discoveryResult.detectionsCount} detection(s)`
      );
      snapshotIndices.push(discoveryResult.discoveriesIndex, discoveryResult.detectionsIndex);
    }

    // Step 7 — Create a single snapshot of the logs, features, and (if run) discovery output
    log.info('[7/8] Creating GCS snapshot...');

    await createSnapshot({
      esClient,
      log,
      snapshotName: scenario.id,
      runId,
      indices: snapshotIndices.join(','),
    });
  } finally {
    log.info('[8/8] Cleaning up...');
    await disableStreams(config, log).catch((e) => log.error(`disableStreams failed: ${e}`));
    await cleanupExtractedData(esClient, log).catch((e) =>
      log.error(`cleanupSigEventsExtractedData failed: ${e}`)
    );
    await teardownDemo({ demoType, log }).catch((e) => log.error(`teardownDemo failed: ${e}`));
  }

  log.info(`Scenario "${scenario.id}" — done`);
}
