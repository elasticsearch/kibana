/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import {
  UnifiedHistogramSuggestionType,
  MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH,
} from '@kbn/discover-session-constants';

export const visContextSchema = z
  .object({
    suggestion_type: z
      .union([
        z.literal(UnifiedHistogramSuggestionType.lensSuggestion),
        z.literal(UnifiedHistogramSuggestionType.histogramForESQL),
        z.literal(UnifiedHistogramSuggestionType.histogramForDataView),
      ])
      .meta({
        description:
          'Chart suggestion type used by Discover to generate this histogram configuration.',
      }),
    attributes: z.record(z.string().max(MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH), z.any()).meta({
      description: 'Chart configuration payload for the selected `suggestion_type`.',
    }),
  })
  .strict();
