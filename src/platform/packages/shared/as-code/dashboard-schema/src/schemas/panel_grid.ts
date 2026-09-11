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
  DASHBOARD_GRID_COLUMN_COUNT,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
} from '../constants';

export const panelGridSchema = z
  .object({
    x: z.number().meta({ description: 'The x coordinate of the panel in grid units.' }),
    y: z.number().meta({ description: 'The y coordinate of the panel in grid units.' }),
    w: z.number().min(1).max(DASHBOARD_GRID_COLUMN_COUNT).default(DEFAULT_PANEL_WIDTH).meta({
      description:
        'The width of the panel in grid units. Minimum `1`, maximum `48`. Defaults to `24`.',
    }),
    h: z.number().min(1).default(DEFAULT_PANEL_HEIGHT).meta({
      description: 'The height of the panel in grid units. Minimum `1`. Defaults to `15`.',
    }),
  })
  .strict()
  .meta({
    id: 'kbn-dashboard-panel-grid',
    title: 'Panel grid',
    description: 'The position and size of the panel on the dashboard grid.',
  });
