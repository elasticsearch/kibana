/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  GLOBAL_SPACE_ID,
  THREAT_REPORTS_DATA_STREAM,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';
import { buildReportContent } from '../adapters/text';

/**
 * Domain capability module for the `ingest_report` action.
 *
 * Encapsulates content fingerprinting, deduplication, and the actual write
 * to `.kibana-threat-reports-*`. Called by the internal HTTP route, the
 * Agent Builder tool wrapper, and any future ECLI / workflow consumer.
 */

export interface IngestReportParams {
  title: string;
  body_text: string;
  source_name: string;
  source_url?: string;
  severity?: SeverityLevel;
  language?: string;
}

export type IngestReportResult =
  | {
      status: 'duplicate';
      content_fingerprint: string;
      report_id: string;
      message: string;
    }
  | {
      status: 'ingested';
      content_fingerprint: string;
      report_id: string;
      message: string;
    };

const fingerprint = (text: string): string =>
  createHash('sha256').update(text.trim().normalize('NFKC')).digest('hex');

const severityScore = (severity: SeverityLevel): number => {
  switch (severity) {
    case 'critical':
      return 90;
    case 'high':
      return 70;
    case 'medium':
      return 40;
    case 'low':
    default:
      return 20;
  }
};

export const ingestReport = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  spaceId: string,
  params: IngestReportParams
): Promise<IngestReportResult> => {
  const {
    title,
    body_text: bodyText,
    source_name: sourceName,
    source_url: sourceUrl,
    severity = 'medium',
    language = 'en',
  } = params;

  const fp = fingerprint(`${title}\n${bodyText}`);
  const now = new Date().toISOString();

  // Look up duplicates first to avoid the data stream rejecting the create on
  // primary; the data stream itself doesn't expose op_type:create idiomatically,
  // so we do an explicit precheck.
  // Dedup is scoped to the current space + the global sentinel: the same
  // advisory in another space is *not* a duplicate (per-space isolation),
  // but a global-tagged seed is everyone's canonical copy.
  const existing = await esClient.search({
    index: THREAT_REPORTS_DATA_STREAM,
    size: 1,
    _source: false,
    query: {
      bool: {
        filter: [
          { term: { content_fingerprint: fp } },
          { terms: { space_id: [spaceId, GLOBAL_SPACE_ID] } },
        ],
      },
    },
  });

  const total =
    typeof existing.hits.total === 'number' ? existing.hits.total : existing.hits.total?.value ?? 0;

  if (total > 0) {
    const existingId = existing.hits.hits[0]._id;
    if (!existingId) {
      throw new Error('Duplicate report match returned without an _id.');
    }
    logger.debug(`ingest_report dedup hit fingerprint=${fp} report_id=${existingId}`);
    return {
      status: 'duplicate',
      content_fingerprint: fp,
      report_id: existingId,
      message:
        'Report content already ingested. Returning the canonical document id without writing a new copy.',
    };
  }

  const indexResponse = await esClient.index({
    index: THREAT_REPORTS_DATA_STREAM,
    document: {
      '@timestamp': now,
      content_fingerprint: fp,
      space_id: spaceId,
      source: {
        type: 'manual',
        name: sourceName,
        url: sourceUrl,
        adapter_id: 'manual:analyst-paste',
      },
      content: buildReportContent({ title, bodyText, language }),
      severity: {
        level: severity,
        score: severityScore(severity),
      },
      provenance: {
        ingested_at: now,
        extraction_method: 'pending',
      },
    },
  });

  logger.debug(`ingest_report indexed report_id=${indexResponse._id} fingerprint=${fp}`);

  return {
    status: 'ingested',
    content_fingerprint: fp,
    report_id: indexResponse._id,
    message:
      'Report ingested. Workflow 2 (`nl_extraction_behavioral`) will pick it up on the next run, ' +
      'or invoke `threat_intel.hunt_behavior` directly to extract behaviors now.',
  };
};
