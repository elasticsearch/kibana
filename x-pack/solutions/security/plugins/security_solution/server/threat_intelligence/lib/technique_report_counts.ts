/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Elasticsearch aggregation helpers for ATT&CK technique report counts.
 *
 * `nl_extraction_behavioral` persists technique IDs on nested
 * `extracted.behaviors.technique_id`. The flat `extracted.ttps.techniques`
 * keyword array is denormalized at extraction time for simple terms aggs,
 * but historical reports may only have behaviors — nested + reverse_nested
 * counts parent documents without double-counting duplicate behaviors.
 */

export interface EsTechniqueBehaviorBucket {
  key: string;
  doc_count: number;
  report_count?: { doc_count: number };
}

export interface EsTechniqueTtpBucket {
  key: string;
  doc_count: number;
}

export const buildTechniqueCountsFromBehaviorsAgg = (size: number) => ({
  nested: { path: 'extracted.behaviors' },
  aggs: {
    techniques: {
      terms: { field: 'extracted.behaviors.technique_id', size },
      aggs: {
        report_count: { reverse_nested: {} },
      },
    },
  },
});

export const buildTechniqueCountsFromTtpsAgg = (size: number) => ({
  terms: { field: 'extracted.ttps.techniques', size },
});

/** Nested behaviors agg with per-report severity for `coverage_gap`. */
export const buildTechniqueCountsFromBehaviorsWithSeverityAgg = (
  size: number,
  severityBucketSize: number
) => ({
  nested: { path: 'extracted.behaviors' },
  aggs: {
    techniques: {
      terms: { field: 'extracted.behaviors.technique_id', size },
      aggs: {
        report_count: { reverse_nested: {} },
        severity_on_reports: {
          reverse_nested: {},
          aggs: {
            severity_max: {
              terms: { field: 'severity.level', size: severityBucketSize },
            },
          },
        },
      },
    },
  },
});

export const buildTechniqueCountsFromTtpsWithSeverityAgg = (
  size: number,
  severityBucketSize: number
) => ({
  terms: { field: 'extracted.ttps.techniques', size },
  aggs: {
    severity_max: {
      terms: { field: 'severity.level', size: severityBucketSize },
    },
  },
});

export const parseTechniqueCountsFromBehaviors = (
  buckets: EsTechniqueBehaviorBucket[]
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const bucket of buckets) {
    if (bucket.key) {
      counts.set(bucket.key, bucket.report_count?.doc_count ?? 0);
    }
  }
  return counts;
};

export const parseTechniqueCountsFromTtps = (
  buckets: EsTechniqueTtpBucket[]
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const bucket of buckets) {
    if (bucket.key) {
      counts.set(bucket.key, bucket.doc_count);
    }
  }
  return counts;
};

/**
 * Merges counts from nested behaviors and flat `extracted.ttps.techniques`.
 * Uses the higher per-technique count so overlapping reports (both fields
 * populated) are not double-counted, while ttps-only legacy rows still appear.
 */
export const mergeTechniqueReportCounts = (
  fromBehaviors: Map<string, number>,
  fromTtps: Map<string, number>
): Map<string, number> => {
  const merged = new Map<string, number>(fromTtps);
  for (const [techniqueId, count] of fromBehaviors) {
    merged.set(techniqueId, Math.max(merged.get(techniqueId) ?? 0, count));
  }
  return merged;
};

export const topTechniqueBuckets = (
  merged: Map<string, number>,
  size: number
): Array<{ technique_id: string; report_count: number }> =>
  [...merged.entries()]
    .map(([technique_id, report_count]) => ({ technique_id, report_count }))
    .sort((a, b) => b.report_count - a.report_count)
    .slice(0, size);
