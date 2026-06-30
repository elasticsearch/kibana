/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { trim } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { EntityType } from '@kbn/entity-store/common';
import type { AnomalySummaryEntry } from '../../../../../common/api/entity_analytics';
import type { TableRow } from './types';
import {
  anomalyToDisplayDetails,
  formatAnomalousValue,
  formatSeconds,
  formatValueBasedOnFieldName,
  getComparatorForDetectorFunction,
} from '../../../../../common/entity_analytics/anomalies';

const buildComparisonPhrase = (entry: AnomalySummaryEntry): string => {
  const { detectorFunction: fn } = entry;
  if (fn === 'time_of_day' || fn === 'time_of_week' || fn === 'rare') return '';

  const observed = entry.actual[0] ?? 0;
  const expected = entry.typical[0] ?? 0;
  if (expected === 0) return '';

  if (fn.startsWith('high') && observed > expected) {
    return i18n.translate(
      'xpack.securitySolution.entityAnalytics.anomalies.comparisonPhraseGreaterDetail',
      {
        defaultMessage: ', which is {ratio}× greater than baseline',
        values: { ratio: (observed / expected).toFixed(1) },
      }
    );
  }
  if (fn.startsWith('low') && observed < expected && observed > 0) {
    return i18n.translate(
      'xpack.securitySolution.entityAnalytics.anomalies.comparisonPhraseLessDetail',
      {
        defaultMessage: ', which is {ratio}× less than baseline',
        values: { ratio: (expected / observed).toFixed(1) },
      }
    );
  }
  return '';
};

export const buildDescription = (
  entityType: EntityType,
  entry: AnomalySummaryEntry,
  detectorDescription?: string
): string => {
  const { observedHeader, expectedSubtitle } = anomalyToDisplayDetails(entityType, entry);
  const base = trim([observedHeader, expectedSubtitle].filter(Boolean).join(' ')) || '—';
  const comparison = buildComparisonPhrase(entry);
  const detail = base === '—' ? base : `${base}${comparison}`;
  const prefix = detectorDescription?.replace(/\.$/, '');
  return prefix ? `${prefix}: ${detail}` : detail;
};

interface BaselineAndAnomaly {
  baseline: string;
  anomaly: string;
}

const formatBaseline = (entry: AnomalySummaryEntry): string => {
  const { detectorFunction: fn, baselineValues, fieldName } = entry;
  if (!baselineValues?.length) return '—';

  if (fn === 'rare') return baselineValues.join(', ');

  if (fn === 'time_of_day' || fn === 'time_of_week') {
    return formatSeconds(baselineValues.join(', '), fn === 'time_of_week');
  }

  const fmt = (v: string) => {
    const num = parseFloat(v);
    return Number.isFinite(num) ? formatValueBasedOnFieldName(fn, fieldName, num) : v;
  };
  const comparator = getComparatorForDetectorFunction(fn);
  return `${comparator}${baselineValues.map(fmt).join(', ')}`;
};

export const formatBaselineAndAnomaly = (entry: AnomalySummaryEntry): BaselineAndAnomaly => {
  const anomaly = formatAnomalousValue({
    detectorFunction: entry.detectorFunction,
    fieldName: entry.fieldName,
    actual: entry.actual,
    byFieldValue: entry.byFieldValue ?? undefined,
  });
  return { anomaly, baseline: formatBaseline(entry) };
};

const getKeyFields = (entry: AnomalySummaryEntry): string[] => {
  const pairs: Array<[string | null, string | null]> = [
    [entry.byFieldName, entry.byFieldValue],
    [entry.overFieldName, entry.overFieldValue],
    [entry.partitionFieldName, entry.partitionFieldValue],
  ];
  return pairs
    .filter((pair): pair is [string, string] => pair[0] != null && pair[1] != null)
    .map(([name, value]) => `${name}=${value}`);
};

export const mapSummaryToRow = (
  entityType: EntityType,
  entry: AnomalySummaryEntry,
  index: number,
  detectorDescription?: string
): TableRow => {
  const { baseline, anomaly } = formatBaselineAndAnomaly(entry);
  const description = buildDescription(entityType, entry, detectorDescription);

  return {
    id: `${entry.jobId}-${entry.timestamp}-${index}`,
    jobId: entry.jobId,
    jobDisplayName: entry.jobName ?? entry.jobId,
    mitreTactics: entry.threatTactics ?? [],
    timestamp: new Date(entry.timestamp).getTime(),
    detectorIndex: entry.detectorIndex,
    baseline,
    anomaly,
    anomalyScore: entry.recordScore,
    description,
    anomalyCount:
      entry.anomalousValueCount ??
      (entry.anomalousValue != null ? parseFloat(entry.anomalousValue) || 0 : 0),
    keyFields: getKeyFields(entry),
  };
};
