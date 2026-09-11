/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { RUNTIME_FIELD_TYPES } from '@kbn/as-code-data-views-schema';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';

type RuntimeType = (typeof RUNTIME_FIELD_TYPES)[number];

/**
 * Type guard for a runtime field
 *
 * @param {unknown} arg - The item to be checked
 * @returns {arg is estypes.MappingRuntimeField}
 */
export function isRuntimeField(arg: unknown): arg is estypes.MappingRuntimeField {
  return (
    ((isPopulatedObject(arg, ['type']) && Object.keys(arg).length === 1) ||
      (isPopulatedObject(arg, ['type', 'script']) &&
        // Can be a string
        (typeof arg.script === 'string' ||
          // Can be InlineScript
          (isPopulatedObject(arg.script, ['source']) && typeof arg.script.source === 'string') ||
          // Can be StoredScriptId
          (isPopulatedObject(arg.script, ['id']) && typeof arg.script.id === 'string')))) &&
    RUNTIME_FIELD_TYPES.includes(arg.type as RuntimeType)
  );
}
