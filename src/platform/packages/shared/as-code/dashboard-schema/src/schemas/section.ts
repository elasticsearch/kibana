/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { MAX_PANELS } from '../constants';

export const sectionGridSchema = z
  .object({
    y: z.number().meta({ description: 'The y coordinate of the section in grid units.' }),
  })
  .strict();

export function getSectionSchema<T extends z.ZodTypeAny>(panelSchema: T) {
  return z
    .object({
      title: z.string().meta({ description: 'The title of the section.' }),
      collapsed: z.boolean().default(false).meta({
        description:
          'When `true`, the section is collapsed and its panels are not rendered until expanded. Useful for improving initial load time on large dashboards. Defaults to `false`.',
      }),
      grid: sectionGridSchema,
      panels: z
        .array(panelSchema)
        .max(MAX_PANELS)
        .default([])
        .meta({ description: 'The panels that belong to the section.' }),
      id: z.string().optional().meta({ description: 'The unique ID of the section.' }),
    })
    .strict()
    .meta({
      description: 'A collapsible group of panels.',
      id: 'kbn-dashboard-section',
      title: 'Section',
    });
}
