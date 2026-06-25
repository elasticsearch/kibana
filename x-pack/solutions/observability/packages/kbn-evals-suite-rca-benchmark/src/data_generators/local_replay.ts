/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Local CSV-based eval data loader — no GCS or snapshot infrastructure required.
 *
 * Used by evals/re2ob_local.spec.ts for local development and CI runs that have
 * access to extracted RCAEval CSV files (RCAEVAL_DATA_DIR env var).
 *
 * Production evals use evals/re2ob.spec.ts (GCS snapshots via replaySnapshot).
 */

import { createReadStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { RcaScenario } from '../scenarios/types';

const WINDOW_BEFORE_S = 600;
const WINDOW_AFTER_S = 600;
const TARGET_INJECT_OFFSET_S = 600;
const BATCH_SIZE = 2000;

export interface LocalReplayHandle {
  scenario: RcaScenario;
  logsIndex: string;
  tracesIndex: string;
  metricsIndex: string;
}

function generateOpaqueDataStreamNames(): {
  logsIndex: string;
  tracesIndex: string;
  metricsIndex: string;
} {
  const runId = randomUUID().slice(0, 8);
  return {
    logsIndex: `logs-rcabench-${runId}`,
    tracesIndex: `traces-rcabench-${runId}`,
    metricsIndex: `metrics-rcabench-${runId}`,
  };
}

// Known services in the RE2-OB simple_metrics.csv, longest-prefix-first to avoid
// matching "frontend" before "frontend-external".
const METRICS_SERVICES = [
  'frontend-external',
  'adservice',
  'cartservice',
  'checkoutservice',
  'currencyservice',
  'emailservice',
  'frontend',
  'paymentservice',
  'productcatalogservice',
  'recommendationservice',
  'redis',
  'shippingservice',
];

// Maps simple_metrics column suffix → ES field name
const METRIC_SUFFIX_TO_FIELD: Record<string, string> = {
  cpu: 'system.cpu.pct',
  mem: 'system.memory.bytes',
  diskio: 'system.diskio.bytes',
  socket: 'system.socket.count',
  workload: 'service.request_rate',
  'latency-50': 'service.latency.p50_ms',
  'latency-90': 'service.latency.p90_ms',
  error: 'service.error_rate',
};

interface MetricsColSpec {
  colIndex: number;
  service: string;
  field: string;
}

function parseMetricsHeader(headers: string[]): MetricsColSpec[] {
  const specs: MetricsColSpec[] = [];
  for (let i = 0; i < headers.length; i++) {
    const col = headers[i].trim();
    if (col === 'time') continue;
    for (const svc of METRICS_SERVICES) {
      if (col.startsWith(svc + '_')) {
        const suffix = col.slice(svc.length + 1);
        const field = METRIC_SUFFIX_TO_FIELD[suffix];
        if (field) specs.push({ colIndex: i, service: svc, field });
        break;
      }
    }
  }
  return specs;
}

async function indexMetricsCsv(
  esClient: Client,
  csvPath: string,
  index: string,
  shiftS: number,
  injectTime: number
): Promise<number> {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });

  let specs: MetricsColSpec[] | null = null;
  let timeColIndex = -1;
  let batch: Record<string, unknown>[] = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    total += await bulkIndex(esClient, index, batch);
    batch = [];
  };

  for await (const line of rl) {
    if (!specs) {
      const headers = parseCsvRow(line);
      timeColIndex = headers.findIndex((h) => h.trim() === 'time');
      specs = parseMetricsHeader(headers);
      continue;
    }
    if (!line.trim()) continue;

    const values = parseCsvRow(line);
    const timeS = parseInt(values[timeColIndex] ?? '', 10);
    if (isNaN(timeS)) continue;
    if (timeS < injectTime - WINDOW_BEFORE_S || timeS >= injectTime + WINDOW_AFTER_S) continue;

    const shiftedMs = (timeS + shiftS) * 1000;
    const timestamp = new Date(shiftedMs).toISOString();

    // Group columns by service, emit one doc per service per timestamp
    const byService = new Map<string, Record<string, unknown>>();
    for (const spec of specs) {
      const raw = values[spec.colIndex];
      const val = raw !== undefined && raw !== '' ? parseFloat(raw) : NaN;
      if (isNaN(val)) continue;
      let doc = byService.get(spec.service);
      if (!doc) {
        doc = { '@timestamp': timestamp, 'service.name': spec.service };
        byService.set(spec.service, doc);
      }
      doc[spec.field] = val;
    }

    for (const doc of byService.values()) {
      batch.push(doc);
    }
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return total;
}

export function resolveLocalCaseDir(rcaevalDataDir: string, scenario: RcaScenario): string | null {
  // Standard RE2-OB layout: {dataDir}/RE2-OB/{service}_{faultType}/1
  const standard = join(rcaevalDataDir, 'RE2-OB', `${scenario.service}_${scenario.faultType}`, '1');
  if (existsSync(join(standard, 'logs.csv'))) return standard;

  // Fallback: flat layout used for currencyservice_loss in our local cache
  const flat = join(rcaevalDataDir, `re2ob-${scenario.service}-${scenario.faultType}-1`);
  if (existsSync(join(flat, 'logs.csv'))) return flat;

  return null;
}

async function bulkIndex(
  esClient: Client,
  index: string,
  docs: Record<string, unknown>[]
): Promise<number> {
  const body = docs.flatMap((doc) => [
    JSON.stringify({ create: { _index: index } }),
    JSON.stringify(doc),
  ]);
  const result = await esClient.bulk({ body: body.join('\n') + '\n', refresh: false });
  const failed = result.errors
    ? (result.items ?? []).filter((i: any) => i.create?.error).length
    : 0;
  return docs.length - failed;
}

type RowMapper = (
  row: Record<string, string>,
  shiftS: number,
  injectTime: number
) => Record<string, unknown> | null;

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (true) {
    if (i < line.length && line[i] === '"') {
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
    } else {
      const start = i;
      while (i < line.length && line[i] !== ',') i++;
      fields.push(line.slice(start, i).trim());
    }

    if (i >= line.length) break;
    i++; // skip comma separator
    if (i === line.length) {
      fields.push('');
      break;
    }
  }

  return fields;
}

async function indexCsv(
  esClient: Client,
  csvPath: string,
  index: string,
  rowMapper: RowMapper,
  shiftS: number,
  injectTime: number
): Promise<number> {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });

  let header: string[] | null = null;
  let batch: Record<string, unknown>[] = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    total += await bulkIndex(esClient, index, batch);
    batch = [];
  };

  for await (const line of rl) {
    if (!header) {
      header = parseCsvRow(line);
      continue;
    }
    if (!line.trim()) continue;
    const values = parseCsvRow(line);
    const row = Object.fromEntries(header.map((k, i) => [k.trim(), values[i] ?? '']));
    const doc = rowMapper(row, shiftS, injectTime);
    if (!doc) continue;
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return total;
}

function mapLogRow(
  row: Record<string, string>,
  shiftS: number,
  injectTime: number
): Record<string, unknown> | null {
  const tsNs = parseInt(row.timestamp, 10);
  if (isNaN(tsNs)) return null;
  const tsS = tsNs / 1_000_000_000;
  if (tsS < injectTime - WINDOW_BEFORE_S || tsS >= injectTime + WINDOW_AFTER_S) return null;

  const shiftedNs = BigInt(Math.round(tsNs)) + BigInt(Math.round(shiftS * 1_000_000_000));
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

function mapTraceRow(
  row: Record<string, string>,
  shiftS: number,
  injectTime: number
): Record<string, unknown> | null {
  const startMs = parseInt(row.startTimeMillis, 10);
  if (isNaN(startMs)) return null;
  const startS = startMs / 1000;
  if (startS < injectTime - WINDOW_BEFORE_S || startS >= injectTime + WINDOW_AFTER_S) return null;

  const shiftedMs = startMs + shiftS * 1000;
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

async function createMetricsDataStream(esClient: Client, name: string): Promise<void> {
  await esClient.indices.createDataStream({ name });
}

async function createTracesIndex(esClient: Client, index: string): Promise<void> {
  await esClient.indices.create({
    index,
    mappings: {
      dynamic: true,
      properties: {
        '@timestamp': { type: 'date' },
        service: { properties: { name: { type: 'keyword' } } },
        trace: { properties: { id: { type: 'keyword' } } },
        span: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'keyword' },
            action: { type: 'keyword' },
          },
        },
        parent: { properties: { id: { type: 'keyword' } } },
        event: { properties: { duration: { type: 'long' } } },
        http: {
          properties: {
            response: { properties: { status_code: { type: 'long' } } },
          },
        },
      },
    },
  });
}

export async function indexLocalScenario(
  esClient: Client,
  log: ToolingLog,
  scenario: RcaScenario,
  caseDir: string
): Promise<LocalReplayHandle> {
  const injectTime = parseInt(await readFile(join(caseDir, 'inject_time.txt'), 'utf-8'), 10);
  const shiftS = Date.now() / 1000 - TARGET_INJECT_OFFSET_S - injectTime;

  const { logsIndex, tracesIndex, metricsIndex } = generateOpaqueDataStreamNames();

  log.info(
    `[${scenario.snapshotName}] Indexing — shift +${Math.round(shiftS / 3600)}h, ` +
      `inject → ${new Date((injectTime + shiftS) * 1000).toISOString()}`
  );

  await Promise.all([
    createTracesIndex(esClient, tracesIndex),
    createMetricsDataStream(esClient, metricsIndex),
  ]);

  const [logsIndexed, tracesIndexed, metricsIndexed] = await Promise.all([
    indexCsv(esClient, join(caseDir, 'logs.csv'), logsIndex, mapLogRow, shiftS, injectTime),
    indexCsv(esClient, join(caseDir, 'traces.csv'), tracesIndex, mapTraceRow, shiftS, injectTime),
    indexMetricsCsv(esClient, join(caseDir, 'simple_metrics.csv'), metricsIndex, shiftS, injectTime),
  ]);

  await esClient.indices.refresh({ index: `${logsIndex},${tracesIndex},${metricsIndex}` });

  log.info(
    `[${scenario.snapshotName}] Indexed ${logsIndexed} logs + ${tracesIndexed} traces + ${metricsIndexed} metric docs`
  );

  return { scenario, logsIndex, tracesIndex, metricsIndex };
}

export async function cleanLocalScenario(
  esClient: Client,
  handle: LocalReplayHandle,
  log: ToolingLog
): Promise<void> {
  for (const index of [handle.logsIndex, handle.tracesIndex]) {
    try {
      await esClient.indices.delete({ index, ignore_unavailable: true });
    } catch (err) {
      log.warning(`Cleanup failed for ${index}: ${(err as Error).message}`);
    }
  }
  try {
    await esClient.indices.deleteDataStream({ name: handle.metricsIndex });
  } catch (err) {
    log.warning(`Cleanup failed for data stream ${handle.metricsIndex}: ${(err as Error).message}`);
  }
}
