/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { metrics, ValueType } from '@opentelemetry/api';

const SCOPE = 'kibana.entity_store';

// Meter scope — sets scope.name in the OTLP document.
// Metric names passed to create*() are fully-qualified (not auto-prefixed by the meter name).
const meter = metrics.getMeter(SCOPE);

const m = (name: string) => `${SCOPE}.${name}`;

// TODO: add explicit bucket boundaries (advice.explicitBucketBoundaries) to all histograms
// once real data is available to inform the right distribution ranges.

export const entityStoreMetrics = {
  // --- Extraction task ---

  extractionTaskSuccess: meter.createCounter(m('extraction.task.success'), {
    description: 'Extraction task completed successfully',
    unit: '{task}',
    valueType: ValueType.INT,
  }),

  extractionTaskError: meter.createCounter(m('extraction.task.error'), {
    description: 'Unhandled exception escaping the extraction task run',
    unit: '{task}',
    valueType: ValueType.INT,
  }),

  extractionTaskAborted: meter.createCounter(m('extraction.task.aborted'), {
    description: 'Task cancelled via abort signal before the extraction loop completed',
    unit: '{task}',
    valueType: ValueType.INT,
  }),

  // --- Sub-window loop (runMainPath) ---

  extractionLogsCapApplied: meter.createCounter(m('extraction.logs_cap.applied'), {
    description:
      'Volume cap (maxLogsPerWindow) reached mid-window. drop = remaining logs permanently skipped. defer = cursor held, resumes next run',
    unit: '{event}',
    valueType: ValueType.INT,
  }),

  extractionLogsProcessed: meter.createHistogram(m('extraction.logs.processed'), {
    description: 'Total raw log documents processed per task run across all sub-windows',
    unit: '{document}',
    valueType: ValueType.INT,
  }),

  // --- Slice + entity-page loops (runMainExtractionLoop / ingestEntityPagesWithinCurrentLogPage) ---

  extractionLogsPerPageDropped: meter.createCounter(m('extraction.logs_per_page.dropped'), {
    description:
      'Logs at a single timestamp exceeded maxLogsPerPage; docs beyond the page limit are permanently dropped to avoid an infinite loop',
    unit: '{event}',
    valueType: ValueType.INT,
  }),

  extractionEntitiesUpserted: meter.createCounter(m('extraction.entities.upserted'), {
    description:
      'Entity documents upserted into the latest index per entity page (new + updates, not distinguished)',
    unit: '{document}',
    valueType: ValueType.INT,
  }),

  extractionBulkDropped: meter.createCounter(m('extraction.bulk.dropped'), {
    description:
      'Entity documents rejected by the ES bulk API during ingest (mapping error, version conflict, etc.)',
    unit: '{document}',
    valueType: ValueType.INT,
  }),

  extractionQueryDurationMs: meter.createHistogram(m('extraction.query.duration_ms'), {
    description:
      'Duration of each bounded extraction ESQL query (one per entity page within a log slice)',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }),

  extractionIngestDurationMs: meter.createHistogram(m('extraction.ingest.duration_ms'), {
    description: 'Duration of each ingestEntities bulk write call',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }),

  extractionProbeQueryDurationMs: meter.createHistogram(m('extraction.probe_query.duration_ms'), {
    description:
      'Duration of each probe ESQL query that finds the cursor boundary of the next log slice',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }),

  // --- History snapshot (history_snapshot_client.ts) ---

  historySnapshotSuccess: meter.createCounter(m('history_snapshot.success'), {
    description: 'History snapshot completed successfully',
    unit: '{task}',
    valueType: ValueType.INT,
  }),

  historySnapshotDocCount: meter.createHistogram(m('history_snapshot.doc_count'), {
    description: 'Entities copied from the latest index into the snapshot index per run',
    unit: '{document}',
    valueType: ValueType.INT,
  }),

  historySnapshotReindexDurationMs: meter.createHistogram(
    m('history_snapshot.reindex.duration_ms'),
    {
      description: 'Duration of the async reindex from latest to snapshot index',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }
  ),

  historySnapshotResetDurationMs: meter.createHistogram(m('history_snapshot.reset.duration_ms'), {
    description: 'Duration of the updateByQuery that resets entity fields after snapshot',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
  }),
};
