/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { OPTIONS_LIST_CONTROL } from '@kbn/controls-constants';
import { DiscoverTabType, UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import {
  MAX_METRICS_TAB_DIMENSIONS,
  MAX_METRICS_TAB_STATE_STRING_LENGTH,
} from '@kbn/saved-search-plugin/common';
import {
  discoverSessionApiResponseSchema,
  discoverSessionApiDataSchema,
  type DiscoverSessionApiClassicTab,
  type DiscoverSessionApiEsqlTab,
  type DiscoverSessionApiMetricsTab,
} from './schema';

// Keep these values independent from the schema constants so contract changes require an explicit
// test update.
const CURRENT_API_LIMITS = {
  titleLength: 256,
  descriptionLength: 1000,
  tabLabelLength: 120,
  tabs: 25,
  breakdownFieldLength: 1000,
  visContextAttributeKeyLength: 256,
  columnOrder: 100,
  sort: 100,
  filters: 100,
  rowsPerPage: { min: 1, max: 10_000 },
  sampleSize: { min: 10, max: 10_000 },
  headerRowHeight: { min: 1, max: 5 },
  rowHeight: { min: 1, max: 20 },
  defaultRenderedNodes: { min: 10, max: 200 },
} as const;

const classicTab = {
  id: 'tab-classic',
  label: 'Logs',
  data_source: {
    type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
    ref_id: 'logs-data-view',
  },
  filters: [],
  sort: [],
  view_mode: 'documents',
  hide_chart: false,
  hide_table: false,
};

const esqlTab = {
  id: 'tab-esql',
  label: 'ES|QL',
  data_source: {
    type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
    query: 'FROM logs-* | LIMIT 10',
  },
  sort: [],
  hide_chart: false,
  hide_table: false,
};

const metricsTab = {
  ...esqlTab,
  type: DiscoverTabType.Metrics,
  dimensions: ['host.name'],
  search_term: 'cpu',
  counter_aggregation: 'max',
  gauge_aggregation: 'min',
  histogram_percentile: 'p99',
} as const;

const multiTabSessionData = {
  title: 'My Discover session',
  description: '',
  tabs: [classicTab, esqlTab],
};

describe('discoverSessionApiDataSchema', () => {
  it('validates a classic data view tab', () => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'Classic only',
      tabs: [classicTab],
    });

    const tab = validated.tabs[0] as DiscoverSessionApiClassicTab;

    expect(validated.tabs).toHaveLength(1);
    expect(tab.data_source.type).toBe(AS_CODE_DATA_VIEW_REFERENCE_TYPE);
    expect(tab.filters).toEqual([]);
    expect(tab.view_mode).toBe('documents');
  });

  it('validates an ES|QL tab', () => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'ES|QL only',
      tabs: [
        {
          ...esqlTab,
          rows_per_page: 25,
          sample_size: 500,
        },
      ],
    });

    const tab = validated.tabs[0] as DiscoverSessionApiEsqlTab;

    expect(tab.data_source.type).toBe(AS_CODE_ESQL_DATA_SOURCE_TYPE);
    expect(tab.data_source.query).toBe('FROM logs-* | LIMIT 10');
    expect(tab.rows_per_page).toBe(25);
    expect(tab.sample_size).toBe(500);
  });

  it('accepts plain string tab types in the exported TypeScript types', () => {
    const defaultType: DiscoverSessionApiClassicTab['type'] = 'default';
    const metricsType: DiscoverSessionApiMetricsTab['type'] = 'metrics';
    const validated = discoverSessionApiDataSchema.parse({
      title: 'String tab types',
      tabs: [
        { ...classicTab, type: defaultType },
        { ...metricsTab, type: metricsType },
      ],
    });

    expect(validated.tabs.map((tab) => tab.type)).toEqual(['default', 'metrics']);
  });

  it.each(['TS metrics-* | LIMIT 10', 'FROM custom-* | LIMIT 10'])(
    'preserves the metrics tab type regardless of the ES|QL query: %s',
    (query) => {
      const validated = discoverSessionApiDataSchema.parse({
        title: 'Metrics',
        tabs: [{ ...metricsTab, data_source: { ...esqlTab.data_source, query } }],
      });

      expect(validated.tabs[0]).toMatchObject({
        ...metricsTab,
        data_source: { ...esqlTab.data_source, query },
      });
    }
  );

  it.each([
    ['classic', classicTab],
    ['ES|QL', esqlTab],
    ['ES|QL TS', { ...esqlTab, data_source: { ...esqlTab.data_source, query: 'TS metrics-*' } }],
  ])('uses the default tab type when omitted from a %s tab', (_, tabInput) => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'Default tab type',
      tabs: [tabInput],
    });

    expect(validated.tabs[0].type).toBe(DiscoverTabType.Default);
  });

  it('rejects a metrics tab with a classic data source', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Invalid metrics data source',
        tabs: [{ ...metricsTab, data_source: classicTab.data_source }],
      })
    ).toThrow();
  });

  it.each([
    ['classic', classicTab],
    ['ES|QL', esqlTab],
    ['metrics', metricsTab],
  ])('rejects unknown properties on a %s tab', (_, tabInput) => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Unknown tab property',
        tabs: [{ ...tabInput, unknown_property: true }],
      })
    ).toThrow();
  });

  it('validates a multi-tab session', () => {
    const validated = discoverSessionApiDataSchema.parse(multiTabSessionData);

    expect(validated.tabs).toHaveLength(2);
    expect(validated.description).toBe('');

    for (const tab of validated.tabs) {
      expect(tab.documents_display_mode).toBeUndefined();
      expect(tab.hide_nulls).toBeUndefined();
      expect(tab.wrap_lines).toBeUndefined();
      expect(tab.default_rendered_nodes).toBeUndefined();
    }
  });

  it('validates tag IDs', () => {
    const validated = discoverSessionApiDataSchema.parse({
      ...multiTabSessionData,
      tags: ['tag-1', 'tag-2'],
    });

    expect(validated.tags).toEqual(['tag-1', 'tag-2']);
  });

  it('applies schema defaults for a fully qualified representation', () => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'Defaults',
      tabs: [classicTab],
    });

    const tab = validated.tabs[0] as DiscoverSessionApiClassicTab;

    expect(validated.description).toBe('');
    expect(tab.hide_chart).toBe(false);
    expect(tab.hide_table).toBe(false);
    expect(tab.sort).toEqual([]);
    expect(tab.filters).toEqual([]);
    expect(tab.view_mode).toBe('documents');
    expect(validated.tags).toEqual([]);
    expect(tab.density).toBeUndefined();
    expect(tab.header_row_height).toBeUndefined();
    expect(tab.control_panels).toBeUndefined();
  });

  it.each([DiscoverTabType.Default, undefined])(
    'rejects metrics state when the tab type is %s',
    (type) => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Invalid default tab',
          tabs: [{ ...metricsTab, type }],
        })
      ).toThrow();
    }
  );

  it.each([
    'dimensions',
    'search_term',
    'counter_aggregation',
    'gauge_aggregation',
    'histogram_percentile',
  ] as const)('rejects a metrics tab without %s', (field) => {
    const { [field]: _value, ...incompleteTab } = metricsTab;

    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Incomplete metrics tab',
        tabs: [incompleteTab],
      })
    ).toThrow();
  });

  it('rejects an unknown tab type', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Unknown tab type',
        tabs: [{ ...metricsTab, type: 'unknown' }],
      })
    ).toThrow();
  });

  it.each(['counter_aggregation', 'gauge_aggregation'] as const)(
    'rejects an unsupported metrics %s',
    (aggregation) => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Unsupported aggregation',
          tabs: [{ ...metricsTab, [aggregation]: 'median' }],
        })
      ).toThrow();
    }
  );

  it('rejects an unsupported metrics histogram percentile', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Unsupported histogram percentile',
        tabs: [{ ...metricsTab, histogram_percentile: 'p100' }],
      })
    ).toThrow();
  });

  it('rejects the removed time_restore API field', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Legacy time restore',
        tabs: [{ ...classicTab, time_restore: false }],
      })
    ).toThrow();
  });

  it('validates vis_context with opaque Lens attributes', () => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'With chart',
      tabs: [
        {
          ...classicTab,
          vis_context: {
            suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
            attributes: {
              visualizationType: 'lnsXY',
              state: { foo: 'bar' },
            },
          },
        },
      ],
    });

    expect(validated.tabs[0].vis_context).toEqual({
      suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
      attributes: {
        visualizationType: 'lnsXY',
        state: { foo: 'bar' },
      },
    });
  });

  it('rejects an invalid vis_context suggestion_type', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Invalid suggestion type',
        tabs: [
          {
            ...classicTab,
            vis_context: {
              suggestion_type: 'line',
              attributes: {
                visualizationType: 'lnsXY',
                state: { foo: 'bar' },
              },
            },
          },
        ],
      })
    ).toThrow();
  });

  it('rejects an empty vis_context object (use omission to indicate a cleared chart)', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Empty vis context',
        tabs: [
          {
            ...classicTab,
            vis_context: {},
          },
        ],
      })
    ).toThrow();
  });

  it('rejects vis_context request_data (inferred from tab fields at runtime)', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'With request_data',
        tabs: [
          {
            ...classicTab,
            breakdown_field: 'host.name',
            chart_interval: 'auto',
            vis_context: {
              suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
              request_data: {
                time_interval: 'auto',
                data_view_id: 'logs-data-view',
                time_field: '@timestamp',
                breakdown_field: 'host.name',
              },
              attributes: {
                visualizationType: 'lnsXY',
                state: { foo: 'bar' },
              },
            },
          },
        ],
      })
    ).toThrow();
  });

  it('rejects legacy stringified control group JSON', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Invalid controls',
        tabs: [
          {
            ...classicTab,
            controlGroupJson: '{"panel-1":{}}',
          },
        ],
      })
    ).toThrow();
  });

  it('rejects legacy flattened control panels map shape', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Invalid controls map',
        tabs: [
          {
            ...classicTab,
            control_panels: {
              'panel-1': {
                type: 'esql_control',
                order: 0,
                variable_name: 'foo',
                control_type: 'STATIC_VALUES',
                available_options: ['bar'],
              },
            },
          },
        ],
      })
    ).toThrow();
  });

  it('validates ES|QL control_panels', () => {
    const validated = discoverSessionApiDataSchema.parse({
      title: 'With controls',
      tabs: [
        {
          ...esqlTab,
          control_panels: [
            {
              type: 'esql_control',
              id: 'panel-1',
              config: {
                control_type: 'STATIC_VALUES',
                variable_name: 'foo',
                variable_type: 'values',
                available_options: ['bar', 'baz'],
                selected_options: ['bar'],
                single_select: true,
              },
            },
          ],
        },
      ],
    });

    expect(validated.tabs[0].control_panels).toEqual([
      {
        type: 'esql_control',
        id: 'panel-1',
        grow: false,
        width: 'medium',
        config: {
          control_type: 'STATIC_VALUES',
          variable_name: 'foo',
          variable_type: 'values',
          available_options: ['bar', 'baz'],
          selected_options: ['bar'],
          single_select: true,
        },
      },
    ]);
  });

  it('rejects non-ES|QL control_panels', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'With non-ESQL controls',
        tabs: [
          {
            ...esqlTab,
            control_panels: [
              {
                type: OPTIONS_LIST_CONTROL,
                id: 'panel-1',
                config: {
                  control_type: 'STATIC_VALUES',
                  variable_name: 'foo',
                  variable_type: 'values',
                  available_options: ['bar'],
                  selected_options: ['bar'],
                  single_select: true,
                },
              },
            ],
          },
        ],
      })
    ).toThrow();
  });

  it('rejects an invalid data source type', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Bad data source',
        tabs: [
          {
            ...classicTab,
            data_source: {
              type: 'invalid_type',
              ref_id: 'logs-data-view',
            },
          },
        ],
      })
    ).toThrow();
  });

  it('rejects an unsupported nested data_source shape', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Nested data source',
        tabs: [
          {
            ...classicTab,
            data_source: {
              data_view: {
                ref_id: 'logs-data-view',
              },
            },
          },
        ],
      })
    ).toThrow();
  });

  it('rejects duplicate tab ids', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Duplicate tabs',
        tabs: [
          classicTab,
          {
            ...esqlTab,
            id: classicTab.id,
          },
        ],
      })
    ).toThrow('tabs must have unique ids');
  });

  it('rejects duplicate control_panels ids', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Duplicate controls',
        tabs: [
          {
            ...esqlTab,
            control_panels: [
              {
                id: 'control-1',
                type: 'esql_control',
                width: 'medium',
                grow: false,
                config: {
                  control_type: 'STATIC_VALUES',
                  variable_name: 'foo',
                  variable_type: 'values',
                  available_options: ['bar'],
                  selected_options: ['bar'],
                  single_select: true,
                },
              },
              {
                id: 'control-1',
                type: 'esql_control',
                width: 'small',
                grow: true,
                config: {
                  control_type: 'STATIC_VALUES',
                  variable_name: 'baz',
                  variable_type: 'values',
                  available_options: ['qux'],
                  selected_options: ['qux'],
                  single_select: true,
                },
              },
            ],
          },
        ],
      })
    ).toThrow('control_panels must have unique ids');
  });

  it('rejects sessions with no tabs', () => {
    expect(() =>
      discoverSessionApiDataSchema.parse({
        title: 'Empty',
        tabs: [],
      })
    ).toThrow();
  });

  describe('size limits', () => {
    const repeat = (char: string, count: number) => char.repeat(count);

    it('rejects an empty title', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: '',
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('rejects a title that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: repeat('a', CURRENT_API_LIMITS.titleLength + 1),
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('accepts a title at the max length', () => {
      const validated = discoverSessionApiDataSchema.parse({
        title: repeat('a', CURRENT_API_LIMITS.titleLength),
        tabs: [classicTab],
      });

      expect(validated.title).toHaveLength(CURRENT_API_LIMITS.titleLength);
    });

    it('rejects a description that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          description: repeat('a', CURRENT_API_LIMITS.descriptionLength + 1),
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('accepts a description at the max length', () => {
      const validated = discoverSessionApiDataSchema.parse({
        title: 'Valid title',
        description: repeat('a', CURRENT_API_LIMITS.descriptionLength),
        tabs: [classicTab],
      });

      expect(validated.description).toHaveLength(CURRENT_API_LIMITS.descriptionLength);
    });

    it('rejects a metrics tab with too many dimensions', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Too many metrics dimensions',
          tabs: [
            {
              ...metricsTab,
              dimensions: new Array(MAX_METRICS_TAB_DIMENSIONS + 1).fill('host.name'),
            },
          ],
        })
      ).toThrow();
    });

    it('rejects an oversized metrics dimension', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Oversized metrics dimension',
          tabs: [
            {
              ...metricsTab,
              dimensions: [repeat('a', MAX_METRICS_TAB_STATE_STRING_LENGTH + 1)],
            },
          ],
        })
      ).toThrow();
    });

    it('rejects an oversized metrics search term', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Oversized metrics search term',
          tabs: [
            {
              ...metricsTab,
              search_term: repeat('a', MAX_METRICS_TAB_STATE_STRING_LENGTH + 1),
            },
          ],
        })
      ).toThrow();
    });

    it('rejects a tab label that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              label: repeat('a', CURRENT_API_LIMITS.tabLabelLength + 1),
            },
          ],
        })
      ).toThrow();
    });

    it('accepts a tab label at the max length', () => {
      const validated = discoverSessionApiDataSchema.parse({
        title: 'Valid title',
        tabs: [
          {
            ...classicTab,
            label: repeat('a', CURRENT_API_LIMITS.tabLabelLength),
          },
        ],
      });

      expect(validated.tabs[0].label).toHaveLength(CURRENT_API_LIMITS.tabLabelLength);
    });

    it.each([
      ['rows_per_page', CURRENT_API_LIMITS.rowsPerPage],
      ['sample_size', CURRENT_API_LIMITS.sampleSize],
      ['header_row_height', CURRENT_API_LIMITS.headerRowHeight],
      ['row_height', CURRENT_API_LIMITS.rowHeight],
      ['default_rendered_nodes', CURRENT_API_LIMITS.defaultRenderedNodes],
    ] as const)('pins the current %s range', (field, { min, max }) => {
      for (const value of [min, max]) {
        expect(() =>
          discoverSessionApiDataSchema.parse({
            title: 'Valid title',
            tabs: [{ ...classicTab, [field]: value }],
          })
        ).not.toThrow();
      }

      for (const value of [min - 1, max + 1]) {
        expect(() =>
          discoverSessionApiDataSchema.parse({
            title: 'Valid title',
            tabs: [{ ...classicTab, [field]: value }],
          })
        ).toThrow();
      }
    });

    it.each([
      {
        field: 'column_order',
        max: CURRENT_API_LIMITS.columnOrder,
        buildValue: (size: number) => Array.from({ length: size }, (_, index) => `field-${index}`),
      },
      {
        field: 'sort',
        max: CURRENT_API_LIMITS.sort,
        buildValue: (size: number) =>
          Array.from({ length: size }, (_, index) => ({
            name: `field-${index}`,
            direction: 'asc',
          })),
      },
      {
        field: 'filters',
        max: CURRENT_API_LIMITS.filters,
        buildValue: (size: number) =>
          Array.from({ length: size }, (_, index) => ({
            type: 'condition',
            condition: {
              field: `field-${index}`,
              operator: 'exists',
            },
          })),
      },
    ])('pins the current $field size limit', ({ field, max, buildValue }) => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [{ ...classicTab, [field]: buildValue(max) }],
        })
      ).not.toThrow();

      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [{ ...classicTab, [field]: buildValue(max + 1) }],
        })
      ).toThrow();
    });

    it('pins the current session tab limit', () => {
      const buildTabs = (size: number) =>
        Array.from({ length: size }, (_, index) => ({
          ...classicTab,
          id: `tab-${index}`,
        }));

      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: buildTabs(CURRENT_API_LIMITS.tabs),
        })
      ).not.toThrow();

      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: buildTabs(CURRENT_API_LIMITS.tabs + 1),
        })
      ).toThrow();
    });

    it('rejects an unsupported chart_interval option', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              chart_interval: '10m',
            },
          ],
        })
      ).toThrow();
    });

    it('accepts supported chart_interval options', () => {
      for (const chartInterval of ['auto', 'ms', 's', 'm', 'h', 'd', 'w', 'M', 'y']) {
        const validated = discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              chart_interval: chartInterval,
            },
          ],
        });

        expect(validated.tabs[0].chart_interval).toBe(chartInterval);
      }
    });

    it('rejects a breakdown_field that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              breakdown_field: repeat('a', CURRENT_API_LIMITS.breakdownFieldLength + 1),
            },
          ],
        })
      ).toThrow();
    });

    it('accepts a breakdown_field at the max length', () => {
      const validated = discoverSessionApiDataSchema.parse({
        title: 'Valid title',
        tabs: [
          {
            ...classicTab,
            breakdown_field: repeat('a', CURRENT_API_LIMITS.breakdownFieldLength),
          },
        ],
      });

      expect(validated.tabs[0].breakdown_field).toHaveLength(
        CURRENT_API_LIMITS.breakdownFieldLength
      );
    });

    it('rejects a vis_context attribute key that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.parse({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              vis_context: {
                suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
                attributes: {
                  [repeat('a', CURRENT_API_LIMITS.visContextAttributeKeyLength + 1)]: {
                    foo: 'bar',
                  },
                },
              },
            },
          ],
        })
      ).toThrow();
    });

    it('accepts a vis_context attribute key at the max length', () => {
      const key = repeat('a', CURRENT_API_LIMITS.visContextAttributeKeyLength);
      const validated = discoverSessionApiDataSchema.parse({
        title: 'Valid title',
        tabs: [
          {
            ...classicTab,
            vis_context: {
              suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
              attributes: { [key]: { foo: 'bar' } },
            },
          },
        ],
      });

      expect(validated.tabs[0].vis_context?.attributes).toHaveProperty(key);
    });
  });
});

describe('discoverSessionApiResponseSchema', () => {
  it('validates the standard as-code API envelope', () => {
    const validated = discoverSessionApiResponseSchema.parse({
      id: 'session-id',
      data: multiTabSessionData,
      meta: {
        created_at: '2026-04-27T00:00:00.000Z',
        updated_at: '2026-04-27T00:00:00.000Z',
        version: 'WzEsMV0=',
      },
    });

    expect(validated.id).toBe('session-id');
    expect(validated.data.tabs).toHaveLength(2);
    expect(validated.meta.version).toBe('WzEsMV0=');
  });
});
