/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import { GLOBAL_SPACE_ID } from '../../../common/threat_intelligence/hub';

/**
 * Logical per-space isolation: every plugin-owned document carries a
 * `space_id` keyword. Reads accept the current space *plus* the
 * `GLOBAL_SPACE_ID` sentinel so built-in / seeded rows stay visible. Writes
 * tag with the current space.
 *
 * Falls back to `'default'` if the spaces plugin is missing (e.g. legacy
 * setup or test bootstrap) so the rest of the plugin keeps working
 * without spaces installed.
 */

export const resolveCurrentSpaceId = (
  spaces: SpacesServiceStart | undefined,
  request: KibanaRequest
): string => {
  if (!spaces) return 'default';
  try {
    return spaces.getSpaceId(request);
  } catch {
    return 'default';
  }
};

export const buildSpaceFilterTerms = (
  currentSpaceId: string
): { terms: { space_id: string[] } } => ({
  terms: { space_id: [currentSpaceId, GLOBAL_SPACE_ID] },
});
