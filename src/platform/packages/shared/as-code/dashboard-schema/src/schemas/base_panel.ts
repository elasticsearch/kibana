/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { panelGridSchema } from './panel_grid';

export const basePanelSchema = z
  .object({
    id: z.string().optional().meta({ description: 'The unique ID of the panel.' }),
    type: z.string(),
    grid: panelGridSchema,
    // TODO: enforce Serializable type, see https://github.com/elastic/kibana/pull/269196
    config: z.object({}).loose() as z.ZodType<{}>,
  })
  .strict()
  .meta({
    id: 'kbn-dashboard-panel-type-unknown',
  });
