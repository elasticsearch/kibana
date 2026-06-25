/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Captures a GCS snapshot from a local RCAEval case directory.
 *
 * Workflow:
 *   1. Parse metadata from case directory path (service, fault type, inject_time)
 *   2. Index logs.csv + traces.csv into Elasticsearch, shifting timestamps to "now-10min"
 *   3. Snapshot the resulting data streams to GCS
 *   4. Clean up the indexed data
 *
 * Prerequisites:
 *   - Elasticsearch running with GCS credentials in keystore:
 *       yarn es snapshot --license trial \
 *         --secure-files gcs.client.default.credentials_file=/path/to/gcs-creds.json
 *   - The GCS bucket "rca-bench-datasets" must exist and the credentials must have write access
 *
 * Usage:
 *   node scripts/capture_rcabench_snapshot.js \
 *     --case-dir /path/to/RE2-OB/currencyservice_loss/1
 *
 * The snapshot name is derived from the case directory: {service}-{fault_type}
 * (e.g., "currencyservice-loss"). Multiple instances of the same fault are averaged
 * into a single snapshot; run this for each instance and the first one wins.
 */

import { createReadStream } from 'fs';
import { readFile, access } from 'fs/promises';
import { createInterface } from 'readline';
import { basename, dirname, join } from 'path';
import { run } from '@kbn/dev-cli-runner';
import { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { GCS_BUCKET, RE2OB_GCS_BASE_PATH } from '../../src/scenarios/constants';

const WINDOW_BEFORE_S = 600;
const WINDOW_AFTER_S = 600;
const TARGET_INJECT_OFFSET_S = 600;
const BATCH_SIZE = 2000;

interface CaseMeta {
  service: string;
  faultType: string;
  snapshotName: string;
  logsDataStream: string;
  tracesDataStream: string;
}

function parseCaseMeta(caseDir: string): CaseMeta {
  const faultDirName = basename(dirname(caseDir));
  const lastUnderscore = faultDirName.lastIndexOf('_');
  const service = faultDirName.slice(0, lastUnderscore);
  const faultType = faultDirName.slice(lastUnderscore + 1);
  const snapshotName = `${service}-${faultType}`;
  return {
    service,
    faultType,
    snapshotName,
    logsDataStream: `logs-rca-bench-re2ob-${snapshotName}`,
    tracesDataStream: `traces-rca-bench-re2ob-${snapshotName}`,
  };
}

async function assertFileExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

async function bulkIndex(
  esClient: Client,
  dataStream: string,
  docs: Record<string, unknown>[]
): Promise<{ indexed: number; failed: number }> {
  const ndjson =
    docs
      .flatMap((doc) => [JSON.stringify({ create: { _index: dataStream } }), JSON.stringify(doc)])
      .join('\n') + '\n';

  const result = await esClient.bulk({ body: ndjson, refresh: false });
  const failed = result.errors ? (result.items ?? []).filter((i) => i.create?.error).length : 0;
  return { indexed: docs.length - failed, failed };
}

type RowToDoc = (
  row: Record<string, string>,
  shiftSeconds: number,
  injectTime: number
) => Record<string, unknown> | null;

async function indexCsv(
  esClient: Client,
  log: ToolingLog,
  csvPath: string,
  dataStream: string,
  rowToDoc: RowToDoc,
  shiftSeconds: number,
  injectTime: number
): Promise<{ indexed: number; skipped: number }> {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });

  let header: string[] | null = null;
  let batch: Record<string, unknown>[] = [];
  let totalIndexed = 0;
  let totalSkipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const { indexed } = await bulkIndex(esClient, dataStream, batch);
    totalIndexed += indexed;
    batch = [];
  };

  for await (const line of rl) {
    if (!header) {
      header = line.split(',');
      continue;
    }
    if (!line.trim()) continue;

    const values = line.split(',');
    const row = Object.fromEntries(header.map((k, i) => [k.trim(), (values[i] ?? '').trim()]));

    const doc = rowToDoc(row, shiftSeconds, injectTime);
    if (!doc) {
      totalSkipped++;
      continue;
    }

    batch.push(doc);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  log.info(`  ${dataStream}: ${totalIndexed} indexed, ${totalSkipped} out-of-window`);
  return { indexed: totalIndexed, skipped: totalSkipped };
}

function logRowToDoc(
  row: Record<string, string>,
  shiftSeconds: number,
  injectTime: number
): Record<string, unknown> | null {
  const tsNs = parseInt(row.timestamp, 10);
  if (isNaN(tsNs)) return null;
  const tsSeconds = tsNs / 1_000_000_000;

  if (tsSeconds < injectTime - WINDOW_BEFORE_S || tsSeconds >= injectTime + WINDOW_AFTER_S) {
    return null;
  }

  const shiftedNs = BigInt(Math.round(tsNs)) + BigInt(Math.round(shiftSeconds * 1_000_000_000));
  const shiftedMs = Number(shiftedNs / 1_000_000n);

  const doc: Record<string, unknown> = {
    '@timestamp': new Date(shiftedMs).toISOString(),
    'service.name': row.container_name || undefined,
    message: row.message || undefined,
    'log.level': row.level || undefined,
  };
  if (row.req_path) doc['http.url.path'] = row.req_path;
  if (row.error) doc['error.message'] = row.error;
  if (row.log_template) doc['rcaeval.log_template'] = row.log_template;
  return doc;
}

function traceRowToDoc(
  row: Record<string, string>,
  shiftSeconds: number,
  injectTime: number
): Record<string, unknown> | null {
  const startMs = parseInt(row.startTimeMillis, 10);
  if (isNaN(startMs)) return null;
  const startSeconds = startMs / 1000;

  if (startSeconds < injectTime - WINDOW_BEFORE_S || startSeconds >= injectTime + WINDOW_AFTER_S) {
    return null;
  }

  const shiftedMs = startMs + shiftSeconds * 1000;
  const durationNs = parseFloat(row.duration) || 0;

  const doc: Record<string, unknown> = {
    '@timestamp': new Date(shiftedMs).toISOString(),
    'service.name': row.serviceName || undefined,
    'trace.id': row.traceID || undefined,
    'span.id': row.spanID || undefined,
    'span.name': row.operationName || undefined,
    'event.duration': Math.round(durationNs * 1000),
  };
  if (row.methodName) doc['span.action'] = row.methodName;
  if (row.parentSpanID) doc['parent.id'] = row.parentSpanID;
  const status = parseFloat(row.statusCode);
  if (!isNaN(status) && status > 0) doc['http.response.status_code'] = Math.round(status);
  return doc;
}

async function deleteDataStreams(
  esClient: Client,
  log: ToolingLog,
  ...dataStreams: string[]
): Promise<void> {
  for (const ds of dataStreams) {
    try {
      await esClient.indices.deleteDataStream({ name: ds });
    } catch {
      log.debug(`Could not delete ${ds} (may not exist)`);
    }
  }
}

run(
  async ({ log, flags }) => {
    const caseDir = String(flags['case-dir'] || '');
    if (!caseDir) {
      throw new Error(
        'Required: --case-dir <path>\n' +
          'Point at a RCAEval case instance directory, e.g.:\n' +
          '  --case-dir /data/RE2-OB/currencyservice_loss/1'
      );
    }

    const esUrl = String(flags['es-url'] || 'http://localhost:9200');
    const esUsername = String(flags['es-username'] || 'elastic');
    const esPassword = String(flags['es-password'] || 'changeme');
    const gcsBucket = String(flags['gcs-bucket'] || GCS_BUCKET);
    const gcsBasePath = String(flags['gcs-base-path'] || RE2OB_GCS_BASE_PATH);
    const skipCleanup = Boolean(flags['skip-cleanup']);

    const meta = parseCaseMeta(caseDir);
    log.info(`Service:        ${meta.service}`);
    log.info(`Fault type:     ${meta.faultType}`);
    log.info(`Snapshot name:  ${meta.snapshotName}`);
    log.info(`GCS target:     gs://${gcsBucket}/${gcsBasePath}/${meta.snapshotName}`);
    log.info(`ES:             ${esUrl}`);
    log.info('');

    const logsPath = join(caseDir, 'logs.csv');
    const tracesPath = join(caseDir, 'traces.csv');
    const injectTimePath = join(caseDir, 'inject_time.txt');

    await assertFileExists(logsPath);
    await assertFileExists(tracesPath);
    await assertFileExists(injectTimePath);

    const injectTime = parseInt(await readFile(injectTimePath, 'utf-8'), 10);
    if (isNaN(injectTime)) throw new Error(`Invalid inject_time.txt in ${caseDir}`);

    const nowSeconds = Date.now() / 1000;
    const shiftSeconds = nowSeconds - TARGET_INJECT_OFFSET_S - injectTime;
    log.info(
      `Time shift: +${Math.round(shiftSeconds / 3600 / 24)}d ` +
        `${Math.round((shiftSeconds % 86400) / 3600)}h`
    );
    log.info('');

    const esClient = new Client({
      node: esUrl,
      auth: { username: esUsername, password: esPassword },
    });

    log.info('[1/3] Indexing data into Elasticsearch...');
    await deleteDataStreams(esClient, log, meta.logsDataStream, meta.tracesDataStream);

    await indexCsv(
      esClient,
      log,
      logsPath,
      meta.logsDataStream,
      logRowToDoc,
      shiftSeconds,
      injectTime
    );
    await indexCsv(
      esClient,
      log,
      tracesPath,
      meta.tracesDataStream,
      traceRowToDoc,
      shiftSeconds,
      injectTime
    );

    await esClient.indices.refresh({
      index: `${meta.logsDataStream},${meta.tracesDataStream}`,
    });

    log.info('');
    log.info('[2/3] Creating GCS snapshot...');

    const repoName = `rca-bench-capture-${Date.now()}`;
    await esClient.snapshot.createRepository({
      name: repoName,
      repository: {
        type: 'gcs',
        settings: { bucket: gcsBucket, base_path: gcsBasePath },
      },
    });

    try {
      await esClient.snapshot.create({
        repository: repoName,
        snapshot: meta.snapshotName,
        wait_for_completion: true,
        indices: `${meta.logsDataStream},${meta.tracesDataStream}`,
        include_global_state: false,
      });
      log.info(
        `Snapshot "${meta.snapshotName}" created at gs://${gcsBucket}/${gcsBasePath}/${meta.snapshotName}`
      );
    } finally {
      await esClient.snapshot.deleteRepository({ name: repoName }).catch(() => {});
    }

    if (!skipCleanup) {
      log.info('');
      log.info('[3/3] Cleaning up indexed data...');
      await deleteDataStreams(esClient, log, meta.logsDataStream, meta.tracesDataStream);
    }

    log.info('');
    log.info('Done. Add this scenario to src/scenarios/re2ob_scenarios.ts if not already present:');
    log.info(`  scenario('${meta.service}', '${meta.faultType}'),`);
  },
  {
    description: `
      Captures a GCS snapshot from a local RCAEval case directory.

      Reads logs.csv + traces.csv, indexes them into Elasticsearch with timestamps
      shifted to "now-10min", snapshots to GCS, then cleans up.

      Prerequisites:
        - ES running with GCS credentials in keystore:
            yarn es snapshot --license trial \\
              --secure-files gcs.client.default.credentials_file=/path/to/creds.json
        - GCS bucket "${GCS_BUCKET}" exists with write access

      Example:
        node scripts/capture_rcabench_re2ob_snapshot.js \\
          --case-dir /data/RE2-OB/currencyservice_loss/1
    `,
    flags: {
      string: ['case-dir', 'es-url', 'es-username', 'es-password', 'gcs-bucket', 'gcs-base-path'],
      boolean: ['skip-cleanup'],
      help: `
        --case-dir      (required) Path to RCAEval case instance directory
        --es-url        Elasticsearch URL (default: http://localhost:9200)
        --es-username   ES username (default: elastic)
        --es-password   ES password (default: changeme)
        --gcs-bucket    GCS bucket name (default: ${GCS_BUCKET})
        --gcs-base-path GCS base path (default: ${RE2OB_GCS_BASE_PATH})
        --skip-cleanup  Leave indexed data in ES after snapshot
      `,
    },
  }
);
