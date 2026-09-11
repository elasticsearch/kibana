/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import { GLOBAL_SPACE_ID } from '../../../common/threat_intel';

/**
 * Logical per-space isolation: every plugin-owned document carries a
 * `space_id` keyword. Reads accept the current space *plus* the
 * `GLOBAL_SPACE_ID` sentinel so built-in / seeded rows stay visible. Writes
 * tag with the current space.
 *
 * Falls back to `'default'` only when the spaces plugin is missing (e.g. legacy
 * setup or test bootstrap) so the rest of the plugin keeps working without
 * spaces installed. When Spaces *is* installed, `spaces.getSpaceId(request)`
 * resolves the active space from the request's path; it does not throw, and an
 * unresolvable request maps to the default space id per the Spaces contract
 * rather than to another space's data.
 */

export const resolveCurrentSpaceId = (
  spaces: SpacesServiceStart | undefined,
  request: KibanaRequest
): string => {
  if (!spaces) return 'default';
  return spaces.getSpaceId(request);
};

export const buildSpaceFilterTerms = (
  currentSpaceId: string
): { terms: { space_id: string[] } } => ({
  terms: { space_id: [currentSpaceId, GLOBAL_SPACE_ID] },
});

/**
 * Whether the current space may toggle a source document.
 * Space-owned legacy rows are mutable only in their owning space. Global (`*`)
 * catalog rows are mutable only from the default space so other spaces cannot
 * disable shared feeds.
 */
export const canMutateSourceInSpace = (
  sourceSpaceId: string | undefined,
  requestSpaceId: string
): boolean => {
  const ownerSpaceId = sourceSpaceId ?? GLOBAL_SPACE_ID;
  if (ownerSpaceId === GLOBAL_SPACE_ID) {
    return requestSpaceId === 'default';
  }
  return ownerSpaceId === requestSpaceId;
};
