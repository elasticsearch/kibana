/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { asCodeFilterSchema } from '@kbn/as-code-filters-schema';
import { asCodeQuerySchema, getAsCodeTagsSchema } from '@kbn/as-code-shared-schemas';
import type { ObjectType, Type } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { getControlsGroupSchema } from '@kbn/controls-schemas';
import { refreshIntervalSchema } from '@kbn/data-service-server';
import { timeRangeSchema } from '@kbn/es-query-server';
import { isDashboardSection } from '../../common';
import {
  DEFAULT_DASHBOARD_OPTIONS,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
} from '../../common/constants';
import { DASHBOARD_GRID_COLUMN_COUNT } from '../../common/page_bundle_constants';
import { embeddableService } from '../kibana_services';
import type { DashboardPanel, DashboardSection } from './types';

const MAX_PANELS = 1000;

export const panelGridSchema = schema.object(
  {
    x: schema.number({ meta: { description: 'The x coordinate of the panel in grid units.' } }),
    y: schema.number({ meta: { description: 'The y coordinate of the panel in grid units.' } }),
    w: schema.number({
      defaultValue: DEFAULT_PANEL_WIDTH,
      min: 1,
      max: DASHBOARD_GRID_COLUMN_COUNT,
      meta: {
        description:
          'The width of the panel in grid units. Minimum `1`, maximum `48`. Defaults to `24`.',
      },
    }),
    h: schema.number({
      defaultValue: DEFAULT_PANEL_HEIGHT,
      min: 1,
      meta: {
        description: 'The height of the panel in grid units. Minimum `1`. Defaults to `15`.',
      },
    }),
  },
  {
    meta: {
      id: 'kbn-dashboard-panel-grid',
      title: 'Panel grid',
      description: 'The position and size of the panel on the dashboard grid.',
    },
  }
);

export function getPanelSchema() {
  const basePanelProps = {
    grid: panelGridSchema,
    id: schema.maybe(
      schema.string({
        meta: { description: 'The unique ID of the panel.' },
      })
    ),
  };

  const embeddableSchemas = embeddableService ? embeddableService.getAllEmbeddableSchemas() : {};

  const panelSchemas = Object.entries(embeddableSchemas)
    // sort to ensure consistent order in OAS documenation
    .sort(([aType, { title: aTitle }], [bType, { title: bTitle }]) => aTitle.localeCompare(bTitle))
    .map(([type, { schema: configSchema, title }]) =>
      schema.object(
        {
          ...basePanelProps,
          type: schema.literal(type),
          config: configSchema,
        },
        {
          meta: {
            id: `kbn-dashboard-panel-type-${type}`,
            title,
          },
        }
      )
    );

  return schema.discriminatedUnion(
    'type',
    panelSchemas as [
      ObjectType<{
        grid: ObjectType<{ x: Type<number>; y: Type<number>; w: Type<number>; h: Type<number> }>;
        id: Type<string | undefined>;
        version: Type<string | undefined>;
        type: Type<string>;
        config: ObjectType<{}>;
      }>
    ]
  );
}

const sectionGridSchema = schema.object({
  y: schema.number({ meta: { description: 'The y coordinate of the section in grid units.' } }),
});

export function getSectionSchema() {
  return schema.object(
    {
      title: schema.string({
        meta: { description: 'The title of the section.' },
      }),
      collapsed: schema.boolean({
        meta: {
          description:
            'When `true`, the section is collapsed and its panels are not rendered until expanded. Useful for improving initial load time on large dashboards. Defaults to `false`.',
        },
        defaultValue: false,
      }),
      grid: sectionGridSchema,
      panels: schema.arrayOf(getPanelSchema(), {
        meta: { description: 'The panels that belong to the section.' },
        defaultValue: [],
        maxSize: MAX_PANELS,
      }),
      id: schema.maybe(
        schema.string({
          meta: { description: 'The unique ID of the section.' },
        })
      ),
    },
    {
      meta: {
        description: 'A collapsible group of panels.',
        id: 'kbn-dashboard-section',
        title: 'Section',
      },
    }
  );
}

export function getPinnedPanelsSchema(
  isDashboardAppRequest: boolean = false,
  isReadRequest: boolean = false
) {
  return isDashboardAppRequest && isReadRequest // looser route validation for dashboard application read requests
    ? (schema.arrayOf(
        schema.object(
          {},
          {
            unknowns: 'allow',
          }
        ),
        { maxSize: Number.MAX_SAFE_INTEGER }
      ) as unknown as ReturnType<typeof getControlsGroupSchema>) // keeps derived types happy
    : getControlsGroupSchema();
}

export const optionsSchema = schema.object(
  {
    auto_apply_filters: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.auto_apply_filters,
      meta: {
        description:
          "When `true`, control filter changes are applied automatically. When `false`, control filter changes are applied manually through the dashboard's search update button. Defaults to `true`.",
      },
    }),
    hide_panel_titles: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.hide_panel_titles,
      meta: { description: 'When `true`, panel titles are hidden. Defaults to `false`.' },
    }),
    hide_panel_borders: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.hide_panel_borders,
      meta: { description: 'When `true`, panel borders are hidden. Defaults to `false`.' },
    }),
    use_margins: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.use_margins,
      meta: { description: 'When `true`, panels are separated by a margin. Defaults to `true`.' },
    }),
    sync_colors: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.sync_colors,
      meta: {
        description:
          'When `true`, colors are synchronized across panels that share a data source. Defaults to `false`.',
      },
    }),
    sync_tooltips: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.sync_tooltips,
      meta: {
        description: 'When `true`, tooltips are synchronized across panels. Defaults to `false`.',
      },
    }),
    sync_cursor: schema.boolean({
      defaultValue: DEFAULT_DASHBOARD_OPTIONS.sync_cursor,
      meta: {
        description:
          'When `true`, the cursor position is synchronized across panels. Defaults to `true`.',
      },
    }),
  },
  {
    defaultValue: DEFAULT_DASHBOARD_OPTIONS,
    meta: {
      id: 'kbn-dashboard-options',
      title: 'Options',
      description: 'Display and behavior settings for the dashboard.',
    },
  }
);

export const accessControlSchema = schema.maybe(
  schema.object(
    {
      access_mode: schema.maybe(
        schema.oneOf([schema.literal('write_restricted'), schema.literal('default')], {
          meta: {
            description:
              'Controls edit access to the dashboard. Set to `write_restricted` to prevent edits by users without explicit write permission. Defaults to `default` (all viewers can edit).',
          },
        })
      ),
    },
    {
      meta: {
        description: 'Access control settings for the dashboard.',
        id: 'kbn-dashboard-access-control',
        title: 'Access control',
      },
    }
  )
);

export function getDashboardStateSchema(
  isDashboardAppRequest: boolean,
  isReadRequest: boolean = false
) {
  return schema.object(
    {
      pinned_panels: getPinnedPanelsSchema(isDashboardAppRequest, isReadRequest),
      description: schema.maybe(
        schema.string({
          meta: { description: 'A short description of the dashboard.' },
        })
      ),
      filters: schema.maybe(
        schema.arrayOf(asCodeFilterSchema, {
          maxSize: isDashboardAppRequest && isReadRequest ? Number.MAX_SAFE_INTEGER : 500,
          meta: {
            description: 'Filters applied across all panels, including pinned panels.',
          },
        })
      ),
      options: optionsSchema,
      panels: schema.arrayOf(
        isDashboardAppRequest // looser route validation for dashboard application requests
          ? (schema.object(
              {},
              {
                unknowns: 'allow',
              }
            ) as unknown as ReturnType<typeof getPanelSchema>) // keeps derived types happy
          : schema.oneOf([getPanelSchema(), getSectionSchema()]),
        {
          defaultValue: [],
          maxSize: isDashboardAppRequest && isReadRequest ? Number.MAX_SAFE_INTEGER : MAX_PANELS,
          meta: {
            description:
              'Panels and sections in the dashboard. Each entry is either a panel (with a `type` and `config`) or a collapsible section (with a `title`, `collapsed` state, and nested `panels`).',
          },
        }
      ),
      project_routing: schema.maybe(
        schema.string({
          meta: {
            description:
              'Controls [cross-project search](https://www.elastic.co/docs/explore-analyze/cross-project-search/cross-project-search-project-routing) behavior for this dashboard (Serverless only). Set to `_alias:_origin` to scope data to the current project, or `_alias:*` to search across all projects. When omitted, the space default applies.',
          },
        })
      ),
      query: schema.maybe(asCodeQuerySchema),
      refresh_interval: schema.maybe(refreshIntervalSchema),
      tags: getAsCodeTagsSchema(
        'Tag IDs to associate with this dashboard.',
        isDashboardAppRequest && isReadRequest ? Number.MAX_SAFE_INTEGER : undefined
      ),
      time_range: schema.maybe(timeRangeSchema),
      title: schema.string({
        minLength: 1,
        meta: { description: 'A human-readable title for the dashboard.' },
      }),
      access_control: accessControlSchema,
    },
    {
      meta: {
        id: isDashboardAppRequest ? 'kbn-dashboard-app-data' : 'kbn-dashboard-data',
      },
      validate: (dashboardState) => {
        if (isDashboardAppRequest) return;
        const panelCount = countPanels(dashboardState.panels);
        const allPanelCount = panelCount + (dashboardState.pinned_panels?.length ?? 0);
        return allPanelCount > MAX_PANELS
          ? `Dashboard contains ${allPanelCount} panels, pinned panels, and sections, which exceeds the maximum of ${MAX_PANELS}.`
          : undefined;
      },
    }
  );
}

function countPanels(panels: Array<DashboardPanel | DashboardSection>): number {
  let count = 0;
  for (const panel of panels) {
    if (isDashboardSection(panel)) {
      count++; // count the section itself as a panel
      count += countPanels(panel.panels);
    } else {
      count++;
    }
  }
  return count;
}
