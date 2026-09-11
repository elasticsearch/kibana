/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { SEVERITY_LEVELS, THREAT_CATEGORIES, type SeverityLevel } from '../constants';

export const FIND_THREAT_REPORTS_DEFAULT_PAGE_SIZE = 20;
export const FIND_THREAT_REPORTS_MAX_PAGE_SIZE = 100;

export const THREAT_REPORT_SORTS = ['relevance', 'rank', 'updated_at'] as const;
export type ThreatReportSort = (typeof THREAT_REPORT_SORTS)[number];

export type ReadinessStatus = 'ready' | 'degraded' | 'blocked';

/** Compact IOC projection returned on find summaries. */
export interface ThreatReportIocSummary {
  type: string;
  value: string;
}

/** Optional Diamond projection on find summaries. */
export interface ThreatReportDiamondSummary {
  signalCount?: number;
  suitable?: boolean;
}

/**
 * Usable-bar summary for find results: identity, revision, title/body, IOCs,
 * severity, and optional Diamond.
 */
export interface ThreatReportSummary {
  reportId: string;
  revision: number;
  title?: string;
  bodyText?: string;
  severity?: {
    level: SeverityLevel | string;
    score?: number;
  };
  iocs: ThreatReportIocSummary[];
  diamond?: ThreatReportDiamondSummary;
}

export interface FindThreatReportsResponse {
  items: ThreatReportSummary[];
  nextCursor?: string | null;
}

export interface GetThreatReportResponse {
  reportId: string;
  revision: number;
  [field: string]: unknown;
}

export interface ReadinessResponse {
  status: ReadinessStatus;
  reasonCodes: string[];
  lastIngestAt?: string | null;
  lastEnrichAt?: string | null;
  usableReportCount: number;
  optional?: string[];
}

const stringOrStringArray = (maxLength: number, maxSize: number) =>
  schema.maybe(
    schema.oneOf([
      schema.string({ maxLength }),
      schema.arrayOf(schema.string({ maxLength }), { maxSize }),
    ])
  );

/**
 * GET `/internal/threat_intel/reports` query schema.
 * Repeated query params (`severity`, `category`) may arrive as a string or array.
 */
export const findThreatReportsQuerySchema = schema.object({
  cursor: schema.maybe(schema.string({ maxLength: 2048 })),
  pageSize: schema.maybe(schema.number({ min: 1, max: FIND_THREAT_REPORTS_MAX_PAGE_SIZE })),
  source: schema.maybe(schema.string({ maxLength: 256 })),
  severity: stringOrStringArray(32, SEVERITY_LEVELS.length),
  category: stringOrStringArray(64, THREAT_CATEGORIES.length),
  from: schema.maybe(schema.string({ maxLength: 64 })),
  to: schema.maybe(schema.string({ maxLength: 64 })),
  usableOnly: schema.maybe(schema.boolean()),
  sort: schema.maybe(
    schema.string({
      maxLength: 32,
      validate: (value) =>
        (THREAT_REPORT_SORTS as readonly string[]).includes(value)
          ? undefined
          : `must be one of: ${THREAT_REPORT_SORTS.join(', ')}`,
    })
  ),
});

export interface FindThreatReportsQuery {
  cursor?: string;
  pageSize?: number;
  source?: string;
  severity?: string | string[];
  category?: string | string[];
  from?: string;
  to?: string;
  usableOnly?: boolean;
  sort?: ThreatReportSort;
}
