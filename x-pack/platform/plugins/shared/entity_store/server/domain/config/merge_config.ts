/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityType } from '../../../common/domain/definitions/entity_schema';
import type { LogExtractionConfig, LogExtractionTypeOverride } from '../saved_objects';
import {
  LATEST_LOG_EXTRACTION_DEFAULTS,
  LogExtractionConfig as LogExtractionConfigSchema,
} from '../saved_objects';

/** Built-in per entity-type defaults. Empty for now: raising frequency also cuts throughput, so values need measurement (#269261). */
export const DEFAULT_CONFIG_BY_TYPE: Partial<Record<EntityType, Partial<LogExtractionConfig>>> = {};

/** A layer's set fields. `undefined` and `null` are dropped, so they fall through to the layers below. */
const setFields = (
  layer: Partial<LogExtractionTypeOverride> | Partial<LogExtractionConfig> | undefined
): Partial<LogExtractionConfig> =>
  Object.fromEntries(
    Object.entries(layer ?? {}).filter(([, value]) => value !== null && value !== undefined)
  ) as Partial<LogExtractionConfig>;

/** Config in effect for one entity type: code defaults, then `globalOverrides`, then `typeOverride`. */
export const getMergedConfig = (
  type: EntityType,
  globalOverrides: Partial<LogExtractionConfig>,
  typeOverride: LogExtractionTypeOverride | undefined
): LogExtractionConfig =>
  LogExtractionConfigSchema.parse({
    ...LATEST_LOG_EXTRACTION_DEFAULTS,
    ...DEFAULT_CONFIG_BY_TYPE[type],
    ...setFields(globalOverrides),
    ...setFields(typeOverride),
  });
