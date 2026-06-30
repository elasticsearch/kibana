/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import { generateSampleFromJsonSchema } from '@kbn/workflows-ui';

/**
 * Returns the placeholder value for a workflow input property based on its JSON Schema.
 * Single source of truth for autocomplete insert text; used by suggestions and scaffolding.
 */
export function getPlaceholderForProperty(propSchema: JSONSchema7): string {
  const sample = generateSampleFromJsonSchema(propSchema);
  if (sample === undefined) {
    return '""';
  }
  return typeof sample === 'string' ? `"${sample}"` : JSON.stringify(sample);
}
