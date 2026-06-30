/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { first, trim } from 'lodash';
import moment from 'moment';
import type { EntityType } from '@kbn/entity-store/common';
import type { AnomalySummaryEntry } from '../../api/entity_analytics';

export const SECONDS_PER_DAY = 86400;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const ENTROPY_FIELD_NAMES = new Set([
  'powershell.file.script_block_text',
  'dns.question.name',
  'process.command_line_entropy',
]);

const GEO_BY_FIELD_NAMES = new Set([
  'source.geo.region_name',
  'source.geo.city_name',
  'source.geo.country_iso_code',
  'client.geo.region_name',
]);

export const BYTES_FIELD_NAMES = new Set(['source.bytes', 'destination.bytes', 'file.size']);

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
};

export const formatDuration = (ms: number): string => {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${ms} ms`;
};

export const toHumanReadableFieldName = (fieldName: string): string => {
  if (ENTROPY_FIELD_NAMES.has(fieldName)) return 'content';

  switch (fieldName) {
    case 'event.action':
      return 'actions';
    case 'destination.ip':
      return 'destination IPs';
    case 'destination.port':
      return 'destination ports';
    case 'source.ip':
      return 'source IPs';
    case 'gcp.audit.status.message':
      return 'statuses';
    case 'session.duration':
      return 'session duration';
    case 'total_length_process_args':
      return 'process arg length';
    case 'process.command_line_entropy':
      return 'command entropy';
    case 'file.size':
      return 'file size';
    case 'powershell.file.script_block_text':
      return 'script length';
    case 'dns_question_etld':
      return 'domain';
    case 'blocklist_label':
      return 'blocklist hit';
    case 'ml_is_dga.malicious_probability':
      return 'probability';
    case 'number_processes_per_session':
      return 'processes / session';
    case 'okta_distinct_ips':
      return 'distinct IPs';
    case 'problemchild.prediction_probability':
      return 'score';
    case 'source.bytes':
      return 'bytes sent';
    case 'destination.geo.country_iso_code':
      return 'country';
    case 'destination.geo.region_name':
      return 'region';
    default:
      return 'events';
  }
};

export const formatValueBasedOnFieldName = (
  detectorFunction: string | null,
  fieldName: string | null,
  value: number
): string => {
  if (fieldName) {
    if (BYTES_FIELD_NAMES.has(fieldName)) return formatBytes(value);
    if (ENTROPY_FIELD_NAMES.has(fieldName)) return `${value} bits`;
    if (fieldName === 'session.duration') return formatDuration(value);
    if (fieldName === 'total_length_process_args') return `${value} chars`;
  }
  return detectorFunction ? `${value} ${toHumanReadableFieldName(fieldName ?? '')}` : `${value}`;
};

export const formatSeconds = (rawSeconds: string, isWeek: boolean): string => {
  const totalSecs = parseFloat(rawSeconds);
  if (!Number.isFinite(totalSecs)) return rawSeconds;
  const secsInDay = isWeek ? totalSecs % SECONDS_PER_DAY : totalSecs;
  const h = String(Math.floor(secsInDay / 3600) % 24).padStart(2, '0');
  const m = String(Math.floor((secsInDay % 3600) / 60)).padStart(2, '0');
  if (isWeek) {
    const dayIdx = Math.floor(totalSecs / SECONDS_PER_DAY) % 7;
    return `${DAY_NAMES[dayIdx]} ${h}:${m}`;
  }
  return `${h}:${m}`;
};

export const getComparatorForDetectorFunction = (detectorFunction: string): string =>
  detectorFunction.startsWith('high') ? '≤ ' : '≥ ';

const getDetectorFunctionCategory = (detectorFunction: string) => {
  switch (detectorFunction) {
    case 'time_of_day':
    case 'time_of_week':
      return 'time';
    case 'high_distinct_count':
    case 'high_non_zero_count':
    case 'high_count':
    case 'low_count':
    case 'high_sum':
    case 'high_mean':
    case 'high_median':
    case 'high_varp':
    case 'low_mean':
    case 'high_info_content':
      return 'magnitude';
    case 'rare':
      return 'rare';
    default:
      return 'generic';
  }
};

const getModifierForDetectorFunction = (detectorFunction: string): string => {
  switch (detectorFunction) {
    case 'high_count':
    case 'high_distinct_count':
    case 'high_non_zero_count':
    case 'low_count':
      return '';
    case 'high_mean':
    case 'low_mean':
    case 'high_info_content':
      return 'avg ';
    case 'high_median':
      return 'median ';
    case 'high_sum':
      return 'total ';
    case 'high_varp':
      return 'variance of ';
    default:
      return '';
  }
};

const getByClause = (
  entityType: EntityType,
  byFieldName: string | null,
  byFieldValue: string | null
): string =>
  byFieldName && !byFieldName.startsWith(`${entityType}.`)
    ? ` where ${byFieldName}${byFieldValue ? ` is ${byFieldValue}` : ' exists'}`
    : '';

const getOverClause = (
  entityType: EntityType,
  overFieldName: string | null,
  overFieldValue: string | null
): string =>
  overFieldName && !overFieldName.startsWith(`${entityType}.`)
    ? ` for ${overFieldValue ? `${overFieldValue} ` : ''}${toHumanReadableFieldName(overFieldName)}`
    : '';

const getPartitionClause = (
  entityType: EntityType,
  partitionFieldName: string | null,
  partitionFieldValue: string | null
): string =>
  partitionFieldName && !partitionFieldName.startsWith(`${entityType}.`)
    ? ` where ${partitionFieldName}${
        partitionFieldValue ? ` is ${partitionFieldValue}` : ' exists'
      }`
    : '';

const magnitudeAnomalyToDisplayDetails = (anomaly: AnomalySummaryEntry) => {
  const { detectorFunction, fieldName } = anomaly;
  const observed = anomaly.actual[0] ?? 0;
  const expected = anomaly.typical[0] ?? 0;

  const formattedExpected = formatValueBasedOnFieldName(null, fieldName, expected);
  const modifier = getModifierForDetectorFunction(detectorFunction);
  const comparator = getComparatorForDetectorFunction(detectorFunction);
  const fieldClause = toHumanReadableFieldName(fieldName ?? '');

  const formattedObserved =
    detectorFunction === 'high_distinct_count'
      ? `${observed} distinct ${fieldClause}`
      : formatValueBasedOnFieldName(detectorFunction, fieldName, observed);

  return {
    expectedHeader: modifier
      ? `${modifier}${fieldClause} ${comparator}${formattedExpected}`
      : `${modifier}${comparator}${formattedExpected} ${fieldClause}`,
    observedHeader: formattedObserved,
  };
};

const rareAnomalyToDisplayDetails = (anomaly: AnomalySummaryEntry) => ({
  cardType: GEO_BY_FIELD_NAMES.has(anomaly.byFieldName ?? '') ? 'geo' : 'rare',
  expectedHeader: first(anomaly.baselineValues) ?? '',
  observedHeader: anomaly.anomalousValue ?? anomaly.byFieldValue ?? '',
  observedSubtitle:
    anomaly.anomalousValueCount != null ? `${anomaly.anomalousValueCount} occurrences` : '',
});

const timeAnomalyToDisplayDetails = (anomaly: AnomalySummaryEntry) => {
  const observed = anomaly.actual[0] ?? 0;
  const expected = anomaly.typical[0] ?? 0;

  if (anomaly.detectorFunction === 'time_of_day') {
    return {
      expectedHeader: `Activity around ${moment.utc(expected * 1000).format('HH:mm')}`,
      observedHeader: `Activity at ${moment.utc(observed * 1000).format('HH:mm')}`,
    };
  }

  return {
    expectedHeader: `Activity around ${moment
      .utc('2018-01-01') // known Monday
      .add(expected, 'seconds')
      .format('ddd HH:mm')}`,
    observedHeader: `Activity at ${moment
      .utc('2018-01-01') // known Monday
      .add(observed, 'seconds')
      .format('ddd HH:mm')}`,
  };
};

export interface AnomalyDisplayDetails {
  cardType?: string;
  expectedHeader?: string;
  expectedSubtitle?: string;
  observedHeader?: string;
  observedSubtitle?: string;
}

export const anomalyToDisplayDetails = (
  entityType: EntityType,
  anomaly: AnomalySummaryEntry
): AnomalyDisplayDetails => {
  const {
    detectorFunction,
    byFieldName,
    byFieldValue,
    overFieldName,
    overFieldValue,
    partitionFieldName,
    partitionFieldValue,
  } = anomaly;

  const category = getDetectorFunctionCategory(detectorFunction);
  const byClause = getByClause(entityType, byFieldName, byFieldValue);
  const overClause = getOverClause(entityType, overFieldName, overFieldValue);
  const partitionClause = getPartitionClause(entityType, partitionFieldName, partitionFieldValue);
  const expectedSubtitle = trim(`${byClause}${overClause}${partitionClause}`);

  switch (category) {
    case 'magnitude':
      return {
        cardType: 'magnitude',
        expectedSubtitle,
        ...magnitudeAnomalyToDisplayDetails(anomaly),
      };

    case 'rare':
      return {
        expectedSubtitle: trim(`${overClause}${partitionClause}`),
        ...rareAnomalyToDisplayDetails(anomaly),
      };

    case 'time':
      return { cardType: 'calendar', expectedSubtitle, ...timeAnomalyToDisplayDetails(anomaly) };

    default:
      return { cardType: 'unknown' };
  }
};
