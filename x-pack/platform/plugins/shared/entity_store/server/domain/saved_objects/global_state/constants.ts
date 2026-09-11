/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const DEFAULT_HISTORY_SNAPSHOT_FREQUENCY = '24h';

export const LOG_EXTRACTION_DELAY_DEFAULT = '1m';
export const LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT = '3h';
export const LOG_EXTRACTION_FREQUENCY_DEFAULT = '1m';
// Max amount of entities to extract in one ESQL query
export const LOG_EXTRACTION_DOCS_LIMIT_DEFAULT = 10000;
// Max raw log documents per logs to be processed in a query (inside elastic search)
export const LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT = 50_000;
export const LOG_EXTRACTION_TIMEOUT_DEFAULT = '59s';
export const LOG_EXTRACTION_MAX_TIME_WINDOW_SIZE_DEFAULT = '15m';
// Max total raw log documents to process per task run; 0 = no cap
export const LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT = 100_000;
export const LOG_EXTRACTION_CAP_BEHAVIOR_DEFAULT = 'drop' as const;

/** Bounds for HTTP/SO string fields to prevent unbounded-input DoS. */
export const MAX_DURATION_STRING_LENGTH = 32;
export const MAX_INDEX_PATTERN_LENGTH = 2048;
export const MAX_INDEX_PATTERNS = 1000;
export const MAX_ERROR_MESSAGE_LENGTH = 2048;
export const MAX_TIMESTAMP_STRING_LENGTH = 64;

const durationString = z
  .string()
  .max(MAX_DURATION_STRING_LENGTH)
  .regex(/[smdh]$/);

const indexPatternString = z.string().max(MAX_INDEX_PATTERN_LENGTH);
const indexPatternsArray = z.array(indexPatternString).max(MAX_INDEX_PATTERNS);

// Schema for field validation (no defaults)
export const LogExtractionObj = z.object({
  additionalIndexPatterns: indexPatternsArray,
  excludedIndexPatterns: indexPatternsArray,
  fieldHistoryLength: z.number().int(),
  lookbackPeriod: durationString,
  delay: durationString,
  docsLimit: z.number().int().min(1),
  maxLogsPerPage: z.number().int().min(1),
  timeout: durationString,
  frequency: durationString,
  maxTimeWindowSize: durationString,
  maxLogsPerWindow: z.number().int().min(0),
  maxLogsPerWindowCapBehavior: z.enum(['defer', 'drop']),
});

/** Field schemas of an object schema. Not `z.ZodRawShape`, which widens values to a type without the `.nullable()` builder. */
type ZodFields = Record<string, z.ZodType>;

/** Maps every field of `T` to an optional, nullable version of itself. */
type NullishFields<T extends ZodFields> = {
  [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>>;
};

/** Makes every field optional and nullable, so an omitted field is left alone and a null field is cleared. */
const nullishFields = <T extends ZodFields>(fields: T): NullishFields<T> =>
  Object.fromEntries(
    Object.entries(fields).map(([key, fieldSchema]) => [key, fieldSchema.nullable().optional()])
  ) as NullishFields<T>;

export type LogExtractionOverride = z.infer<typeof LogExtractionOverride>;
/** Store-wide override layer. `timeout` is not settable over HTTP. */
export const LogExtractionOverride = z.object(
  nullishFields(LogExtractionObj.omit({ timeout: true }).shape)
);

export type LogExtractionTypeOverride = z.infer<typeof LogExtractionTypeOverride>;
/** Per entity-type override layer, stored on the engine descriptor. Drops the two fields that are never read at runtime. */
export const LogExtractionTypeOverride = z.object(
  nullishFields(LogExtractionObj.omit({ timeout: true, fieldHistoryLength: true }).shape)
);

const base = LogExtractionObj.shape;

export type LogExtractionConfig = z.infer<typeof LogExtractionConfig>;

// schema for defaults
export const LogExtractionConfig = z.object({
  additionalIndexPatterns: base.additionalIndexPatterns.default([]),
  excludedIndexPatterns: base.excludedIndexPatterns.default([]),
  fieldHistoryLength: base.fieldHistoryLength.default(10),
  lookbackPeriod: base.lookbackPeriod.default(LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT),
  delay: base.delay.default(LOG_EXTRACTION_DELAY_DEFAULT),
  docsLimit: base.docsLimit.default(LOG_EXTRACTION_DOCS_LIMIT_DEFAULT),
  maxLogsPerPage: base.maxLogsPerPage.default(LOG_EXTRACTION_MAX_LOGS_PER_PAGE_DEFAULT),
  timeout: base.timeout.default(LOG_EXTRACTION_TIMEOUT_DEFAULT),
  frequency: base.frequency.default(LOG_EXTRACTION_FREQUENCY_DEFAULT),
  maxTimeWindowSize: base.maxTimeWindowSize.default(LOG_EXTRACTION_MAX_TIME_WINDOW_SIZE_DEFAULT),
  maxLogsPerWindow: base.maxLogsPerWindow.default(LOG_EXTRACTION_MAX_LOGS_PER_WINDOW_DEFAULT),
  maxLogsPerWindowCapBehavior: base.maxLogsPerWindowCapBehavior.default(
    LOG_EXTRACTION_CAP_BEHAVIOR_DEFAULT
  ),
});

export const LATEST_LOG_EXTRACTION_DEFAULTS: LogExtractionConfig = LogExtractionConfig.parse({});

export type HistorySnapshotStatus = z.infer<typeof HistorySnapshotStatus>;
export const HistorySnapshotStatus = z.enum(['started', 'stopped']);

export type HistorySnapshotState = z.infer<typeof HistorySnapshotState>;
export const HistorySnapshotState = z.object({
  status: HistorySnapshotStatus.default('started'),
  frequency: durationString.default(DEFAULT_HISTORY_SNAPSHOT_FREQUENCY),
  lastExecutionTimestamp: z.string().max(MAX_TIMESTAMP_STRING_LENGTH).optional(),
  lastError: z
    .object({
      message: z.string().max(MAX_ERROR_MESSAGE_LENGTH),
      timestamp: z.string().max(MAX_TIMESTAMP_STRING_LENGTH).optional(),
    })
    .optional(),
});

export type EntityStoreGlobalState = z.infer<typeof EntityStoreGlobalState>;
export const EntityStoreGlobalState = z.object({
  historySnapshot: HistorySnapshotState,
  logsExtraction: LogExtractionConfig,
});

export type EntityStoreGlobalStateOverrides = z.infer<typeof EntityStoreGlobalStateOverrides>;

// Schema for persisted global state shape: logExtraction keeps overrides only, historySnapshot is persisted in full.
export const EntityStoreGlobalStateOverrides = z
  .object({
    // 'legacy': logsExtraction holds overrides + defaults (data_backfill)
    // 'latest': logsExtraction holds overrides only. (new writes)
    defaultsVersion: z.enum(['legacy', 'latest']),
    historySnapshot: HistorySnapshotState,
    logsExtraction: LogExtractionObj.partial(),
  })
  .partial();
