/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import { Client } from '@elastic/elasticsearch';
import type { Discovery, Feature } from '@kbn/significant-events-schema';
import {
  SIGEVENTS_SNAPSHOT_RUN,
  replaySignificantEventsSnapshot,
  listAvailableSnapshots,
  loadKIFeaturesFromSnapshot,
  loadKnowledgeIndicatorsFromSnapshot,
  loadDiscoveriesFromSnapshot,
  loadDetectionsFromSnapshot,
} from '../../src/data_generators/replay';
import type { GcsConfig } from '../../src/data_generators/replay';
import { getAllDatasetIds, getDatasetById } from '../../src/datasets';
import { readKibanaConfig } from '../lib/kibana';

const MANAGED_STREAM_SEARCH_PATTERN = 'logs*';

/**
 * A feature as stored in the raw KI index: flat envelope fields plus the domain feature payload
 * nested under `feature` (see `toStoredFeature`). Reshaped via {@link toFeature} for display.
 */
interface StoredKiFeature {
  id?: string;
  title?: string;
  description?: string;
  evidence?: string[];
  feature?: {
    type?: Feature['type'];
    subtype?: Feature['subtype'];
    properties?: Feature['properties'];
    confidence?: Feature['confidence'];
    filter?: Feature['filter'];
  };
}

const toFeature = (ki: StoredKiFeature): Feature =>
  ({
    id: ki.id,
    type: ki.feature?.type,
    subtype: ki.feature?.subtype,
    title: ki.title,
    description: ki.description,
    properties: ki.feature?.properties,
    confidence: ki.feature?.confidence,
    evidence: ki.evidence,
    filter: ki.feature?.filter,
  } as Feature);

const formatFeature = (feature: Feature): string[] => {
  const lines: string[] = [];
  lines.push(`  [${feature.type}${feature.subtype ? `/${feature.subtype}` : ''}] ${feature.id}`);
  if (feature.title) lines.push(`    title: ${feature.title}`);
  if (feature.description) lines.push(`    description: ${feature.description.slice(0, 200)}`);
  if (feature.properties) lines.push(`    properties: ${JSON.stringify(feature.properties)}`);
  if (feature.confidence != null) lines.push(`    confidence: ${feature.confidence}`);
  if (feature.evidence?.length) {
    lines.push(`    evidence (${feature.evidence.length}):`);
    for (const e of feature.evidence.slice(0, 5)) {
      lines.push(`      - ${e}`);
    }
    if (feature.evidence.length > 5) {
      lines.push(`      ... and ${feature.evidence.length - 5} more`);
    }
  }
  if (feature.filter) {
    lines.push(`    filter: ${JSON.stringify(feature.filter)}`);
  }
  return lines;
};

const formatDiscovery = (discovery: Discovery): string[] => {
  const lines: string[] = [];
  lines.push(
    `  [${discovery.kind}] ${discovery.discovery_slug} — ${discovery.title ?? '(untitled)'}`
  );
  lines.push(`    summary: ${discovery.summary}`);
  lines.push(`    root cause: ${discovery.root_cause}`);

  if (discovery.evidences?.length) {
    lines.push(`    evidence (${discovery.evidences.length}):`);
    for (const e of discovery.evidences.slice(0, 5)) {
      lines.push(`      - rule: ${e.rule_name} `);
      lines.push(`      - query: ${e.esql_query}`);
      lines.push(`      - description: ${e.description}`);
      lines.push(`      - result: ${e.result}`);
    }
    if (discovery.evidences.length > 5) {
      lines.push(`      ... and ${discovery.evidences.length - 5} more`);
    }
  }

  if (discovery.cause_kis?.length) {
    lines.push(`    cause kis: (${discovery.cause_kis.length}):`);
    for (const ki of discovery.cause_kis.slice(0, 5)) {
      lines.push(`      - ${ki.name}`);
    }
  }

  if (discovery.dependency_edges?.length) {
    lines.push(`    dependency edges: (${discovery.dependency_edges.length}):`);
    for (const edge of discovery.dependency_edges.slice(0, 5)) {
      lines.push(`      - ${edge.source} -> ${edge.target}: ${edge.exposure}`);
    }
  }

  return lines;
};

run(
  async ({ log, flags }) => {
    const datasetIds = getAllDatasetIds();
    const datasetId = String(flags.dataset || datasetIds[0]);

    if (datasetId === 'list') {
      log.info(`Registered datasets: ${datasetIds.join(', ')}`);
      return;
    }

    const datasetConfig = getDatasetById(datasetId);
    if (!datasetConfig) {
      throw new Error(
        `Unknown dataset "${datasetId}". Registered: ${datasetIds.join(', ')}.\n` +
          'Use --dataset list to see available datasets.'
      );
    }

    const scenario = String(flags.scenario || '');
    if (!scenario) {
      throw new Error(
        'Required: --scenario <name>\n' +
          'Example: --scenario healthy-baseline\n' +
          'Use --scenario list to see available snapshots.'
      );
    }

    const kibanaConfig = readKibanaConfig(log);
    const { elasticsearch } = kibanaConfig;

    const esUrl = String(
      flags['es-url'] ||
        (Array.isArray(elasticsearch.hosts) ? elasticsearch.hosts[0] : elasticsearch.hosts)
    );
    const username = String(flags['es-username'] || elasticsearch.username);
    const password = String(flags['es-password'] || elasticsearch.password);

    const esClient = new Client({
      node: esUrl,
      auth: { username, password },
    });

    const gcs: GcsConfig = datasetConfig.gcs;

    log.info(`Run: ${SIGEVENTS_SNAPSHOT_RUN} | ES: ${esUrl}`);
    log.info(`Dataset: ${datasetConfig.id} — ${datasetConfig.description}`);
    log.info(`GCS: ${gcs.bucket}/${SIGEVENTS_SNAPSHOT_RUN}/${gcs.basePathPrefix}`);

    const available = await listAvailableSnapshots(esClient, log, gcs);

    if (scenario === 'list') {
      log.info(`Available snapshots: ${available.join(', ')}`);
      return;
    }

    if (!available.includes(scenario)) {
      throw new Error(
        `Snapshot "${scenario}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}". ` +
          `Available: ${available.join(', ')}`
      );
    }

    log.info(`Scenario: ${scenario}`);
    log.info('');

    log.info('Step 1/3 — Replaying log data (same path as ki_feature_extraction eval spec)...');
    await replaySignificantEventsSnapshot(esClient, log, scenario, gcs);
    await esClient.indices.refresh({ index: MANAGED_STREAM_SEARCH_PATTERN });

    log.info('');
    log.info(
      'Step 2/3 — Loading snapshot artifacts (features, queries, discoveries, detections)...'
    );
    log.info('Each loader returns [] when its index is absent (e.g. features-only snapshots).');
    const streamName = String(flags['stream-name'] || 'logs');
    const knowledgeIndicators = await loadKnowledgeIndicatorsFromSnapshot(
      esClient,
      log,
      scenario,
      gcs
    );
    const queries = knowledgeIndicators.filter(
      (ki): ki is { id?: string; query?: { rule_id?: string } } =>
        (ki as { type?: string }).type === 'query'
    );

    // Prefer the dedicated (retro-compat) features index; older snapshots only have it there.
    // Newer snapshots also carry features inside the raw KI index — fall back to those, reshaping
    // the stored KI doc (flat id/title/description/evidence + nested feature.{type,subtype,...})
    // back into the flat `Feature` shape `formatFeature` expects.
    let features = await loadKIFeaturesFromSnapshot(esClient, log, scenario, gcs, streamName);
    if (features.length === 0) {
      features = knowledgeIndicators
        .filter(
          (ki) =>
            (ki as { type?: string }).type === 'feature' &&
            (ki as StoredKiFeature).feature?.type != null
        )
        .map((ki) => toFeature(ki as StoredKiFeature));
    }
    const discoveries = await loadDiscoveriesFromSnapshot(esClient, log, scenario, gcs);
    const detections = await loadDetectionsFromSnapshot(esClient, log, scenario, gcs);

    log.info('');
    log.info('Step 3/3 — Data summary');
    log.info('='.repeat(70));

    const countResult = await esClient.count({ index: MANAGED_STREAM_SEARCH_PATTERN });
    log.info(`Total documents in "${MANAGED_STREAM_SEARCH_PATTERN}": ${countResult.count}`);

    const serviceField = String(flags['service-field'] || 'resource.attributes.app.keyword');

    const appAgg = await esClient.search({
      index: MANAGED_STREAM_SEARCH_PATTERN,
      size: 0,
      aggs: {
        apps: { terms: { field: serviceField, size: 50 } },
      },
    });

    interface TermsBucket {
      key: string;
      doc_count: number;
    }
    const appBuckets = (appAgg.aggregations?.apps as { buckets: TermsBucket[] })?.buckets ?? [];

    log.info(`\nApps/services by "${serviceField}" (${appBuckets.length}):`);
    for (const bucket of appBuckets) {
      log.info(`  ${bucket.key}: ${bucket.doc_count} docs`);
    }

    log.info(`\nSnapshot KI features (${features.length}):`);
    if (features.length > 0) {
      for (const feature of features) {
        for (const line of formatFeature(feature)) {
          log.info(line);
        }
      }
    } else {
      log.info('  (none found in snapshot)');
    }

    log.info(`\nSnapshot KI queries (${queries.length}):`);
    if (queries.length > 0) {
      for (const query of queries) {
        log.info(`  rule_id: ${query.query?.rule_id ?? '(none)'} (id: ${query.id ?? '(none)'})`);
      }
    } else {
      log.info('  (none — snapshot taken without query onboarding)');
    }

    log.info(`\nSnapshot discoveries (${discoveries.length}):`);
    if (discoveries.length > 0) {
      for (const discovery of discoveries) {
        for (const line of formatDiscovery(discovery)) {
          log.info(line);
        }
      }
    } else {
      log.info('  (none — snapshot taken without --discovery)');
    }

    log.info(`\nSnapshot detections (${detections.length}):`);
    if (detections.length > 0) {
      for (const detection of detections) {
        log.info(`  [${detection.kind}] ${detection.rule_name} (${detection.rule_uuid})`);
      }
    } else {
      log.info('  (none — snapshot taken without --discovery)');
    }

    log.info('');
    log.info('='.repeat(70));
    log.info('REPLAY COMPLETE');
    log.info('='.repeat(70));
    log.info('');
    log.info('Log data is available at index pattern "logs*"');
    log.info('Query examples:');
    log.info(`  curl -s -u ${username}:*** "${esUrl}/logs*/_search?size=1&pretty"`);
    log.info(
      `  curl -s -u ${username}:*** "${esUrl}/logs*/_search?pretty" -H 'Content-Type: application/json' -d '{"size":5,"query":{"term":{"resource.attributes.app":"frontend"}}}'`
    );
    log.info('');
    log.info(`Available scenarios: ${available.join(', ')}`);
  },
  {
    description: `
      Replay a SigEvents eval snapshot into a local ES cluster, matching
      the exact replay path used by the evaluation specs.

      This script uses the same functions as the eval specs:
        - replaySignificantEventsSnapshot (ki_feature_extraction path)
        - loadKIFeaturesFromSnapshot (ki_query_generation path)
        - loadKnowledgeIndicatorsFromSnapshot / loadDiscoveriesFromSnapshot /
          loadDetectionsFromSnapshot (discovery investigator/judge paths)

      Query, discovery, and detection artifacts are only present when the
      snapshot was captured with query onboarding / --discovery; otherwise
      those loaders report zero documents.

      Use this to inspect snapshot data when refining evaluation criteria
      and expected ground truth for any dataset (otel-demo, bank-of-anthos,
      quarkus-super-heroes, etc.).

      The --run-id flag (or SIGEVENTS_SNAPSHOT_RUN env var) must be set
      BEFORE this script loads. Pass --run-id via the CLI or set the env
      var directly:

        node scripts/replay_sigevents_eval_snapshot.js \\
          --run-id 2026-03-27 --dataset otel-demo --scenario healthy-baseline

        node scripts/replay_sigevents_eval_snapshot.js \\
          --run-id 2026-03-31 --dataset bank-of-anthos --scenario healthy-baseline

      To list registered datasets:

        node scripts/replay_sigevents_eval_snapshot.js --dataset list

      To list available snapshots for a dataset and run:

        node scripts/replay_sigevents_eval_snapshot.js \\
          --run-id 2026-03-27 --dataset otel-demo --scenario list
    `,
    flags: {
      string: [
        'es-url',
        'es-username',
        'es-password',
        'scenario',
        'stream-name',
        'run-id',
        'dataset',
        'service-field',
      ],
      help: `
        --dataset          Dataset id to replay from, or "list" to list registered datasets (default: first registered)
        --scenario         (required) Scenario name to replay, or "list" to list available snapshots
        --run-id           Snapshot run ID (default: SIGEVENTS_SNAPSHOT_RUN env var or 2026-02-25)
        --stream-name      Stream name to filter KI features by (default: logs)
        --service-field    ES keyword field for the app/service breakdown aggregation (default: resource.attributes.app.keyword)
        --es-url           Elasticsearch URL (default: from kibana.dev.yml)
        --es-username      ES username (default: from kibana.dev.yml)
        --es-password      ES password (default: from kibana.dev.yml)
      `,
    },
  }
);
