/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OpenAPIV3 } from 'openapi-types';
import type { StabilityLevel } from '../../types/latest';

export function getStabilityFromXState(
  operation: OpenAPIV3.OperationObject
): StabilityLevel | undefined {
  const xState = (operation as Record<string, unknown>)['x-state'];
  if (typeof xState !== 'string') {
    return undefined;
  }
  const lower = xState.toLowerCase();
  if (lower.startsWith('technical preview')) {
    return 'tech_preview';
  }
  if (lower.startsWith('beta')) {
    return 'beta';
  }
  return undefined;
}
