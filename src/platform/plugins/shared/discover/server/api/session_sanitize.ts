/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toStoredTags } from '@kbn/as-code-shared-transforms';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import { discoverSessionApiDataSchema } from '@kbn/as-code-discover-schema';
import type { DiscoverSessionSanitizeResponse } from './schema';
import { transformDiscoverSessionOut } from './transforms';

export interface DiscoverSessionSanitizeRequest {
  attributes: DiscoverSessionAttributes;
  tags?: string[];
}

export const sanitizeDiscoverSession = ({
  attributes,
  tags,
}: DiscoverSessionSanitizeRequest): DiscoverSessionSanitizeResponse => {
  const { references } = toStoredTags({ tags });
  const { sessionState, warnings } = transformDiscoverSessionOut(attributes, references);

  return {
    data: discoverSessionApiDataSchema.parse(sessionState),
    ...(warnings.length ? { warnings } : {}),
  };
};
