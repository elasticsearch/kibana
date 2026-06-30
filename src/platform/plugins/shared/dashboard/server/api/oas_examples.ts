/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * This is a big file used for documenting/introspecting APIs. Always load it lazily!
 */

import type { DeepPartial } from '@kbn/utility-types';

import { ControlValuesSource } from '@kbn/controls-constants';
import type { DashboardState } from './types';
import type { DashboardCreateResponseBody } from './create';
import type { DashboardReadResponseBody } from './read';
import type { DashboardSearchResponseBody } from './search';
import type { DashboardUpdateResponseBody } from './update';

const dashboardCreateDescription =
  'Creates a new dashboard and returns its ID, full state, and metadata.';

const createCurlCodeSample = ({
  lang = 'cURL',
  label,
  method,
  path,
  body,
}: {
  lang?: string;
  label: string;
  method: 'POST' | 'PUT';
  path: string;
  body: object;
}) => ({
  lang,
  label,
  source:
    [
      `curl -X ${method} "\${KIBANA_URL}${path}" \\`,
      `  -H "Authorization: ApiKey \${API_KEY}" \\`,
      `  -H "kbn-xsrf: true" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify(body, null, 2)}'`,
    ].join('\n') + '\n',
});

const createConsoleCodeSample = ({
  lang = 'Console',
  label,
  method,
  path,
  body,
}: {
  lang?: string;
  label: string;
  method: 'POST' | 'PUT';
  path: string;
  body: object;
}) => ({
  lang,
  label,
  source: [`${method} kbn:${path}`, JSON.stringify(body, null, 2)].join('\n') + '\n',
});

const dashboardCreateSimpleBody = {
  title: 'Web logs overview',
  access_control: {
    access_mode: 'write_restricted',
  },
  panels: [
    {
      grid: {
        x: 0,
        y: 0,
        w: 24,
        h: 15,
      },
      type: 'markdown',
      config: {
        content:
          '## Web logs overview\n' +
          '\n' +
          '&nbsp;\n' +
          '\n' +
          'Created with the [Dashboards API](https://www.elastic.co/docs/api/doc/kibana) using the Kibana sample web logs dataset (`kibana_sample_data_logs`). Contains:\n' +
          '- This markdown panel\n' +
          '- 2 metrics, showing request count and average response size\n' +
          '- A line chart based on an ES|QL query\n' +
          '\n' +
          '&nbsp;\n' +
          '\n' +
          '&nbsp;\n' +
          '\n' +
          '[Learn more about dashboards](https://www.elastic.co/docs/explore-analyze/dashboards)',
      },
    },
    {
      grid: {
        x: 24,
        y: 0,
        w: 12,
        h: 5,
      },
      type: 'vis',
      config: {
        type: 'metric',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        metrics: [
          {
            type: 'primary',
            operation: 'count',
          },
        ],
      },
    },
    {
      grid: {
        x: 36,
        y: 0,
        w: 12,
        h: 5,
      },
      type: 'vis',
      config: {
        type: 'metric',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        metrics: [
          {
            type: 'primary',
            operation: 'average',
            field: 'bytes',
          },
        ],
      },
    },
    {
      grid: {
        x: 24,
        y: 5,
        w: 24,
        h: 10,
      },
      type: 'vis',
      config: {
        type: 'xy',
        title: 'Requests over time',
        layers: [
          {
            type: 'line',
            data_source: {
              type: 'esql',
              query:
                'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
            },
            x: {
              column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
            },
            y: [
              {
                column: 'count',
              },
            ],
          },
        ],
        axis: {
          x: {
            title: {
              visible: false,
            },
          },
        },
      },
    },
  ],
} satisfies DeepPartial<DashboardState>;

const dashboardCreateSimpleConsoleBody = {
  title: dashboardCreateSimpleBody.title,
  panels: dashboardCreateSimpleBody.panels,
} satisfies DeepPartial<DashboardState>;

const dashboardCreateWithSectionsAndControlsBody = {
  title: 'Operations overview',
  time_range: {
    from: 'now-7d',
    to: 'now',
  },
  pinned_panels: [
    {
      type: 'options_list_control',
      width: 'medium',
      grow: true,
      config: {
        title: 'Response code',
        data_view_id: '90943e30-9a47-11e8-b64d-95841ca0b247',
        field_name: 'response.keyword',
      },
    },
  ],
  panels: [
    {
      title: 'Key metrics',
      collapsed: false,
      grid: {
        y: 0,
      },
      panels: [
        {
          grid: {
            x: 0,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'count',
              },
            ],
          },
        },
        {
          grid: {
            x: 12,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'average',
                field: 'bytes',
              },
            ],
          },
        },
      ],
    },
    {
      title: 'Traffic trends',
      collapsed: false,
      grid: {
        y: 8,
      },
      panels: [
        {
          grid: {
            x: 0,
            y: 0,
            w: 24,
            h: 10,
          },
          type: 'vis',
          config: {
            type: 'xy',
            title: 'Requests over time',
            layers: [
              {
                type: 'line',
                data_source: {
                  type: 'data_view_spec',
                  index_pattern: 'kibana_sample_data_logs',
                  time_field: 'timestamp',
                },
                x: {
                  operation: 'date_histogram',
                  field: 'timestamp',
                },
                y: [
                  {
                    operation: 'count',
                  },
                ],
              },
            ],
            axis: {
              x: {
                title: {
                  visible: false,
                },
              },
            },
          },
        },
        {
          grid: {
            x: 24,
            y: 0,
            w: 24,
            h: 10,
          },
          type: 'vis',
          config: {
            type: 'xy',
            title: 'Requests over time (ES|QL)',
            layers: [
              {
                type: 'line',
                data_source: {
                  type: 'esql',
                  query:
                    'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                x: {
                  column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                y: [
                  {
                    column: 'count',
                  },
                ],
              },
            ],
            axis: {
              x: {
                title: {
                  visible: false,
                },
              },
            },
          },
        },
      ],
    },
  ],
} satisfies DeepPartial<DashboardState>;

const dashboardUpdateBody = {
  title: 'Web logs overview',
  panels: [
    {
      grid: {
        x: 0,
        y: 0,
        w: 12,
        h: 5,
      },
      type: 'vis',
      config: {
        type: 'metric',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        metrics: [
          {
            type: 'primary',
            operation: 'count',
          },
        ],
      },
    },
    {
      grid: {
        x: 12,
        y: 0,
        w: 12,
        h: 5,
      },
      type: 'vis',
      config: {
        type: 'metric',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        metrics: [
          {
            type: 'primary',
            operation: 'average',
            field: 'bytes',
          },
        ],
      },
    },
    {
      grid: {
        x: 0,
        y: 8,
        w: 24,
        h: 10,
      },
      type: 'vis',
      config: {
        type: 'xy',
        title: 'Requests over time',
        layers: [
          {
            type: 'line',
            data_source: {
              type: 'esql',
              query:
                'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
            },
            x: {
              column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
            },
            y: [
              {
                column: 'count',
              },
            ],
          },
        ],
        axis: {
          x: {
            title: {
              visible: false,
            },
          },
        },
      },
    },
    {
      grid: {
        x: 24,
        y: 8,
        w: 12,
        h: 5,
      },
      type: 'vis',
      config: {
        type: 'metric',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        metrics: [
          {
            type: 'primary',
            operation: 'unique_count',
            field: 'clientip',
          },
        ],
      },
    },
  ],
} satisfies DeepPartial<DashboardState>;

const dashboardCreateCodeSamples = [
  createCurlCodeSample({
    lang: 'cURL_simple',
    label: 'Create a dashboard (simple) - cURL',
    method: 'POST',
    path: '/api/dashboards',
    body: dashboardCreateSimpleBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_simple',
    label: 'Create a dashboard (simple) - Console',
    method: 'POST',
    path: '/api/dashboards',
    body: dashboardCreateSimpleConsoleBody,
  }),
  createCurlCodeSample({
    lang: 'cURL_Sections',
    label: 'Create a dashboard (with sections and controls) - cURL',
    method: 'POST',
    path: '/api/dashboards',
    body: dashboardCreateWithSectionsAndControlsBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_sections',
    label: 'Create a dashboard (with sections and controls) - Console',
    method: 'POST',
    path: '/api/dashboards',
    body: dashboardCreateWithSectionsAndControlsBody,
  }),
];

const dashboardSearchCodeSamples = [
  {
    lang: 'cURL',
    label: 'Search dashboards - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/dashboards?query=web+logs&per_page=10" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Search dashboards - Console',
    source: 'GET kbn:/api/dashboards?query=web+logs&per_page=10\n',
  },
];

const dashboardReadCodeSamples = [
  {
    lang: 'cURL',
    label: 'Get a dashboard - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Get a dashboard - Console',
    source: 'GET kbn:/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b\n',
  },
];

const dashboardUpdateDescription =
  'Creates a new dashboard with the given ID if none exists, or replaces the complete state of an\n' +
  'existing one.\n' +
  '\n' +
  '> warn\n' +
  '> This is a full replacement. Any panels not included in the request body are permanently\n' +
  '> removed. To make targeted changes, retrieve the current state first with\n' +
  '> GET /api/dashboards/{id}, apply your changes, and submit the full updated object.\n' +
  '\n' +
  'You can optionally include `access_control.access_mode` to change the dashboard access mode.\n' +
  'If the authenticated user is not authorized to change access mode for the target dashboard,\n' +
  'the request returns a `403` response with a descriptive `message`.\n';

const dashboardUpdateCodeSamples = [
  createCurlCodeSample({
    label: 'Update a dashboard - cURL',
    method: 'PUT',
    path: '/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
    body: dashboardUpdateBody,
  }),
  createConsoleCodeSample({
    label: 'Update a dashboard - Console',
    method: 'PUT',
    path: '/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
    body: dashboardUpdateBody,
  }),
];

const dashboardDeleteCodeSamples = [
  {
    lang: 'cURL',
    label: 'Delete a dashboard - cURL',
    source:
      'curl -X DELETE "${KIBANA_URL}/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
      '  -H "kbn-xsrf: true"\n',
  },
  {
    lang: 'Console',
    label: 'Delete a dashboard - Console',
    source: 'DELETE kbn:/api/dashboards/3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b\n',
  },
];

const dashboardCreateRequestExamples = {
  createDashboard: {
    summary: 'Create a simple dashboard',
    value: {
      title: 'Web logs overview',
      panels: [
        {
          grid: {
            x: 0,
            y: 0,
            w: 24,
            h: 15,
          },
          type: 'markdown',
          config: {
            content:
              '## Web logs overview\n' +
              '\n' +
              '&nbsp;\n' +
              '\n' +
              'Created with the [Dashboards API](https://www.elastic.co/docs/api/doc/kibana) using the Kibana sample web logs dataset (`kibana_sample_data_logs`). Contains:\n' +
              '- This markdown panel\n' +
              '- 2 metrics, showing request count and average response size\n' +
              '- A line chart based on an ES|QL query\n' +
              '\n' +
              '&nbsp;\n' +
              '\n' +
              '&nbsp;\n' +
              '\n' +
              '[Learn more about dashboards](https://www.elastic.co/docs/explore-analyze/dashboards)',
          },
        },
        {
          grid: {
            x: 24,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'count',
              },
            ],
          },
        },
        {
          grid: {
            x: 36,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'average',
                field: 'bytes',
              },
            ],
          },
        },
        {
          grid: {
            x: 24,
            y: 5,
            w: 24,
            h: 10,
          },
          type: 'vis',
          config: {
            type: 'xy',
            title: 'Requests over time',
            layers: [
              {
                type: 'line',
                data_source: {
                  type: 'esql',
                  query:
                    'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                x: {
                  column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                y: [
                  {
                    column: 'count',
                  },
                ],
              },
            ],
            axis: {
              x: {
                title: {
                  visible: false,
                },
              },
            },
          },
        },
      ],
    } satisfies Partial<DashboardState>,
  },
  createDashboardWithSectionsAndControls: {
    summary: 'Create a dashboard with sections and controls',
    value: {
      title: 'Operations overview',
      time_range: {
        from: 'now-7d',
        to: 'now',
      },
      pinned_panels: [
        {
          type: 'options_list_control',
          width: 'medium',
          grow: true,
          config: {
            title: 'Response code',
            data_view_id: '90943e30-9a47-11e8-b64d-95841ca0b247',
            field_name: 'response.keyword',
            values_source: ControlValuesSource.FIELD,
            use_global_filters: true,
            ignore_validations: false,
            exclude: false,
            exists_selected: false,
            run_past_timeout: false,
            search_technique: 'prefix',
            selected_options: [],
            single_select: false,
            sort: {
              by: '_count',
              direction: 'desc',
            },
          },
        },
      ],
      panels: [
        {
          title: 'Key metrics',
          collapsed: false,
          grid: {
            y: 0,
          },
          panels: [
            {
              grid: {
                x: 0,
                y: 0,
                w: 12,
                h: 5,
              },
              type: 'vis',
              config: {
                type: 'metric',
                data_source: {
                  type: 'data_view_spec',
                  index_pattern: 'kibana_sample_data_logs',
                  time_field: 'timestamp',
                },
                metrics: [
                  {
                    type: 'primary',
                    operation: 'count',
                  },
                ],
              },
            },
            {
              grid: {
                x: 12,
                y: 0,
                w: 12,
                h: 5,
              },
              type: 'vis',
              config: {
                type: 'metric',
                data_source: {
                  type: 'data_view_spec',
                  index_pattern: 'kibana_sample_data_logs',
                  time_field: 'timestamp',
                },
                metrics: [
                  {
                    type: 'primary',
                    operation: 'average',
                    field: 'bytes',
                  },
                ],
              },
            },
          ],
        },
        {
          title: 'Traffic trends',
          collapsed: false,
          grid: {
            y: 8,
          },
          panels: [
            {
              grid: {
                x: 0,
                y: 0,
                w: 24,
                h: 10,
              },
              type: 'vis',
              config: {
                type: 'xy',
                title: 'Requests over time',
                layers: [
                  {
                    type: 'line',
                    data_source: {
                      type: 'data_view_spec',
                      index_pattern: 'kibana_sample_data_logs',
                      time_field: 'timestamp',
                    },
                    x: {
                      operation: 'date_histogram',
                      field: 'timestamp',
                    },
                    y: [
                      {
                        operation: 'count',
                      },
                    ],
                  },
                ],
                axis: {
                  x: {
                    title: {
                      visible: false,
                    },
                  },
                },
              },
            },
            {
              grid: {
                x: 24,
                y: 0,
                w: 24,
                h: 10,
              },
              type: 'vis',
              config: {
                type: 'xy',
                title: 'Requests over time (ES|QL)',
                layers: [
                  {
                    type: 'line',
                    data_source: {
                      type: 'esql',
                      query:
                        'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                    },
                    x: {
                      column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                    },
                    y: [
                      {
                        column: 'count',
                      },
                    ],
                  },
                ],
                axis: {
                  x: {
                    title: {
                      visible: false,
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    } satisfies Partial<DashboardState>,
  },
};

const dashboardUpdateRequestExamples = {
  updateDashboard: {
    summary: 'Update a dashboard',
    value: {
      title: 'Web logs overview',
      panels: [
        {
          grid: {
            x: 0,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'count',
              },
            ],
          },
        },
        {
          grid: {
            x: 12,
            y: 0,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'average',
                field: 'bytes',
              },
            ],
          },
        },
        {
          grid: {
            x: 0,
            y: 8,
            w: 24,
            h: 10,
          },
          type: 'vis',
          config: {
            type: 'xy',
            title: 'Requests over time',
            layers: [
              {
                type: 'line',
                data_source: {
                  type: 'esql',
                  query:
                    'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                x: {
                  column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                },
                y: [
                  {
                    column: 'count',
                  },
                ],
              },
            ],
            axis: {
              x: {
                title: {
                  visible: false,
                },
              },
            },
          },
        },
        {
          grid: {
            x: 24,
            y: 8,
            w: 12,
            h: 5,
          },
          type: 'vis',
          config: {
            type: 'metric',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            metrics: [
              {
                type: 'primary',
                operation: 'unique_count',
                field: 'clientip',
              },
            ],
          },
        },
      ],
    } satisfies Partial<DashboardState>,
  },
};

const dashboardCreateResponseExamples = {
  createDashboardResponse: {
    summary: 'Create dashboard response',
    description:
      'Response to creating a dashboard. Returns the generated ID, the full dashboard state in `data`, and metadata. Default option values are always returned even when not explicitly set in the request. Panel `id` values are generated automatically.\n',
    value: {
      id: '3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
      data: {
        options: {
          hide_panel_titles: false,
          hide_panel_borders: false,
          use_margins: true,
          auto_apply_filters: true,
          sync_colors: false,
          sync_cursor: true,
          sync_tooltips: false,
        },
        panels: [
          {
            grid: {
              x: 0,
              y: 0,
              w: 24,
              h: 15,
            },
            config: {
              content: '## Web logs overview',
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000001',
            type: 'markdown',
          },
          {
            grid: {
              x: 24,
              y: 0,
              w: 12,
              h: 5,
            },
            config: {
              title: '',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'count',
                  empty_as_null: false,
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000002',
            type: 'vis',
          },
          {
            grid: {
              x: 36,
              y: 0,
              w: 12,
              h: 5,
            },
            config: {
              title: '',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'average',
                  field: 'bytes',
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000003',
            type: 'vis',
          },
          {
            grid: {
              x: 24,
              y: 5,
              w: 24,
              h: 10,
            },
            config: {
              title: 'Requests over time',
              type: 'xy',
              layers: [
                {
                  type: 'line',
                  data_source: {
                    type: 'esql',
                    query:
                      'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  sampling: 1,
                  ignore_global_filters: false,
                  x: {
                    column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  y: [
                    {
                      column: 'count',
                      axis_id: 'y',
                    },
                  ],
                },
              ],
              axis: {
                x: {
                  title: {
                    visible: false,
                  },
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'fit',
                    rounding: false,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                  scale: 'ordinal',
                },
                y: {
                  anchor: 'start',
                  title: {
                    visible: true,
                  },
                  scale: 'linear',
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'full',
                    rounding: true,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                },
              },
              styling: {
                overlays: {
                  partial_buckets: {
                    visible: false,
                  },
                  current_time_marker: {
                    visible: false,
                  },
                },
                interpolation: 'linear',
                points: {
                  visibility: 'auto',
                },
              },
              legend: {
                visibility: 'hidden',
                placement: 'outside',
                position: 'right',
                layout: {
                  type: 'grid',
                  truncate: {
                    max_lines: 1,
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000003',
            type: 'vis',
          },
        ],
        pinned_panels: [],
        access_control: {
          access_mode: 'write_restricted',
        },
        title: 'Web logs overview',
      },
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzEwMiwxXQ==',
      },
    } satisfies DashboardCreateResponseBody,
  },
};

const dashboardSearchResponseExamples = {
  searchDashboardsResponse: {
    summary: 'Search dashboards response',
    description:
      'Paginated list of dashboard summaries. Each item includes the ID, a subset of dashboard state fields (`title`, `time_range` if set), and metadata. Full panel content is not included - use the GET endpoint to retrieve a specific dashboard.\n',
    value: {
      data: [
        {
          id: '3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
          data: {
            title: 'Web logs overview',
          },
          meta: {
            created_at: '2026-04-13T10:00:00.000Z',
            managed: false,
            updated_at: '2026-04-13T10:00:00.000Z',
            version: 'WzEwMiwxXQ==',
          },
        },
        {
          id: '7f2a1c40-e83b-11ef-a641-7d5b3f9e1c2a',
          data: {
            time_range: {
              from: 'now-7d',
              to: 'now',
            },
            title: 'Operations overview',
          },
          meta: {
            created_at: '2026-04-12T08:00:00.000Z',
            managed: false,
            updated_at: '2026-04-12T14:22:00.000Z',
            version: 'WzEwMSwxXQ==',
          },
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 2,
      },
    } satisfies DashboardSearchResponseBody,
  },
};

const dashboardReadResponseExamples = {
  getDashboardResponse: {
    summary: 'Get dashboard response',
    description: 'The full dashboard state including all panels, options, and metadata.\n',
    value: {
      id: '3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
      data: {
        options: {
          hide_panel_titles: false,
          hide_panel_borders: false,
          use_margins: true,
          auto_apply_filters: true,
          sync_colors: false,
          sync_cursor: true,
          sync_tooltips: false,
        },
        title: 'Web logs overview',
        panels: [
          {
            grid: {
              x: 0,
              y: 0,
              w: 12,
              h: 8,
            },
            config: {
              title: 'Total requests',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'count',
                  empty_as_null: false,
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000001',
            type: 'vis',
          },
          {
            grid: {
              x: 12,
              y: 0,
              w: 12,
              h: 8,
            },
            config: {
              title: 'Average response size',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'average',
                  field: 'bytes',
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000002',
            type: 'vis',
          },
          {
            grid: {
              x: 0,
              y: 15,
              w: 24,
              h: 10,
            },
            config: {
              title: 'Requests over time',
              type: 'xy',
              layers: [
                {
                  type: 'line',
                  data_source: {
                    type: 'esql',
                    query:
                      'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  sampling: 1,
                  ignore_global_filters: false,
                  x: {
                    column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  y: [
                    {
                      column: 'count',
                      axis_id: 'y',
                    },
                  ],
                },
              ],
              axis: {
                x: {
                  title: {
                    visible: false,
                  },
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'fit',
                    rounding: false,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                  scale: 'ordinal',
                },
                y: {
                  anchor: 'start',
                  title: {
                    visible: true,
                  },
                  scale: 'linear',
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'full',
                    rounding: true,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                },
              },
              styling: {
                overlays: {
                  partial_buckets: {
                    visible: false,
                  },
                  current_time_marker: {
                    visible: false,
                  },
                },
                interpolation: 'linear',
                points: {
                  visibility: 'auto',
                },
              },
              legend: {
                visibility: 'hidden',
                placement: 'outside',
                position: 'right',
                layout: {
                  type: 'grid',
                  truncate: {
                    max_lines: 1,
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000003',
            type: 'vis',
          },
        ],
        pinned_panels: [],
      },
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzEwMiwxXQ==',
      },
    } satisfies DashboardReadResponseBody,
  },
};

const dashboardUpdateResponseExamples = {
  updateDashboardResponse: {
    summary: 'Update dashboard response',
    description:
      'The complete updated dashboard state after a full replacement. Note that `meta.created_at` is not returned in update responses - use the GET endpoint to retrieve it.\n',
    value: {
      id: '3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
      data: {
        options: {
          hide_panel_titles: false,
          hide_panel_borders: false,
          use_margins: true,
          auto_apply_filters: true,
          sync_colors: false,
          sync_cursor: true,
          sync_tooltips: false,
        },
        panels: [
          {
            grid: {
              x: 0,
              y: 0,
              w: 24,
              h: 15,
            },
            config: {
              content:
                '## Web logs overview\n' +
                '\n' +
                '&nbsp;\n' +
                '\n' +
                'Created with the [Dashboards API](https://www.elastic.co/docs/api/doc/kibana) using the Kibana sample web logs dataset (`kibana_sample_data_logs`). Contains:\n' +
                '- This markdown panel\n' +
                '- 2 metrics, showing request count and average response size\n' +
                '- A line chart based on an ES|QL query\n' +
                '\n' +
                '&nbsp;\n' +
                '\n' +
                '&nbsp;\n' +
                '\n' +
                '[Learn more about dashboards](https://www.elastic.co/docs/explore-analyze/dashboards)',
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000001',
            type: 'markdown',
          },
          {
            grid: {
              x: 24,
              y: 0,
              w: 12,
              h: 5,
            },
            config: {
              title: '',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'count',
                  empty_as_null: false,
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000002',
            type: 'vis',
          },
          {
            grid: {
              x: 36,
              y: 0,
              w: 12,
              h: 5,
            },
            config: {
              title: '',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'average',
                  field: 'bytes',
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000003',
            type: 'vis',
          },
          {
            grid: {
              x: 24,
              y: 5,
              w: 24,
              h: 10,
            },
            config: {
              title: 'Requests over time',
              type: 'xy',
              layers: [
                {
                  type: 'line',
                  data_source: {
                    type: 'esql',
                    query:
                      'FROM kibana_sample_data_logs | STATS count = COUNT() BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  sampling: 1,
                  ignore_global_filters: false,
                  x: {
                    column: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
                  },
                  y: [
                    {
                      column: 'count',
                      axis_id: 'y',
                    },
                  ],
                },
              ],
              axis: {
                x: {
                  title: {
                    visible: false,
                  },
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'fit',
                    rounding: false,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                  scale: 'ordinal',
                },
                y: {
                  anchor: 'start',
                  title: {
                    visible: true,
                  },
                  scale: 'linear',
                  ticks: {
                    visible: true,
                  },
                  grid: {
                    visible: true,
                  },
                  domain: {
                    type: 'full',
                    rounding: true,
                  },
                  labels: {
                    orientation: 'horizontal',
                  },
                },
              },
              styling: {
                overlays: {
                  partial_buckets: {
                    visible: false,
                  },
                  current_time_marker: {
                    visible: false,
                  },
                },
                interpolation: 'linear',
                points: {
                  visibility: 'auto',
                },
              },
              legend: {
                visibility: 'hidden',
                placement: 'outside',
                position: 'right',
                layout: {
                  type: 'grid',
                  truncate: {
                    max_lines: 1,
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000003',
            type: 'vis',
          },
          {
            grid: {
              x: 24,
              y: 8,
              w: 24,
              h: 10,
            },
            config: {
              title: 'Unique visitors',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'unique_count',
                  field: 'clientip',
                  empty_as_null: false,
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000004',
            type: 'vis',
          },
        ],
        pinned_panels: [],
        title: 'Web logs overview',
      },
      meta: {
        managed: false,
        updated_at: '2026-04-13T11:00:00.000Z',
        version: 'WzEwMywxXQ==',
      },
    } satisfies DashboardUpdateResponseBody,
  },
};

const dashboardUpdateCreatedResponseExamples = {
  createDashboardResponse: {
    summary: 'Create dashboard response (PUT)',
    description:
      'Response when PUT creates a new dashboard (no existing dashboard with the given ID). Returns the generated state and metadata. Default option values are always returned even when not explicitly set in the request.\n',
    value: {
      id: '3c4b8e10-d57a-11ef-9a52-4f3c2a8d0e1b',
      data: {
        options: {
          hide_panel_titles: false,
          hide_panel_borders: false,
          use_margins: true,
          auto_apply_filters: true,
          sync_colors: false,
          sync_cursor: true,
          sync_tooltips: false,
        },
        panels: [
          {
            grid: {
              x: 0,
              y: 0,
              w: 12,
              h: 5,
            },
            config: {
              title: '',
              data_source: {
                type: 'data_view_spec',
                index_pattern: 'kibana_sample_data_logs',
                time_field: 'timestamp',
              },
              type: 'metric',
              sampling: 1,
              ignore_global_filters: false,
              metrics: [
                {
                  type: 'primary',
                  operation: 'count',
                  empty_as_null: false,
                },
              ],
              styling: {
                primary: {
                  position: 'bottom',
                  labels: {
                    alignment: 'left',
                  },
                  value: {
                    sizing: 'auto',
                    alignment: 'right',
                  },
                },
              },
            },
            id: 'a1b2c3d4-0001-4000-8000-000000000001',
            type: 'vis',
          },
        ],
        pinned_panels: [],
        title: 'Web logs overview',
      },
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzEwMiwxXQ==',
      },
    } satisfies DashboardUpdateResponseBody,
  },
};

export const createDashboardOASOperationObject = {
  description: dashboardCreateDescription,
  'x-codeSamples': dashboardCreateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: dashboardCreateRequestExamples,
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          examples: dashboardCreateResponseExamples,
        },
      },
    },
  },
};

export const searchDashboardOASOperationObject = {
  'x-codeSamples': dashboardSearchCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: dashboardSearchResponseExamples,
        },
      },
    },
  },
};

export const readDashboardOASOperationObject = {
  'x-codeSamples': dashboardReadCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: dashboardReadResponseExamples,
        },
      },
    },
  },
};

export const updateDashboardOASOperationObject = {
  description: dashboardUpdateDescription,
  'x-codeSamples': dashboardUpdateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: dashboardUpdateRequestExamples,
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          examples: dashboardUpdateResponseExamples,
        },
      },
    },
    201: {
      content: {
        'application/json': {
          examples: dashboardUpdateCreatedResponseExamples,
        },
      },
    },
  },
};

export const deleteDashboardOASOperationObject = {
  'x-codeSamples': dashboardDeleteCodeSamples,
};
