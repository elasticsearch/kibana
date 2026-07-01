/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG } from '@kbn/management-settings-ids';
import {
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS,
  validateSignificantEventsTuningConfig,
  type SignificantEventsTuningConfig,
} from '@kbn/streams-schema';

/**
 * Reads the tuning config from global uiSettings, merging with defaults
 * for any missing keys. If the stored config is invalid, logs a warning
 * and returns full defaults.
 */
export async function getSignificantEventsTuningConfig(
  globalUiSettingsClient: IUiSettingsClient,
  logger: Logger
): Promise<SignificantEventsTuningConfig> {
  let stored: Partial<SignificantEventsTuningConfig>;
  try {
    const raw = await globalUiSettingsClient.get<string>(
      OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG
    );
    stored = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      `Failed to read Significant Events tuning config, falling back to defaults: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { ...DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG };
  }

  // Silently drop unknown keys from stored config (e.g. renamed fields from a
  // previous version) so they don't trigger a full reset via validateSignificantEventsTuningConfig.
  const knownKeys = new Set(Object.keys(SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS));
  const safeStored = Object.fromEntries(
    Object.entries(stored).filter(([key]) => knownKeys.has(key))
  ) as Partial<SignificantEventsTuningConfig>;

  const merged = { ...DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG, ...safeStored };

  // semantic_min_score changed from a raw model-specific scale (0-100) to a
  // minmax-normalized scale (0-1). Override any persisted out-of-range value.
  if (merged.semantic_min_score < 0 || merged.semantic_min_score > 1) {
    logger.warn(
      `semantic_min_score=${merged.semantic_min_score} is outside the valid [0, 1] range ` +
        `(likely a pre-upgrade value on the old 0-100 scale). Resetting to default ` +
        `${DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.semantic_min_score}.`
    );
    merged.semantic_min_score = DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.semantic_min_score;
  }

  const errors = validateSignificantEventsTuningConfig(merged as Record<string, unknown>);
  if (errors.length > 0) {
    logger.warn(
      `Significant Events tuning config is invalid (${errors.join(', ')}). ` +
        `Falling back to default config. Fix the config in the Settings page.`
    );
    return { ...DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG };
  }

  return merged;
}
