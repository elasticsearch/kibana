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
import { UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import {
  discoverSessionApiRequestBodySchema,
  discoverSessionApiResponseSchema,
  discoverSessionApiDataSchema,
  MAX_BREAKDOWN_FIELD_LENGTH,
  MAX_SESSION_DESCRIPTION_LENGTH,
  MAX_SESSION_TITLE_LENGTH,
  MAX_TAB_LABEL_LENGTH,
  MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH,
  type DiscoverSessionApiClassicTab,
  type DiscoverSessionApiEsqlTab,
} from './schema';

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
  time_restore: false,
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
  time_restore: false,
};

const multiTabSessionData = {
  title: 'My Discover session',
  description: '',
  tabs: [classicTab, esqlTab],
};

describe('discoverSessionApiDataSchema', () => {
  it('validates a classic data view tab', () => {
    const validated = discoverSessionApiDataSchema.validate({
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
    const validated = discoverSessionApiDataSchema.validate({
      title: 'ES|QL only',
      tabs: [esqlTab],
    });

    const tab = validated.tabs[0] as DiscoverSessionApiEsqlTab;

    expect(tab.data_source.type).toBe(AS_CODE_ESQL_DATA_SOURCE_TYPE);
    expect(tab.data_source.query).toBe('FROM logs-* | LIMIT 10');
  });

  it('validates a multi-tab session', () => {
    const validated = discoverSessionApiDataSchema.validate(multiTabSessionData);

    expect(validated.tabs).toHaveLength(2);
    expect(validated.description).toBe('');
  });

  it('applies schema defaults for a fully qualified representation', () => {
    const validated = discoverSessionApiDataSchema.validate({
      title: 'Defaults',
      tabs: [classicTab],
    });

    const tab = validated.tabs[0] as DiscoverSessionApiClassicTab;

    expect(tab.hide_chart).toBe(false);
    expect(tab.hide_table).toBe(false);
    expect(tab.time_restore).toBe(false);
    expect(tab.sort).toEqual([]);
    expect(tab.filters).toEqual([]);
    expect(tab.view_mode).toBe('documents');
  });

  it('validates vis_context with opaque Lens attributes', () => {
    const validated = discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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

  it('validates control_panels using the controls group array schema', () => {
    const validated = discoverSessionApiDataSchema.validate({
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

  it('rejects an invalid data source type', () => {
    expect(() =>
      discoverSessionApiDataSchema.validate({
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
      discoverSessionApiDataSchema.validate({
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

  it('rejects sessions with no tabs', () => {
    expect(() =>
      discoverSessionApiDataSchema.validate({
        title: 'Empty',
        tabs: [],
      })
    ).toThrow();
  });

  describe('size limits', () => {
    const repeat = (char: string, count: number) => char.repeat(count);

    it('rejects an empty title', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
          title: '',
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('rejects a title that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
          title: repeat('a', MAX_SESSION_TITLE_LENGTH + 1),
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('accepts a title at the max length', () => {
      const validated = discoverSessionApiDataSchema.validate({
        title: repeat('a', MAX_SESSION_TITLE_LENGTH),
        tabs: [classicTab],
      });

      expect(validated.title).toHaveLength(MAX_SESSION_TITLE_LENGTH);
    });

    it('rejects a description that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
          title: 'Valid title',
          description: repeat('a', MAX_SESSION_DESCRIPTION_LENGTH + 1),
          tabs: [classicTab],
        })
      ).toThrow();
    });

    it('accepts a description at the max length', () => {
      const validated = discoverSessionApiDataSchema.validate({
        title: 'Valid title',
        description: repeat('a', MAX_SESSION_DESCRIPTION_LENGTH),
        tabs: [classicTab],
      });

      expect(validated.description).toHaveLength(MAX_SESSION_DESCRIPTION_LENGTH);
    });

    it('rejects a tab label that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              label: repeat('a', MAX_TAB_LABEL_LENGTH + 1),
            },
          ],
        })
      ).toThrow();
    });

    it('rejects an unsupported chart_interval option', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
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
        const validated = discoverSessionApiDataSchema.validate({
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
        discoverSessionApiDataSchema.validate({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              breakdown_field: repeat('a', MAX_BREAKDOWN_FIELD_LENGTH + 1),
            },
          ],
        })
      ).toThrow();
    });

    it('rejects a vis_context attribute key that exceeds the max length', () => {
      expect(() =>
        discoverSessionApiDataSchema.validate({
          title: 'Valid title',
          tabs: [
            {
              ...classicTab,
              vis_context: {
                suggestion_type: UnifiedHistogramSuggestionType.histogramForDataView,
                attributes: {
                  [repeat('a', MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH + 1)]: {
                    foo: 'bar',
                  },
                },
              },
            },
          ],
        })
      ).toThrow();
    });
  });
});

describe('discoverSessionApiResponseSchema', () => {
  it('validates the standard as-code API envelope', () => {
    const validated = discoverSessionApiResponseSchema.validate({
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

describe('discoverSessionApiRequestBodySchema', () => {
  it('validates create/update request bodies', () => {
    const validated = discoverSessionApiRequestBodySchema.validate({
      data: multiTabSessionData,
    });

    expect(validated.data.title).toBe('My Discover session');
  });
});
