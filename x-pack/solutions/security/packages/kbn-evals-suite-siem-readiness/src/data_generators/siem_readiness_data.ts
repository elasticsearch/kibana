/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { DataQualityResultDocument } from '@kbn/siem-readiness';

/**
 * Seed data for the SIEM Readiness eval suite — four dimensions:
 *
 * 1. Coverage — four category indices (Endpoint/Identity/Network/Cloud) with correct
 *    event.category values; Application/SaaS intentionally empty → produces a finding.
 *
 * 2. Quality — two DataQualityResultDocument docs: one for the identity index with
 *    incompatibleFieldCount=2 (bad) and one for the endpoint index with 0 (healthy).
 *
 * 3. Continuity — a failing ingest pipeline with a conditional `fail` processor
 *    attached as default_pipeline on a logs-* index; 100 normal docs + 3 fail docs
 *    are indexed so the pipeline's failure rate ≈ 2.9% ≥ 1% threshold → critical finding.
 *    A second healthy pipeline is attached to the network index.
 *
 * 4. Retention — two data streams: one with 180d DSL retention (non-compliant) and one
 *    with 400d (compliant). Both have event.category docs so they appear in category
 *    filtering results.
 *
 * Detection rules are NOT created here. The spec's beforeAll creates them via Kibana HTTP API.
 */

// Randomized prefix ensures each test run uses distinct index names so the agent
// cannot rely on predictable patterns and must derive answers from actual data.
const RANDOM_PREFIX = Math.random().toString(36).substring(2, 8);

export const SIEM_READINESS_INDICES = {
  endpoint: `logs-${RANDOM_PREFIX}-endpoint`,
  identity: `logs-${RANDOM_PREFIX}-identity`,
  network: `logs-${RANDOM_PREFIX}-network`,
  cloud: `logs-${RANDOM_PREFIX}-cloud`,
  continuityBad: `logs-${RANDOM_PREFIX}-continuity-bad`,
} as const;

// Retention data stream names — must match logs-* for DSL to apply
export const RETENTION_SHORT_DS = `logs-siem-readiness-eval-short-${RANDOM_PREFIX}`;
export const RETENTION_LONG_DS = `logs-siem-readiness-eval-long-${RANDOM_PREFIX}`;
const RETENTION_INDEX_TEMPLATE_NAME = `siem-readiness-eval-retention-${RANDOM_PREFIX}`;
const CONTINUITY_BAD_TEMPLATE_NAME = `siem-readiness-eval-continuity-bad-${RANDOM_PREFIX}`;

export const SIEM_READINESS_PIPELINE_NAME = `siem-readiness-eval-fail-${RANDOM_PREFIX}`;
export const SIEM_READINESS_PIPELINE_OK_NAME = `siem-readiness-eval-ok-${RANDOM_PREFIX}`;
export const DATA_QUALITY_INDEX = '.kibana-data-quality-dashboard-results-default';

const EVAL_BATCH_ID = `eval-batch-${RANDOM_PREFIX}`;

const MINUTE = 60_000;
const recentTimestamp = (offsetMinutes: number) =>
  new Date(Date.now() - offsetMinutes * MINUTE).toISOString();

type Doc = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function bulkIndex(esClient: Client, index: string, docs: Doc[]): Promise<void> {
  if (docs.length === 0) return;
  const operations = docs.flatMap((doc) => [{ create: { _index: index } }, doc]);
  const response = await esClient.bulk({ refresh: true, operations });
  if (response.errors) {
    const firstError = response.items.find((item) => {
      const op = Object.values(item)[0];
      return op && 'error' in op && op.error;
    });
    throw new Error(`Bulk indexing into ${index} failed: ${JSON.stringify(firstError, null, 2)}`);
  }
}

// ---------------------------------------------------------------------------
// Dimension 1: Coverage — one index per SIEM main category
// ---------------------------------------------------------------------------

function buildEndpointDocs(): Doc[] {
  return [
    {
      '@timestamp': recentTimestamp(5),
      event: { category: 'process' },
      process: { name: 'bash' },
      host: { name: 'workstation-01' },
    },
    {
      '@timestamp': recentTimestamp(6),
      event: { category: 'process' },
      process: { name: 'sshd' },
      host: { name: 'workstation-02' },
    },
    {
      '@timestamp': recentTimestamp(7),
      event: { category: 'process' },
      process: { name: 'python3' },
      host: { name: 'workstation-03' },
    },
    {
      '@timestamp': recentTimestamp(8),
      event: { category: 'file' },
      file: { name: 'config.yaml', path: '/etc/config.yaml' },
      host: { name: 'workstation-01' },
    },
    {
      '@timestamp': recentTimestamp(9),
      event: { category: 'process' },
      process: { name: 'curl' },
      host: { name: 'workstation-04' },
    },
  ];
}

function buildIdentityDocs(): Doc[] {
  return [
    {
      '@timestamp': recentTimestamp(10),
      event: { category: 'authentication', outcome: 'success' },
      user: { name: 'alice' },
      source: { ip: '10.0.0.1' },
    },
    {
      '@timestamp': recentTimestamp(11),
      event: { category: 'authentication', outcome: 'failure' },
      user: { name: 'bob' },
      source: { ip: '10.0.0.2' },
    },
    {
      '@timestamp': recentTimestamp(12),
      event: { category: 'authentication', outcome: 'success' },
      user: { name: 'carol' },
      source: { ip: '10.0.0.3' },
    },
    {
      '@timestamp': recentTimestamp(13),
      event: { category: 'iam' },
      user: { name: 'admin' },
    },
    {
      '@timestamp': recentTimestamp(14),
      event: { category: 'authentication', outcome: 'success' },
      user: { name: 'dave' },
      source: { ip: '10.0.0.4' },
    },
  ];
}

function buildNetworkDocs(): Doc[] {
  return [
    {
      '@timestamp': recentTimestamp(15),
      event: { category: 'network' },
      source: { ip: '10.0.0.1' },
      destination: { ip: '8.8.8.8' },
      network: { protocol: 'dns' },
    },
    {
      '@timestamp': recentTimestamp(16),
      event: { category: 'network' },
      source: { ip: '10.0.0.2' },
      destination: { ip: '1.1.1.1' },
      network: { protocol: 'https' },
    },
    {
      '@timestamp': recentTimestamp(17),
      event: { category: 'firewall' },
      source: { ip: '192.168.1.50' },
      destination: { ip: '203.0.113.1' },
    },
    {
      '@timestamp': recentTimestamp(18),
      event: { category: 'network' },
      source: { ip: '10.0.0.3' },
      destination: { ip: '172.16.0.5' },
      network: { protocol: 'tcp' },
    },
    {
      '@timestamp': recentTimestamp(19),
      event: { category: 'network' },
      source: { ip: '10.0.0.4' },
      destination: { ip: '8.8.4.4' },
      network: { protocol: 'udp' },
    },
  ];
}

function buildCloudDocs(): Doc[] {
  return [
    {
      '@timestamp': recentTimestamp(20),
      event: { category: 'cloud' },
      cloud: { provider: 'aws', account: { id: '123456789012' } },
    },
    {
      '@timestamp': recentTimestamp(21),
      event: { category: 'cloud' },
      cloud: { provider: 'aws', account: { id: '123456789012' }, region: 'us-east-1' },
    },
    {
      '@timestamp': recentTimestamp(22),
      event: { category: 'configuration' },
      cloud: { provider: 'aws', account: { id: '123456789012' } },
    },
    {
      '@timestamp': recentTimestamp(23),
      event: { category: 'cloud' },
      cloud: { provider: 'gcp', account: { id: 'my-project-id' } },
    },
    {
      '@timestamp': recentTimestamp(24),
      event: { category: 'cloud' },
      cloud: { provider: 'azure', account: { id: 'azure-subscription-001' } },
    },
  ];
}

// ---------------------------------------------------------------------------
// Dimension 2: Quality — DataQualityResultDocument docs
// ---------------------------------------------------------------------------

function buildQualityDoc(
  indexName: string,
  incompatibleFieldCount: number
): DataQualityResultDocument {
  return {
    batchId: EVAL_BATCH_ID,
    indexName,
    isCheckAll: true,
    checkedAt: Date.now(),
    docsCount: 5,
    totalFieldCount: 15,
    ecsFieldCount: 12,
    customFieldCount: incompatibleFieldCount === 0 ? 2 : 0,
    incompatibleFieldCount,
    incompatibleFieldMappingItems: [],
    incompatibleFieldValueItems: [],
    sameFamilyFieldCount: 0,
    sameFamilyFields: [],
    sameFamilyFieldItems: [],
    unallowedMappingFields: [],
    unallowedValueFields: [],
    sizeInBytes: 1024,
    markdownComments: [],
    ecsVersion: '8.11.0',
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Dimension 3: Continuity — failing pipeline + healthy pipeline
// ---------------------------------------------------------------------------

function buildContinuityNormalDocs(): Doc[] {
  const docs: Doc[] = [];
  for (let i = 0; i < 100; i++) {
    docs.push({
      '@timestamp': recentTimestamp(i % 30),
      event: { category: 'network' },
      source: { ip: `10.0.${Math.floor(i / 10)}.${i % 10}` },
      destination: { ip: '8.8.8.8' },
    });
  }
  return docs;
}

function buildContinuityFailDocs(): Doc[] {
  return [
    {
      '@timestamp': recentTimestamp(1),
      event: { category: 'network' },
      source: { ip: '192.168.1.1' },
      fail_me: true,
    },
    {
      '@timestamp': recentTimestamp(2),
      event: { category: 'network' },
      source: { ip: '192.168.1.2' },
      fail_me: true,
    },
    {
      '@timestamp': recentTimestamp(3),
      event: { category: 'network' },
      source: { ip: '192.168.1.3' },
      fail_me: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// Dimension 4: Retention — data stream docs
// ---------------------------------------------------------------------------

function buildRetentionDocs(count: number): Doc[] {
  const docs: Doc[] = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      '@timestamp': recentTimestamp(i * 2),
      event: { category: 'cloud' },
      cloud: { provider: 'aws', account: { id: '123456789012' } },
    });
  }
  return docs;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export const seedSiemReadinessData = async ({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<void> => {
  log.info('[siem-readiness] Seeding SIEM readiness eval data');

  // ------------------------------------------------------------------
  // Dimension 1: Coverage — category indices
  // ------------------------------------------------------------------
  log.info('[siem-readiness] Seeding coverage indices');

  await Promise.all([
    bulkIndex(esClient, SIEM_READINESS_INDICES.endpoint, buildEndpointDocs()),
    bulkIndex(esClient, SIEM_READINESS_INDICES.identity, buildIdentityDocs()),
    bulkIndex(esClient, SIEM_READINESS_INDICES.network, buildNetworkDocs()),
    bulkIndex(esClient, SIEM_READINESS_INDICES.cloud, buildCloudDocs()),
  ]);

  log.info(
    `[siem-readiness] Coverage indices seeded: endpoint, identity, network, cloud ` +
      `(Application/SaaS intentionally empty)`
  );

  // ------------------------------------------------------------------
  // Dimension 2: Quality — data quality check results
  // ------------------------------------------------------------------
  log.info('[siem-readiness] Seeding quality check results');

  // Use esClient.index (not bulk) to trigger auto-creation of the quality index.
  // The quality results index is a data stream — must include @timestamp.
  await esClient.index({
    index: DATA_QUALITY_INDEX,
    refresh: true,
    document: {
      ...buildQualityDoc(SIEM_READINESS_INDICES.identity, 2),
      '@timestamp': recentTimestamp(1),
    },
  });

  await esClient.index({
    index: DATA_QUALITY_INDEX,
    refresh: true,
    document: {
      ...buildQualityDoc(SIEM_READINESS_INDICES.endpoint, 0),
      '@timestamp': recentTimestamp(2),
    },
  });

  log.info(
    `[siem-readiness] Quality docs seeded: identity index (incompatible=2), endpoint index (incompatible=0)`
  );

  // ------------------------------------------------------------------
  // Dimension 3: Continuity — failing + healthy ingest pipelines
  // ------------------------------------------------------------------
  log.info('[siem-readiness] Setting up ingest pipelines');

  // Create the failing pipeline — the `fail` processor fires only when fail_me == true.
  await esClient.ingest.putPipeline({
    id: SIEM_READINESS_PIPELINE_NAME,
    description: 'SIEM readiness eval — deliberate failures for continuity dimension testing',
    processors: [
      {
        fail: {
          message: 'deliberate test failure for siem-readiness evals',
          if: 'ctx?.fail_me == true',
        },
      },
      {
        set: {
          field: 'processed',
          value: true,
        },
      },
    ],
  });

  // Create the healthy pipeline — no failure logic.
  await esClient.ingest.putPipeline({
    id: SIEM_READINESS_PIPELINE_OK_NAME,
    description: 'SIEM readiness eval — healthy pipeline for continuity dimension testing',
    processors: [
      {
        set: {
          field: 'processed',
          value: true,
        },
      },
    ],
  });

  // continuityBad must match logs-* (fetch_pipelines discovers pipelines via logs-* index settings).
  // logs-* matches the Fleet data-stream-only template — indices.create is rejected.
  // Create a dedicated template with default_pipeline set so the backing index has it,
  // then create the data stream explicitly.
  await esClient.indices.putIndexTemplate({
    name: CONTINUITY_BAD_TEMPLATE_NAME,
    index_patterns: [SIEM_READINESS_INDICES.continuityBad],
    data_stream: {},
    priority: 500,
    template: {
      settings: { index: { default_pipeline: SIEM_READINESS_PIPELINE_NAME } },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
        },
      },
    },
  });
  await esClient.indices.createDataStream({ name: SIEM_READINESS_INDICES.continuityBad });

  // Attach the healthy pipeline to the network index as default_pipeline.
  await esClient.indices.putSettings({
    index: SIEM_READINESS_INDICES.network,
    settings: { index: { default_pipeline: SIEM_READINESS_PIPELINE_OK_NAME } },
  });

  // Index 100 normal docs through the failing pipeline — these succeed.
  const normalDocs = buildContinuityNormalDocs();
  const normalOperations = normalDocs.flatMap((doc) => [
    { create: { _index: SIEM_READINESS_INDICES.continuityBad } },
    doc,
  ]);
  await esClient.bulk({
    refresh: true,
    pipeline: SIEM_READINESS_PIPELINE_NAME,
    operations: normalOperations,
  });

  // Index 3 docs with fail_me: true — these trigger the pipeline's fail processor.
  // The pipeline's failed counter increments even though the docs are rejected.
  // We catch errors because bulk will return 500 for the failed items.
  const failDocs = buildContinuityFailDocs();
  const failOperations = failDocs.flatMap((doc) => [
    { create: { _index: SIEM_READINESS_INDICES.continuityBad } },
    doc,
  ]);
  try {
    await esClient.bulk({
      refresh: true,
      pipeline: SIEM_READINESS_PIPELINE_NAME,
      operations: failOperations,
    });
  } catch (err) {
    log.debug(
      `fail-docs bulk rejected as expected (pipeline fail processor fired): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  log.info(
    `[siem-readiness] Continuity pipelines seeded: ` +
      `${SIEM_READINESS_PIPELINE_NAME} (failing, ~3% failure rate), ` +
      `${SIEM_READINESS_PIPELINE_OK_NAME} (healthy)`
  );

  // ------------------------------------------------------------------
  // Dimension 4: Retention — data streams with DSL lifecycle policies
  // ------------------------------------------------------------------
  log.info('[siem-readiness] Setting up retention data streams');

  // Create a dedicated index template so the data streams can be created
  // independently of the Fleet logs-* template (which may not be present in
  // all test cluster configurations).
  await esClient.indices.putIndexTemplate({
    name: RETENTION_INDEX_TEMPLATE_NAME,
    index_patterns: [RETENTION_SHORT_DS, RETENTION_LONG_DS],
    data_stream: {},
    priority: 500,
    template: {
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          event: { properties: { category: { type: 'keyword' } } },
          cloud: { properties: { provider: { type: 'keyword' } } },
        },
      },
    },
  });
  await esClient.indices.createDataStream({ name: RETENTION_SHORT_DS });
  await esClient.indices.createDataStream({ name: RETENTION_LONG_DS });
  await bulkIndex(esClient, RETENTION_SHORT_DS, buildRetentionDocs(5));
  await bulkIndex(esClient, RETENTION_LONG_DS, buildRetentionDocs(5));

  // Apply DSL retention: 180d (non-compliant — below 365d threshold)
  await esClient.indices.putDataLifecycle({
    name: RETENTION_SHORT_DS,
    data_retention: '180d',
  });

  // Apply DSL retention: 400d (compliant — above 365d threshold)
  await esClient.indices.putDataLifecycle({
    name: RETENTION_LONG_DS,
    data_retention: '400d',
  });

  log.info(
    `[siem-readiness] Retention data streams seeded: ` +
      `${RETENTION_SHORT_DS} (180d, non-compliant), ${RETENTION_LONG_DS} (400d, compliant)`
  );

  log.info('[siem-readiness] SIEM readiness eval data seeding complete');
};

// ---------------------------------------------------------------------------
// Cleanup function
// ---------------------------------------------------------------------------

export const cleanupSiemReadinessData = async ({
  esClient,
  log,
}: {
  esClient: Client;
  log: ToolingLog;
}): Promise<void> => {
  log.info('[siem-readiness] Cleaning up SIEM readiness eval data');

  // Delete retention index template
  try {
    await esClient.indices.deleteIndexTemplate({ name: RETENTION_INDEX_TEMPLATE_NAME });
    log.info(`[siem-readiness] Deleted index template ${RETENTION_INDEX_TEMPLATE_NAME}`);
  } catch (error) {
    log.warning(
      `[siem-readiness] Failed to delete index template ${RETENTION_INDEX_TEMPLATE_NAME}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    await esClient.indices.deleteIndexTemplate({ name: CONTINUITY_BAD_TEMPLATE_NAME });
    log.info(`[siem-readiness] Deleted index template ${CONTINUITY_BAD_TEMPLATE_NAME}`);
  } catch (error) {
    log.warning(
      `[siem-readiness] Failed to delete index template ${CONTINUITY_BAD_TEMPLATE_NAME}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Delete retention data streams
  for (const ds of [RETENTION_SHORT_DS, RETENTION_LONG_DS]) {
    try {
      await esClient.indices.deleteDataStream({ name: ds });
      log.info(`[siem-readiness] Deleted data stream ${ds}`);
    } catch (error) {
      log.warning(
        `[siem-readiness] Failed to delete data stream ${ds}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Delete coverage + continuity indices (must happen before pipeline deletion —
  // ES rejects deletePipeline if an index still references it as default_pipeline)
  const categoryIndices = Object.values(SIEM_READINESS_INDICES);
  for (const index of categoryIndices) {
    try {
      await esClient.indices.deleteDataStream({ name: index });
    } catch {
      try {
        await esClient.indices.delete({ index, ignore_unavailable: true });
        log.info(`[siem-readiness] Deleted index ${index}`);
      } catch (error) {
        log.warning(
          `[siem-readiness] Failed to delete index ${index}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  // Delete ingest pipelines — after indices so no index still references them
  for (const pipelineName of [SIEM_READINESS_PIPELINE_NAME, SIEM_READINESS_PIPELINE_OK_NAME]) {
    try {
      await esClient.ingest.deletePipeline({ id: pipelineName });
      log.info(`[siem-readiness] Deleted pipeline ${pipelineName}`);
    } catch (error) {
      log.warning(
        `[siem-readiness] Failed to delete pipeline ${pipelineName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Delete quality result docs by batchId so we don't leave eval artifacts in the
  // shared quality results index.
  try {
    await esClient.deleteByQuery({
      index: DATA_QUALITY_INDEX,
      refresh: true,
      query: {
        term: { batchId: EVAL_BATCH_ID },
      },
    });
    log.info(`[siem-readiness] Deleted quality docs for batchId=${EVAL_BATCH_ID}`);
  } catch (error) {
    log.warning(
      `[siem-readiness] Failed to delete quality docs: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  log.info('[siem-readiness] SIEM readiness eval data cleanup complete');
};
