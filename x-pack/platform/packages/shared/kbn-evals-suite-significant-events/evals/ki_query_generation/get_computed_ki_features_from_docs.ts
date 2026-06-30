/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature, FeatureUpsert } from '@kbn/significant-events-schema';
import { computeFeatureUuid } from '@kbn/significant-events-schema';
import { selectLogPatternsForLlm } from '@kbn/streams-ai/src/features/computed/log_patterns';

const ERROR_KEYWORDS = ['error', 'exception', 'fatal', 'fail', 'panic', 'timeout', 'traceback'];
const MAX_FIELD_VALUE_SAMPLES = 5;
const MAX_SAMPLE_DOCS = 5;
const MAX_ERROR_SAMPLES = 5;

/**
 * Recursively flattens a nested ES document into dot-delimited field names.
 * Arrays are unchanged. Nested objects are recursed into.
 */
const flattenDoc = (doc: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenDoc(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
};

/**
 * Picks diverse sample docs by selecting at most one doc per unique
 * `resource.attributes.app` value (service name), up to `limit` docs total.
 */
const pickDiverseSamples = (
  flatDocs: Array<Record<string, unknown>>,
  limit: number
): Array<Record<string, unknown>> => {
  const seenApps = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (const doc of flatDocs) {
    if (result.length >= limit) break;
    const app = String(doc['resource.attributes.app'] ?? '');
    if (app && seenApps.has(app)) continue;
    if (app) seenApps.add(app);
    result.push(doc);
  }

  if (result.length < limit) {
    for (const doc of flatDocs) {
      if (result.length >= limit) break;
      if (!result.includes(doc)) result.push(doc);
    }
  }

  return result;
};

/**
 * Converts a flat doc into the log_samples feature format where each
 * field value is wrapped in an array.
 */
const docToSampleFormat = (doc: Record<string, unknown>): Record<string, unknown[]> => {
  const result: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(doc)) {
    result[key] = [value];
  }
  return result;
};

const buildDatasetAnalysis = (
  streamName: string,
  flatDocs: Array<Record<string, unknown>>
): FeatureUpsert => {
  const fieldValueCounts: Record<string, Map<string, number>> = {};

  for (const doc of flatDocs) {
    for (const [field, value] of Object.entries(doc)) {
      if (!fieldValueCounts[field]) fieldValueCounts[field] = new Map();
      const strVal =
        value == null
          ? '(no value)'
          : typeof value === 'string'
          ? value.length > 120
            ? value.slice(0, 120) + '...'
            : value
          : String(value);
      const counts = fieldValueCounts[field];
      counts.set(strVal, (counts.get(strVal) ?? 0) + 1);
    }
  }

  const total = flatDocs.length;
  const fields: Record<string, string[]> = {};
  for (const [field, valueCounts] of Object.entries(fieldValueCounts)) {
    const sorted = [...valueCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topValues = sorted.slice(0, MAX_FIELD_VALUE_SAMPLES).map(([val, count]) => {
      const pct = Math.round((count / total) * 100);
      return `${val} (${pct}%)`;
    });
    if (sorted.length > MAX_FIELD_VALUE_SAMPLES) {
      topValues.push(`... (+${sorted.length - MAX_FIELD_VALUE_SAMPLES} more)`);
    }
    fields[field] = topValues;
  }

  return {
    id: 'dataset_analysis',
    stream_name: streamName,
    type: 'dataset_analysis',
    description: 'Dataset schema and field analysis including value distributions and coverage',
    properties: { analysis: { total, fields, sampled: total } },
    confidence: 100,
  };
};

const buildLogSamples = (
  streamName: string,
  flatDocs: Array<Record<string, unknown>>
): FeatureUpsert => {
  const samples = pickDiverseSamples(flatDocs, MAX_SAMPLE_DOCS).map(docToSampleFormat);

  return {
    id: 'log_samples',
    stream_name: streamName,
    type: 'log_samples',
    description: 'Raw sample log documents from the stream',
    properties: { samples },
    confidence: 100,
  };
};

const buildLogPatterns = (
  streamName: string,
  flatDocs: Array<Record<string, unknown>>
): FeatureUpsert => {
  const bodyTexts = flatDocs
    .map((doc) => String(doc['body.text'] ?? doc.message ?? ''))
    .filter(Boolean);

  const patternGroups = new Map<string, { count: number; sample: string }>();
  for (const text of bodyTexts) {
    const normalized = text
      .slice(0, 40)
      .replace(/[0-9a-f]{8,}/gi, '*')
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '*');
    const existing = patternGroups.get(normalized);
    if (existing) {
      existing.count++;
    } else {
      patternGroups.set(normalized, { count: 1, sample: text });
    }
  }

  const sorted = [...patternGroups.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ count, sample }) => ({
      count,
      sample,
      field: 'body.text',
      pattern: sample
        .slice(0, 80)
        .replace(/[0-9a-f]{8,}/gi, '*')
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '*'),
    }));

  const patterns = selectLogPatternsForLlm(sorted);

  return {
    id: 'log_patterns',
    stream_name: streamName,
    type: 'log_patterns',
    description: 'Log message patterns identified through categorization analysis',
    properties: { patterns },
    confidence: 100,
  };
};

const buildErrorLogs = (
  streamName: string,
  flatDocs: Array<Record<string, unknown>>
): FeatureUpsert => {
  const errorDocs = flatDocs.filter((doc) => {
    const text = String(doc['body.text'] ?? doc.message ?? '').toLowerCase();
    return ERROR_KEYWORDS.some((kw) => text.includes(kw));
  });

  const samples = pickDiverseSamples(errorDocs, MAX_ERROR_SAMPLES).map(docToSampleFormat);

  return {
    id: 'error_logs',
    stream_name: streamName,
    type: 'error_logs',
    description: 'Sample error logs extracted from the stream',
    properties: { samples },
    confidence: 100,
  };
};

/**
 * Builds computed KI features (dataset_analysis, log_samples, log_patterns,
 * error_logs) from ES search hits for canonical KI features.
 */
export const getComputedKIFeaturesFromDocs = ({
  streamName,
  docs,
}: {
  streamName: string;
  docs: Array<Record<string, unknown>>;
}): Feature[] => {
  if (docs.length === 0) return [];

  const flatDocs = docs.map((doc) => flattenDoc(doc));

  return [
    buildDatasetAnalysis(streamName, flatDocs),
    buildLogSamples(streamName, flatDocs),
    buildLogPatterns(streamName, flatDocs),
    buildErrorLogs(streamName, flatDocs),
  ].map((feature) => ({ ...feature, uuid: computeFeatureUuid(feature) }));
};
