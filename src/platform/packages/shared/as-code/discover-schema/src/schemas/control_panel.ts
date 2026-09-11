/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { optionsListESQLControlSchema } from '@kbn/controls-schemas';
import {
  CONTROL_WIDTH_LARGE,
  CONTROL_WIDTH_MEDIUM,
  CONTROL_WIDTH_SMALL,
  DEFAULT_PINNED_CONTROL_STATE,
  ESQL_CONTROL,
} from '@kbn/controls-constants';
import { MAX_DISCOVER_SESSION_CONTROL_PANELS } from '@kbn/discover-session-constants';

const discoverSessionControlWidthSchema = z
  .union([
    z.literal(CONTROL_WIDTH_SMALL),
    z.literal(CONTROL_WIDTH_MEDIUM),
    z.literal(CONTROL_WIDTH_LARGE),
  ])
  .default(DEFAULT_PINNED_CONTROL_STATE.width as typeof CONTROL_WIDTH_MEDIUM)
  .meta({
    description: 'Minimum width of the control panel.',
  });

export const discoverSessionControlPanelSchema = z
  .object({
    id: z.string().min(1).meta({ description: 'The unique ID of the control.' }),
    type: z.literal(ESQL_CONTROL),
    width: discoverSessionControlWidthSchema,
    grow: z
      .boolean()
      .default(DEFAULT_PINNED_CONTROL_STATE.grow)
      .meta({
        description:
          'When `true`, the control expands to fill any available horizontal space. ' +
          'Defaults to `false`.',
      }),
    config: optionsListESQLControlSchema,
  })
  .strict()
  .meta({
    id: 'kbn-discover-session-api-esql-control-panel',
    title: ESQL_CONTROL,
    description:
      'An ES|QL variable control whose selected value is injected into Discover ES|QL ' +
      'queries using the `?variable_name` syntax.',
  });

export const discoverSessionControlPanelsSchema = z
  .array(discoverSessionControlPanelSchema)
  .max(MAX_DISCOVER_SESSION_CONTROL_PANELS)
  .refine(
    (panels) => new Set(panels.map((p) => p.id)).size === panels.length,
    'control_panels must have unique ids'
  )
  .meta({
    description: 'An array of Discover ES|QL control panels.',
  });
