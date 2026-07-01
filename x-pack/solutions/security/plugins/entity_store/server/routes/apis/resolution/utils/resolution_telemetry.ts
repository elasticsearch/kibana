/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ChainResolutionError,
  EntitiesNotFoundError,
  EntityHasAliasesError,
  MixedEntityTypesError,
  ResolutionSearchTruncatedError,
  ResolutionUpdateError,
  SelfLinkError,
} from '../../../../domain/errors';
import type { TelemetryReporter } from '../../../../telemetry/events';
import { ENTITY_STORE_RESOLUTION_ERROR_EVENT } from '../../../../telemetry/events';

export type ResolutionOperation = 'link' | 'unlink' | 'group';

type ResolutionErrorType =
  | 'self_link'
  | 'chain_resolution'
  | 'entities_not_found'
  | 'mixed_entity_types'
  | 'entity_has_aliases'
  | 'resolution_search_truncated'
  | 'resolution_update';

function getResolutionErrorType(error: unknown): ResolutionErrorType | undefined {
  if (error instanceof SelfLinkError) {
    return 'self_link';
  }
  if (error instanceof ChainResolutionError) {
    return 'chain_resolution';
  }
  if (error instanceof EntitiesNotFoundError) {
    return 'entities_not_found';
  }
  if (error instanceof MixedEntityTypesError) {
    return 'mixed_entity_types';
  }
  if (error instanceof EntityHasAliasesError) {
    return 'entity_has_aliases';
  }
  if (error instanceof ResolutionSearchTruncatedError) {
    return 'resolution_search_truncated';
  }
  if (error instanceof ResolutionUpdateError) {
    return 'resolution_update';
  }

  return undefined;
}

export function reportResolutionError(
  analytics: TelemetryReporter,
  operation: ResolutionOperation,
  namespace: string,
  error: unknown
): void {
  const errorType = getResolutionErrorType(error);
  if (!errorType) {
    return;
  }

  analytics.reportEvent(ENTITY_STORE_RESOLUTION_ERROR_EVENT, {
    errorType,
    operation,
    namespace,
  });
}
