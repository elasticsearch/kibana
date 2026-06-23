/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SIEM_MIGRATIONS_ASSISTANT_USER = 'assistant';

export const SIEM_MIGRATION_INFERENCE_FEATURE_ID = 'siem_migrations';

export const SIEM_MIGRATIONS_PATH = '/internal/siem_migrations' as const;

// TODO: Move `SIEM_RULE_MIGRATIONS_PATH` and composed paths to rules/constants.ts
export const SIEM_RULE_MIGRATIONS_PATH = `${SIEM_MIGRATIONS_PATH}/rules` as const;

export const SIEM_RULE_MIGRATIONS_ALL_STATS_PATH = `${SIEM_RULE_MIGRATIONS_PATH}/stats` as const;
export const SIEM_RULE_MIGRATIONS_INTEGRATIONS_PATH =
  `${SIEM_RULE_MIGRATIONS_PATH}/integrations` as const;
export const SIEM_RULE_MIGRATIONS_INTEGRATIONS_STATS_PATH =
  `${SIEM_RULE_MIGRATIONS_PATH}/integrations/stats` as const;
export const SIEM_RULE_MIGRATION_PATH = `${SIEM_RULE_MIGRATIONS_PATH}/{migration_id}` as const;
export const SIEM_RULE_MIGRATION_RULES_PATH = `${SIEM_RULE_MIGRATION_PATH}/rules` as const;
export const SIEM_RULE_MIGRATION_RULES_ENHANCE_PATH =
  `${SIEM_RULE_MIGRATION_RULES_PATH}/enhance` as const;
export const SIEM_RULE_MIGRATION_QRADAR_RULES_PATH =
  `${SIEM_RULE_MIGRATION_PATH}/qradar/rules` as const;
export const SIEM_RULE_MIGRATION_SENTINEL_RULES_PATH =
  `${SIEM_RULE_MIGRATION_PATH}/sentinel/rules` as const;
export const SIEM_RULE_MIGRATION_START_PATH = `${SIEM_RULE_MIGRATION_PATH}/start` as const;
export const SIEM_RULE_MIGRATION_UPDATE_INDEX_PATTERN_PATH =
  `${SIEM_RULE_MIGRATION_PATH}/update_index_pattern` as const;
export const SIEM_RULE_MIGRATION_STATS_PATH = `${SIEM_RULE_MIGRATION_PATH}/stats` as const;
export const SIEM_RULE_MIGRATION_TRANSLATION_STATS_PATH =
  `${SIEM_RULE_MIGRATION_PATH}/translation_stats` as const;
export const SIEM_RULE_MIGRATION_STOP_PATH = `${SIEM_RULE_MIGRATION_PATH}/stop` as const;
export const SIEM_RULE_MIGRATION_INSTALL_PATH = `${SIEM_RULE_MIGRATION_PATH}/install` as const;
export const SIEM_RULE_MIGRATIONS_PREBUILT_RULES_PATH =
  `${SIEM_RULE_MIGRATION_PATH}/prebuilt_rules` as const;

export const SIEM_RULE_MIGRATION_RESOURCES_PATH = `${SIEM_RULE_MIGRATION_PATH}/resources` as const;
export const SIEM_RULE_MIGRATION_RESOURCES_MISSING_PATH =
  `${SIEM_RULE_MIGRATION_RESOURCES_PATH}/missing` as const;

export const SIEM_RULE_MIGRATION_MISSING_PRIVILEGES_PATH =
  `${SIEM_RULE_MIGRATIONS_PATH}/missing_privileges` as const;
export const SIEM_RULE_MIGRATION_EVALUATE_PATH = `${SIEM_RULE_MIGRATIONS_PATH}/evaluate` as const;

export const LOOKUPS_INDEX_PREFIX = 'lookup_';

export enum SiemMigrationTaskStatus {
  /** The Migration is not yet started */
  READY = 'ready',
  /** The Migration is in progress */
  RUNNING = 'running',
  /** The Migration is explicitly stopped by user */
  STOPPED = 'stopped',
  /** The Migration process has been interrupted, usually a server restart. */
  INTERRUPTED = 'interrupted',
  /** The Migration process is finished */
  FINISHED = 'finished',
}

export enum SiemMigrationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SiemMigrationRetryFilter {
  FAILED = 'failed',
  NOT_FULLY_TRANSLATED = 'not_fully_translated',
}

export enum MigrationTranslationResult {
  FULL = 'full',
  PARTIAL = 'partial',
  UNTRANSLATABLE = 'untranslatable',
}

export const DEFAULT_TRANSLATION_FIELDS = {
  from: 'now-360s',
  to: 'now',
  interval: '5m',
} as const;

export const SENTINEL_DEFAULT_QUERY_FREQUENCY = '1m';
export const SENTINEL_RULE_KIND_ANNOTATION_KEY = 'sentinel_rule_kind';

export const SIEM_RULE_MIGRATION_INDEX_PATTERN_PLACEHOLDER = '[indexPattern]';
