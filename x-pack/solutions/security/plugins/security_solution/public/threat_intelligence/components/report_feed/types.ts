/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel, ThreatCategory } from '../../../../common/threat_intelligence/hub';

/**
 * Normalized report row for the shared card grid (Intelligence Hub +
 * Agent Builder `threat-intel-report-table` attachment).
 */
export interface ThreatReportFeedItem {
  reportId: string;
  title: string;
  sourceName: string;
  sourceUrl?: string;
  severity: SeverityLevel;
  /** ISO-8601 publish / ingest time for relative timestamps. */
  publishedAt?: string;
  categories: ThreatCategory[];
  environmentHitsTotal?: number;
  techniques?: string[];
  iocCount?: number;
  relatedReportCount?: number;
}
