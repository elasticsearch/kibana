/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel } from '../../../common/threat_intelligence/hub';

/**
 * Default severity for adapter-emitted reports.
 *
 * Matches the legacy YAML which hard-coded `medium` / `40` for every
 * branch. Real per-adapter severity classification (CVSS for NVD,
 * STIX confidence, vendor-specific scoring) is out of scope until the
 * `nl_extraction_behavioral` workflow lands its severity refinement
 * pass; until then, `medium` is the safe default — it doesn't fire
 * digests' `high+` filters and it doesn't hide rows in the dashboard's
 * `>= medium` default view.
 */
export const DEFAULT_SEVERITY_LEVEL: SeverityLevel = 'medium';
export const DEFAULT_SEVERITY_SCORE = 40;

/** Mirror of `services/ingest_report.ts:severityScore` so manual and adapter ingestion agree. */
export const severityScore = (level: SeverityLevel): number => {
  switch (level) {
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
