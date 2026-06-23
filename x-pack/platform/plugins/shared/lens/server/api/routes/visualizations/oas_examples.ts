/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * This is a big file used for documenting/introspecting APIs. Always load it lazily!
 */

import type { DeepPartial } from '@kbn/utility-types';

import type {
  LensCreateRequestBody,
  LensCreateResponseBody,
  LensGetResponseBody,
  LensSearchResponseBody,
  LensUpdateRequestBody,
  LensUpdateResponseBody,
} from './types';

const lensCreateDescription = [
  'Creates a Lens visualization and saves it to the library.',
  '',
  'ES|QL visualizations cannot be created through this endpoint.',
].join('\n');

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

const lensCreateMetricVisualizationBody = {
  type: 'metric',
  title: 'Total requests',
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
} satisfies DeepPartial<LensCreateRequestBody>;

const lensCreateAnXYLineChartBody = {
  type: 'xy',
  title: 'Log entries over time',
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
} satisfies DeepPartial<LensCreateRequestBody>;

const lensCreatePieDonutChartBody = {
  type: 'pie',
  title: 'Requests by response code',
  data_source: {
    type: 'data_view_spec',
    index_pattern: 'kibana_sample_data_logs',
    time_field: 'timestamp',
  },
  metrics: [
    {
      operation: 'count',
    },
  ],
  group_by: [
    {
      operation: 'terms',
      fields: ['response.keyword'],
      limit: 5,
    },
  ],
  styling: {
    donut_hole: 'm',
  },
} satisfies DeepPartial<LensCreateRequestBody>;

const lensCreateDataTableBody = {
  type: 'data_table',
  title: 'Top response codes',
  data_source: {
    type: 'data_view_spec',
    index_pattern: 'kibana_sample_data_logs',
    time_field: 'timestamp',
  },
  metrics: [
    {
      operation: 'count',
    },
  ],
  rows: [
    {
      operation: 'terms',
      fields: ['response.keyword'],
      limit: 5,
    },
  ],
} satisfies DeepPartial<LensCreateRequestBody>;

const lensCreateVisualizationUsingALibraryDataViewBody = {
  type: 'metric',
  title: 'Total requests (library data view)',
  data_source: {
    type: 'data_view_reference',
    ref_id: '90943e30-9a47-11e8-b64d-95841ca0b247',
  },
  metrics: [
    {
      type: 'primary',
      operation: 'count',
    },
  ],
} satisfies DeepPartial<LensCreateRequestBody>;

const lensUpdateVisualizationBody = {
  type: 'metric',
  title: 'Total requests (updated)',
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
} satisfies DeepPartial<LensUpdateRequestBody>;

const lensCreateCodeSamples = [
  createCurlCodeSample({
    lang: 'cURL_metric',
    label: 'Create a metric visualization - cURL',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateMetricVisualizationBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_metric',
    label: 'Create a metric visualization - Console',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateMetricVisualizationBody,
  }),
  createCurlCodeSample({
    lang: 'cURL_xy',
    label: 'Create an XY line chart - cURL',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateAnXYLineChartBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_xy',
    label: 'Create an XY line chart - Console',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateAnXYLineChartBody,
  }),
  createCurlCodeSample({
    lang: 'cURL_pie',
    label: 'Create a pie/donut chart - cURL',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreatePieDonutChartBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_pie',
    label: 'Create a pie/donut chart - Console',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreatePieDonutChartBody,
  }),
  createCurlCodeSample({
    lang: 'cURL_table',
    label: 'Create a data table - cURL',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateDataTableBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_table',
    label: 'Create a data table - Console',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateDataTableBody,
  }),
  createCurlCodeSample({
    lang: 'cURL_library',
    label: 'Create a visualization using a library data view - cURL',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateVisualizationUsingALibraryDataViewBody,
  }),
  createConsoleCodeSample({
    lang: 'Console_library',
    label: 'Create a visualization using a library data view - Console',
    method: 'POST',
    path: '/api/visualizations',
    body: lensCreateVisualizationUsingALibraryDataViewBody,
  }),
];

const lensSearchCodeSamples = [
  {
    lang: 'cURL',
    label: 'Search visualizations - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/visualizations?query=requests&per_page=10" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Search visualizations - Console',
    source: 'GET kbn:/api/visualizations?query=requests&per_page=10\n',
  },
];

const lensReadCodeSamples = [
  {
    lang: 'cURL',
    label: 'Get a visualization - cURL',
    source:
      'curl -X GET "${KIBANA_URL}/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}"\n',
  },
  {
    lang: 'Console',
    label: 'Get a visualization - Console',
    source: 'GET kbn:/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d\n',
  },
];

const lensUpdateCodeSamples = [
  createCurlCodeSample({
    label: 'Update a visualization - cURL',
    method: 'PUT',
    path: '/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
    body: lensUpdateVisualizationBody,
  }),
  createConsoleCodeSample({
    label: 'Update a visualization - Console',
    method: 'PUT',
    path: '/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
    body: lensUpdateVisualizationBody,
  }),
];

const lensDeleteCodeSamples = [
  {
    lang: 'cURL',
    label: 'Delete a visualization - cURL',
    source:
      'curl -X DELETE "${KIBANA_URL}/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d" \\\n' +
      '  -H "Authorization: ApiKey ${API_KEY}" \\\n' +
      '  -H "kbn-xsrf: true"\n',
  },
  {
    lang: 'Console',
    label: 'Delete a visualization - Console',
    source: 'DELETE kbn:/api/visualizations/1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d\n',
  },
];

const lensCreateRequestExamples = {
  createMetricVisualization: {
    summary: 'Create a metric visualization',
    value: {
      type: 'metric',
      title: 'Total requests',
      data_source: {
        type: 'data_view_spec',
        index_pattern: 'kibana_sample_data_logs',
        time_field: 'timestamp',
      },
      sampling: 1,
      ignore_global_filters: false,
      metrics: [
        {
          type: 'primary',
          operation: 'count',
          empty_as_null: false,
        },
      ],
    } satisfies LensCreateRequestBody,
  },
  createXYVisualization: {
    summary: 'Create an XY line chart',
    value: {
      type: 'xy',
      title: 'Log entries over time',
      layers: [
        {
          type: 'line',
          data_source: {
            type: 'data_view_spec',
            index_pattern: 'kibana_sample_data_logs',
            time_field: 'timestamp',
          },
          sampling: 1,
          ignore_global_filters: false,
          x: {
            operation: 'date_histogram',
            field: 'timestamp',
            suggested_interval: 'auto',
            use_original_time_range: false,
            include_empty_rows: true,
            drop_partial_intervals: false,
          },
          y: [
            {
              operation: 'count',
              empty_as_null: false,
            },
          ],
        },
      ],
    } satisfies LensCreateRequestBody,
  },
  createPieVisualization: {
    summary: 'Create a pie/donut chart',
    value: {
      type: 'pie',
      title: 'Requests by response code',
      data_source: {
        type: 'data_view_spec',
        index_pattern: 'kibana_sample_data_logs',
        time_field: 'timestamp',
      },
      sampling: 1,
      ignore_global_filters: false,
      metrics: [
        {
          operation: 'count',
          empty_as_null: false,
        },
      ],
      group_by: [
        {
          operation: 'terms',
          fields: ['response.keyword'],
          limit: 5,
        },
      ],
      styling: {
        values: {
          visible: true,
          mode: 'percentage',
        },
        donut_hole: 'm',
        labels: {
          visible: true,
          position: 'outside',
        },
      },
    } satisfies LensCreateRequestBody,
  },
  createDataTableVisualization: {
    summary: 'Create a data table',
    value: {
      type: 'data_table',
      title: 'Top response codes',
      data_source: {
        type: 'data_view_spec',
        index_pattern: 'kibana_sample_data_logs',
        time_field: 'timestamp',
      },
      sampling: 1,
      ignore_global_filters: false,
      metrics: [
        {
          operation: 'count',
          empty_as_null: false,
        },
      ],
      rows: [
        {
          operation: 'terms',
          fields: ['response.keyword'],
          limit: 5,
        },
      ],
    } satisfies LensCreateRequestBody,
  },
  createDataViewReferenceVisualization: {
    summary: 'Create a visualization using a library data view',
    value: {
      type: 'metric',
      title: 'Total requests (library data view)',
      data_source: {
        type: 'data_view_reference',
        ref_id: '90943e30-9a47-11e8-b64d-95841ca0b247',
      },
      sampling: 1,
      ignore_global_filters: false,
      metrics: [
        {
          type: 'primary',
          operation: 'count',
          empty_as_null: false,
        },
      ],
    } satisfies LensCreateRequestBody,
  },
};

const lensCreateResponseExamples = {
  createMetricVisualizationResponse: {
    summary: 'Create a metric visualization',
    description:
      'Response after creating a metric chart (count of requests) using an inline data view. Server-populated defaults are included in the response.\n',
    value: {
      id: '1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
      data: {
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
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies LensCreateResponseBody,
  },
  createXYVisualizationResponse: {
    summary: 'Create an XY line chart',
    description:
      'Response after creating an XY line chart. The response includes server-populated defaults for axis configuration, styling, and legend.\n',
    value: {
      id: '3a7c2e10-b3c5-11ef-bd7a-2b6b1a8c0f3d',
      data: {
        title: 'Log entries over time',
        type: 'xy',
        layers: [
          {
            type: 'line',
            data_source: {
              type: 'data_view_spec',
              index_pattern: 'kibana_sample_data_logs',
              time_field: 'timestamp',
            },
            sampling: 1,
            ignore_global_filters: false,
            x: {
              operation: 'date_histogram',
              field: 'timestamp',
              suggested_interval: 'auto',
              use_original_time_range: false,
              include_empty_rows: true,
              drop_partial_intervals: false,
            },
            y: [
              {
                operation: 'count',
                empty_as_null: false,
                axis: 'y',
              },
            ],
          },
        ],
        axis: {
          x: {
            title: {
              visible: true,
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
          },
          y: {
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
      meta: {
        created_at: '2026-04-13T10:05:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:05:00.000Z',
        version: 'WzYwLDFd',
      },
    } satisfies LensCreateResponseBody,
  },
  createPieVisualizationResponse: {
    summary: 'Create a pie/donut chart',
    description:
      'Response after creating a donut chart broken down by response code. Note that `group_by` items gain a server-populated `rank_by` sort order, and `legend`, `values`, and `labels` are populated with defaults.\n',
    value: {
      id: '2cac466f-ff49-4d34-8d69-487a93a179c2',
      data: {
        title: 'Requests by response code',
        type: 'pie',
        sampling: 1,
        ignore_global_filters: false,
        metrics: [
          {
            operation: 'count',
            empty_as_null: false,
          },
        ],
        group_by: [
          {
            operation: 'terms',
            fields: ['response.keyword'],
            limit: 5,
            rank_by: {
              type: 'metric',
              metric_index: 0,
              direction: 'desc',
            },
          },
        ],
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        legend: {
          visibility: 'auto',
        },
        styling: {
          values: {
            visible: true,
            mode: 'percentage',
          },
          donut_hole: 'm',
          labels: {
            visible: true,
            position: 'outside',
          },
        },
      },
      meta: {
        created_at: '2026-04-13T10:10:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:10:00.000Z',
        version: 'Wzc3LDFd',
      },
    } satisfies LensCreateResponseBody,
  },
  createDataTableVisualizationResponse: {
    summary: 'Create a data table',
    description:
      'Response after creating a data table broken down by response code. Note that `rows` items gain a server-populated `rank_by` sort order.\n',
    value: {
      id: '83660652-bc77-46a1-8dca-5d512949eba6',
      data: {
        title: 'Top response codes',
        type: 'data_table',
        data_source: {
          type: 'data_view_spec',
          index_pattern: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        },
        sampling: 1,
        ignore_global_filters: false,
        metrics: [
          {
            operation: 'count',
            empty_as_null: false,
          },
        ],
        rows: [
          {
            operation: 'terms',
            fields: ['response.keyword'],
            limit: 5,
            rank_by: {
              type: 'metric',
              metric_index: 0,
              direction: 'desc',
            },
          },
        ],
      },
      meta: {
        created_at: '2026-04-13T10:15:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:15:00.000Z',
        version: 'Wzc4LDFd',
      },
    } satisfies LensCreateResponseBody,
  },
  createDataViewReferenceResponse: {
    summary: 'Create a visualization using a library data view',
    description:
      'Response after creating a metric chart that references an existing saved data view by ID (`ref_id`) instead of defining an inline index pattern.\n',
    value: {
      id: 'cc44837a-7f20-42ee-b317-9af4f5eacc9c',
      data: {
        title: 'Total requests (library data view)',
        data_source: {
          type: 'data_view_reference',
          ref_id: '90943e30-9a47-11e8-b64d-95841ca0b247',
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
      meta: {
        created_at: '2026-04-13T10:20:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:20:00.000Z',
        version: 'Wzc5LDFd',
      },
    } satisfies LensCreateResponseBody,
  },
};

const lensSearchResponseExamples = {
  searchVisualizationsResponse: {
    summary: 'Search visualizations response',
    description:
      'Paginated list of visualizations matching the query. Each item includes the ID, full chart configuration, and metadata. Use the GET endpoint to retrieve a single visualization by ID.\n',
    value: {
      data: [
        {
          id: '1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
          data: {
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
          meta: {
            created_at: '2026-04-13T10:00:00.000Z',
            managed: false,
            updated_at: '2026-04-13T10:00:00.000Z',
            version: 'WzU5LDFd',
          },
        },
        {
          id: '3a7c2e10-b3c5-11ef-bd7a-2b6b1a8c0f3d',
          data: {
            title: 'Log entries over time',
            type: 'xy',
            layers: [
              {
                type: 'line',
                data_source: {
                  type: 'data_view_spec',
                  index_pattern: 'kibana_sample_data_logs',
                  time_field: 'timestamp',
                },
                sampling: 1,
                ignore_global_filters: false,
                x: {
                  operation: 'date_histogram',
                  field: 'timestamp',
                  suggested_interval: 'auto',
                  use_original_time_range: false,
                  include_empty_rows: true,
                  drop_partial_intervals: false,
                },
                y: [
                  {
                    operation: 'count',
                    empty_as_null: false,
                    axis: 'y',
                  },
                ],
              },
            ],
            axis: {
              x: {
                title: {
                  visible: true,
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
              },
              y: {
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
          meta: {
            created_at: '2026-04-13T10:05:00.000Z',
            managed: false,
            updated_at: '2026-04-13T10:05:00.000Z',
            version: 'WzYwLDFd',
          },
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 2,
      },
    } satisfies LensSearchResponseBody,
  },
};

const lensGetResponseExamples = {
  getVisualizationResponse: {
    summary: 'Get visualization response',
    description: 'The full visualization state including the chart configuration and metadata.\n',
    value: {
      id: '1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
      data: {
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
      meta: {
        created_at: '2026-04-13T10:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T10:00:00.000Z',
        version: 'WzU5LDFd',
      },
    } satisfies LensGetResponseBody,
  },
};

const lensUpdateRequestExamples = {
  updateVisualization: {
    summary: 'Update a visualization',
    value: {
      type: 'metric',
      title: 'Total requests (updated)',
      data_source: {
        type: 'data_view_spec',
        index_pattern: 'kibana_sample_data_logs',
        time_field: 'timestamp',
      },
      sampling: 1,
      ignore_global_filters: false,
      metrics: [
        {
          type: 'primary',
          operation: 'count',
          empty_as_null: false,
        },
      ],
    } satisfies LensUpdateRequestBody,
  },
};

const lensUpdateResponseExamples = {
  updateVisualizationResponse: {
    summary: 'Update visualization response',
    description:
      'The complete updated visualization state after a full replacement. PUT replaces the entire chart configuration - fields omitted from the request are reset to their defaults. `meta.created_at` reflects the update time rather than the original creation time.\n',
    value: {
      id: '1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
      data: {
        title: 'Total requests (updated)',
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
      meta: {
        created_at: '2026-04-13T11:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T11:00:00.000Z',
        version: 'WzYxLDFd',
      },
    } satisfies LensUpdateResponseBody,
  },
};

const lensUpsertResponseExamples = {
  createdVisualizationResponse: {
    summary: 'Update visualization response',
    description:
      'The created visualization state. Server-populated defaults are included in the response.\n',
    value: {
      id: '1e4f0a30-b3c5-11ef-bd7a-2b6b1a8c0f3d',
      data: {
        title: 'Total requests (updated)',
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
      meta: {
        created_at: '2026-04-13T11:00:00.000Z',
        managed: false,
        updated_at: '2026-04-13T11:00:00.000Z',
        version: 'WzYxLDFd',
      },
    } satisfies LensUpdateResponseBody,
  },
};

export const createLensVisualizationOASOperationObject = {
  description: lensCreateDescription,
  'x-codeSamples': lensCreateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: lensCreateRequestExamples,
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          examples: lensCreateResponseExamples,
        },
      },
    },
  },
};

export const searchLensVisualizationOASOperationObject = {
  'x-codeSamples': lensSearchCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: lensSearchResponseExamples,
        },
      },
    },
  },
};

export const readLensVisualizationOASOperationObject = {
  'x-codeSamples': lensReadCodeSamples,
  responses: {
    200: {
      content: {
        'application/json': {
          examples: lensGetResponseExamples,
        },
      },
    },
  },
};

export const updateLensVisualizationOASOperationObject = {
  'x-codeSamples': lensUpdateCodeSamples,
  requestBody: {
    content: {
      'application/json': {
        examples: lensUpdateRequestExamples,
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          examples: lensUpdateResponseExamples,
        },
      },
    },
    201: {
      content: {
        'application/json': {
          examples: lensUpsertResponseExamples,
        },
      },
    },
  },
};

export const deleteLensVisualizationOASOperationObject = {
  'x-codeSamples': lensDeleteCodeSamples,
};
