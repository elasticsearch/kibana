/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { asCodeIdSchema, asCodeMetaSchema } from '@kbn/as-code-shared-schemas';
import { getControlsGroupSchema } from '@kbn/controls-schemas';
import { refreshIntervalSchema } from '@kbn/data-service-server';
import { timeRangeSchema } from '@kbn/es-query-server';
import { MAX_DISCOVER_SESSION_TABS } from '@kbn/saved-search-plugin/common';
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { classicTabSchema, esqlTabSchema } from '../embeddable/schema';

export const MAX_SESSION_TITLE_LENGTH = 256;
export const MAX_SESSION_DESCRIPTION_LENGTH = 1000;
export const MAX_TAB_LABEL_LENGTH = 120;
export const MAX_BREAKDOWN_FIELD_LENGTH = 1000;
export const MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH = 256;

const visContextSchema = schema.object({
  suggestion_type: schema.oneOf(
    [
      schema.literal(UnifiedHistogramSuggestionType.lensSuggestion),
      schema.literal(UnifiedHistogramSuggestionType.histogramForESQL),
      schema.literal(UnifiedHistogramSuggestionType.histogramForDataView),
    ],
    {
      meta: {
        description:
          'Chart suggestion type used by Discover to generate this histogram configuration.',
      },
    }
  ),
  attributes: schema.recordOf(
    schema.string({ maxLength: MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH }),
    schema.any(),
    {
      meta: {
        description: 'Chart configuration payload for the selected `suggestion_type`.',
      },
    }
  ),
});

const discoverSessionTabPresentationSchema = schema.object({
  hide_chart: schema.boolean({
    defaultValue: false,
    meta: { description: 'When `true`, the chart is hidden.' },
  }),
  hide_table: schema.boolean({
    defaultValue: false,
    meta: { description: 'When `true`, the data table is hidden.' },
  }),
  hide_aggregated_preview: schema.maybe(
    schema.boolean({
      meta: { description: 'When `true`, aggregated preview panels are hidden.' },
    })
  ),
  breakdown_field: schema.maybe(
    schema.string({
      maxLength: MAX_BREAKDOWN_FIELD_LENGTH,
      meta: { description: 'Field name used to split chart data into series.' },
    })
  ),
  chart_interval: schema.maybe(
    schema.oneOf(
      [
        schema.literal('auto'),
        schema.literal('ms'),
        schema.literal('s'),
        schema.literal('m'),
        schema.literal('h'),
        schema.literal('d'),
        schema.literal('w'),
        schema.literal('M'),
        schema.literal('y'),
      ],
      {
        meta: {
          description: 'Time interval for the chart histogram on this tab.',
        },
      }
    )
  ),
  time_restore: schema.boolean({
    defaultValue: false,
    meta: {
      description:
        "When `true`, Discover applies this tab's `time_range` and `refresh_interval`. When `false`, those fields are ignored and global time settings are used.",
    },
  }),
  time_range: schema.maybe(timeRangeSchema),
  refresh_interval: schema.maybe(refreshIntervalSchema),
  vis_context: schema.maybe(visContextSchema),
  control_panels: schema.maybe(getControlsGroupSchema()),
});

const discoverSessionTabIdentitySchema = schema.object({
  id: asCodeIdSchema,
  label: schema.string({
    maxLength: MAX_TAB_LABEL_LENGTH,
    meta: { description: 'Tab label.' },
  }),
});

const discoverSessionClassicTabSchema = schema.object({
  ...discoverSessionTabIdentitySchema.getPropSchemas(),
  ...classicTabSchema.getPropSchemas(),
  ...discoverSessionTabPresentationSchema.getPropSchemas(),
});

const discoverSessionEsqlTabSchema = schema.object({
  ...discoverSessionTabIdentitySchema.getPropSchemas(),
  ...esqlTabSchema.getPropSchemas(),
  ...discoverSessionTabPresentationSchema.getPropSchemas(),
});

const discoverSessionApiTabSchema = schema.oneOf([
  discoverSessionClassicTabSchema,
  discoverSessionEsqlTabSchema,
]);

export const discoverSessionDataSchema = schema.object(
  {
    title: schema.string({
      minLength: 1,
      maxLength: MAX_SESSION_TITLE_LENGTH,
      meta: { description: 'Discover session title.' },
    }),
    description: schema.string({
      defaultValue: '',
      maxLength: MAX_SESSION_DESCRIPTION_LENGTH,
      meta: { description: 'Discover session description.' },
    }),
    tabs: schema.arrayOf(discoverSessionApiTabSchema, {
      minSize: 1,
      maxSize: MAX_DISCOVER_SESSION_TABS,
      meta: {
        description: 'Ordered list of tabs in the Discover session.',
      },
    }),
  },
  {
    meta: {
      id: 'kbn-discover-session-data',
      title: 'Discover session data',
      description: 'Configuration data for a Discover session.',
    },
  }
);

export const discoverSessionApiResponseSchema = schema.object({
  id: asCodeIdSchema,
  data: discoverSessionDataSchema,
  meta: asCodeMetaSchema,
});

export const discoverSessionApiRequestBodySchema = schema.object({
  data: discoverSessionDataSchema,
});

export type DiscoverSessionData = TypeOf<typeof discoverSessionDataSchema>;
export type DiscoverSessionApiResponse = TypeOf<typeof discoverSessionApiResponseSchema>;
export type DiscoverSessionApiClassicTab = TypeOf<typeof discoverSessionClassicTabSchema>;
export type DiscoverSessionApiEsqlTab = TypeOf<typeof discoverSessionEsqlTabSchema>;
export type DiscoverSessionApiTab = TypeOf<typeof discoverSessionApiTabSchema>;
