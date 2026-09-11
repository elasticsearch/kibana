/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';

export const accessControlSchema = z
  .object({
    access_mode: z
      .union([z.literal('write_restricted'), z.literal('default')])
      .optional()
      .meta({
        description:
          'Controls edit access to the dashboard. Set to `write_restricted` to prevent edits by users without explicit write permission. Defaults to `default` (all viewers can edit).',
      }),
  })
  .strict()
  .optional()
  .meta({
    description: 'Access control settings for the dashboard.',
    id: 'kbn-dashboard-access-control',
    title: 'Access control',
  });
