/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { VIEW_MODE } from '@kbn/discover-session-constants';

export const viewModeSchema = z
  .union([
    z.literal(VIEW_MODE.DOCUMENT_LEVEL),
    z.literal(VIEW_MODE.PATTERN_LEVEL),
    z.literal(VIEW_MODE.AGGREGATED_LEVEL),
  ])
  .default(VIEW_MODE.DOCUMENT_LEVEL)
  .meta({
    description:
      'Discover view mode. Choose "documents" (search hits), "patterns" (pattern analysis), or "aggregated" (field statistics).',
  });
