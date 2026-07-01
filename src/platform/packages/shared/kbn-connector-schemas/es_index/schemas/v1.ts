/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { z, lazySchema } from '@kbn/zod/v4';
import { ALERT_HISTORY_PREFIX } from '../constants';

export const ConfigSchema = lazySchema(() =>
  z
    .object({
      index: z.string(),
      refresh: z.boolean().default(false),
      executionTimeField: z.string().nullable().default(null),
    })
    .strict()
);

export const SecretsSchema = lazySchema(() => z.object({}).strict().default({}));

const documentSchema = z.union([z.string(), z.record(z.string(), z.any())]);

// see: https://www.elastic.co/guide/en/elasticsearch/reference/current/actions-index.html
// - timeout not added here, as this seems to be a generic thing we want to do
//   eventually: https://github.com/elastic/kibana/projects/26#card-24087404
export const ParamsSchema = lazySchema(() =>
  z
    .object({
      documents: z.array(documentSchema),
      indexOverride: z
        .string()
        .nullable()
        .default(null)
        .refine(
          (pattern) => pattern === null || (pattern && pattern.startsWith(ALERT_HISTORY_PREFIX)),
          {
            message: `index must start with "${ALERT_HISTORY_PREFIX}"`,
          }
        ),
    })
    .strict()
);
