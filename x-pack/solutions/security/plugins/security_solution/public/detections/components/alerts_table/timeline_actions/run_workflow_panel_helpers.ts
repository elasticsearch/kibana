/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';

/**
 * Returns true when the normalized inputs schema has at least one required property,
 * regardless of whether defaults are present. Defaulted fields are pre-filled in the
 * modal editor so the user can review and adjust them before running.
 */
export const requiresUserSuppliedInputs = (normalized?: JsonModelSchemaType): boolean => {
  if (!normalized?.properties) return false;
  return (normalized.required?.length ?? 0) > 0;
};
