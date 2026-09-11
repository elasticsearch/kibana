/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';

export const DEFAULT_SPACE_ID = 'default';

/** Resolves the request's space id, falling back to the default space when the spaces plugin is absent. */
export const resolveSpaceId = (
  spaces: SpacesPluginStart | undefined,
  request: KibanaRequest
): string => spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
