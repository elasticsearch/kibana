/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DataGridDensity, UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import type { DiscoverSessionAttributes } from '@kbn/saved-search-plugin/server';
import type { DiscoverSessionApiData } from '../schema';

export const discoverSessionAttributes: DiscoverSessionAttributes = {
  title: 'all_props',
  description: 'A Discover Session with as many props as I can get.',
  tabs: [
    {
      id: 'fe157f5f-1ad8-47c9-9cb0-f9fff059aa48',
      label: 'Classic',
      attributes: {
        sort: [
          ['transaction.id', 'asc'],
          ['@timestamp', 'desc'],
        ],
        columns: ['message', 'transaction.id'],
        grid: {
          columns: {
            message: {
              width: 418,
            },
          },
        },
        hideChart: false,
        hideTable: false,
        isTextBasedQuery: false,
        usesAdHocDataView: true,
        kibanaSavedObjectMeta: {
          searchSourceJSON:
            '{"query":{"language":"kuery","query":""},"index":{"id":"6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20","title":"logs*,-logstash*,filebeat-*","timeFieldName":"@timestamp","sourceFilters":[],"type":"esql","fieldFormats":{},"runtimeFieldMap":{},"allowNoIndex":false,"name":"logs*,-logstash*,filebeat-*","allowHidden":false,"managed":false},"filter":[]}',
        },
        viewMode: VIEW_MODE.DOCUMENT_LEVEL,
        hideAggregatedPreview: false,
        rowHeight: 1,
        headerRowHeight: 1,
        timeRestore: true,
        timeRange: {
          from: 'now/d',
          to: 'now/d',
        },
        refreshInterval: {
          value: 60000,
          pause: true,
        },
        rowsPerPage: 25,
        sampleSize: 100,
        breakdownField: 'transaction.id',
        chartInterval: 'h',
        density: DataGridDensity.COMPACT,
        controlGroupJson: '{}',
      },
    },
    {
      id: 'de687fc2-0719-456e-b9c3-adccc8426746',
      label: 'ES|QL',
      attributes: {
        sort: [['transaction.id', 'asc']],
        columns: [],
        grid: {},
        hideChart: false,
        hideTable: false,
        isTextBasedQuery: true,
        usesAdHocDataView: true,
        kibanaSavedObjectMeta: {
          searchSourceJSON:
            '{"query":{"esql":"FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value"},"index":{"id":"6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20","title":"logs*,-logstash*,filebeat-*","timeFieldName":"@timestamp","sourceFilters":[],"type":"esql","fieldFormats":{},"runtimeFieldMap":{},"allowNoIndex":false,"name":"logs*,-logstash*,filebeat-*","allowHidden":false,"managed":false},"filter":[]}',
        },
        viewMode: VIEW_MODE.DOCUMENT_LEVEL,
        hideAggregatedPreview: false,
        rowHeight: 1,
        headerRowHeight: 1,
        timeRestore: true,
        timeRange: {
          from: 'now/d',
          to: 'now/d',
        },
        refreshInterval: {
          value: 60000,
          pause: false,
        },
        rowsPerPage: 25,
        sampleSize: 100,
        breakdownField: 'transaction.id',
        chartInterval: 'h',
        density: DataGridDensity.COMPACT,
        visContext: {
          suggestionType: 'histogramForESQL',
          requestData: {
            dataViewId: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
            timeField: '@timestamp',
            breakdownField: 'transaction.id',
          },
          attributes: {
            title: 'results over timestamp',
            references: [],
            state: {
              datasourceStates: {
                textBased: {
                  layers: {
                    'd4ce4ad1-dab8-4e76-a4c4-3c0ebcccb48e': {
                      index: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                      query: {
                        esql: 'FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value\n| STATS results = COUNT(*) BY `transaction.id`, timestamp = BUCKET(@timestamp, 30 minute) | sort `transaction.id` asc',
                      },
                      columns: [
                        {
                          columnId: 'timestamp',
                          fieldName: 'timestamp',
                          label: '@timestamp every 30 minute',
                          customLabel: true,
                          meta: {
                            type: 'date',
                          },
                        },
                        {
                          columnId: 'results',
                          fieldName: 'results',
                          label: 'results',
                          customLabel: false,
                          meta: {
                            type: 'number',
                          },
                          inMetricDimension: true,
                        },
                        {
                          columnId: 'transaction.id',
                          fieldName: 'transaction.id',
                          label: 'transaction.id',
                          customLabel: false,
                          meta: {
                            type: 'string',
                            esType: 'keyword',
                            sourceParams: {
                              indexPattern: 'logs*,-logstash*,filebeat-*',
                              sourceField: 'transaction.id',
                            },
                            params: {
                              id: 'string',
                            },
                          },
                        },
                      ],
                      timeField: '@timestamp',
                    },
                  },
                  indexPatternRefs: [
                    {
                      id: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                      title: 'logs*,-logstash*,filebeat-*',
                      timeField: '@timestamp',
                    },
                  ],
                },
              },
              filters: [],
              query: {
                esql: 'FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value\n| STATS results = COUNT(*) BY `transaction.id`, timestamp = BUCKET(@timestamp, 30 minute) | sort `transaction.id` asc',
              },
              visualization: {
                legend: {
                  isVisible: true,
                  position: 'right',
                },
                valueLabels: 'hide',
                fittingFunction: 'Linear',
                axisTitlesVisibilitySettings: {
                  x: true,
                  yLeft: true,
                  yRight: true,
                },
                tickLabelsVisibilitySettings: {
                  x: true,
                  yLeft: true,
                  yRight: true,
                },
                labelsOrientation: {
                  x: 0,
                  yLeft: 0,
                  yRight: 0,
                },
                gridlinesVisibilitySettings: {
                  x: true,
                  yLeft: true,
                  yRight: true,
                },
                preferredSeriesType: 'line',
                layers: [
                  {
                    layerId: 'd4ce4ad1-dab8-4e76-a4c4-3c0ebcccb48e',
                    seriesType: 'line',
                    xAccessor: 'timestamp',
                    splitAccessors: ['transaction.id'],
                    accessors: ['results'],
                    layerType: 'data',
                    colorMapping: {
                      assignments: [],
                      specialAssignments: [
                        {
                          rules: [
                            {
                              type: 'other',
                            },
                          ],
                          color: {
                            type: 'loop',
                          },
                          touched: false,
                        },
                      ],
                      paletteId: 'elastic_line_optimized',
                      colorMode: {
                        type: 'categorical',
                      },
                    },
                  },
                ],
              },
              adHocDataViews: {
                '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20': {
                  id: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                  title: 'logs*,-logstash*,filebeat-*',
                  timeFieldName: '@timestamp',
                  sourceFilters: [],
                  type: 'esql',
                  fieldFormats: {},
                  runtimeFieldMap: {},
                  allowNoIndex: false,
                  name: 'logs*,-logstash*,filebeat-*',
                  allowHidden: false,
                  managed: false,
                },
              },
            },
            visualizationType: 'lnsXY',
            version: 2,
          },
        },
        controlGroupJson:
          '{"e2be5bb5-87d2-4226-8950-2614f0522209":{"selected_options":["event.dataset"],"variable_name":"field_name","single_select":true,"variable_type":"fields","control_type":"STATIC_VALUES","available_options":["event.dataset","event.module","event.type"],"title":"field_name","order":1,"width":"medium","grow":false,"type":"esql_control"},"c8106b8e-e13a-4dc4-9fc6-1a8c48e70464":{"selected_options":["kibana.log"],"variable_name":"field_value","single_select":true,"variable_type":"values","control_type":"VALUES_FROM_QUERY","esql_query":"FROM logs*,-logstash*,filebeat-* | WHERE @timestamp <= ?_tend and @timestamp > ?_tstart | STATS BY ??field_name","title":"field_value","order":1,"width":"medium","grow":false,"type":"esql_control"}}',
      },
    },
  ],
};

export const discoverSessionApiData: DiscoverSessionApiData = {
  title: 'all_props',
  description: 'A Discover Session with as many props as I can get.',
  tabs: [
    {
      id: 'fe157f5f-1ad8-47c9-9cb0-f9fff059aa48',
      label: 'Classic',
      sort: [
        {
          name: 'transaction.id',
          direction: 'asc',
        },
        {
          name: '@timestamp',
          direction: 'desc',
        },
      ],
      column_order: ['message', 'transaction.id'],
      column_settings: {
        message: {
          width: 418,
        },
      },
      row_height: 1,
      sample_size: 100,
      rows_per_page: 25,
      header_row_height: 1,
      density: DataGridDensity.COMPACT,
      query: {
        expression: '',
        language: 'kql',
      },
      filters: [],
      data_source: {
        type: 'data_view_spec',
        index_pattern: 'logs*,-logstash*,filebeat-*',
        time_field: '@timestamp',
      },
      view_mode: VIEW_MODE.DOCUMENT_LEVEL,
      hide_chart: false,
      hide_table: false,
      hide_aggregated_preview: false,
      breakdown_field: 'transaction.id',
      chart_interval: 'h',
      time_restore: true,
      time_range: {
        from: 'now/d',
        to: 'now/d',
      },
      refresh_interval: {
        value: 60000,
        pause: true,
      },
    },
    {
      id: 'de687fc2-0719-456e-b9c3-adccc8426746',
      label: 'ES|QL',
      sort: [
        {
          name: 'transaction.id',
          direction: 'asc',
        },
      ],
      column_order: [],
      row_height: 1,
      sample_size: 100,
      rows_per_page: 25,
      header_row_height: 1,
      density: DataGridDensity.COMPACT,
      data_source: {
        type: 'esql',
        query: 'FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value',
      },
      hide_chart: false,
      hide_table: false,
      hide_aggregated_preview: false,
      breakdown_field: 'transaction.id',
      chart_interval: 'h',
      time_restore: true,
      time_range: {
        from: 'now/d',
        to: 'now/d',
      },
      refresh_interval: {
        value: 60000,
        pause: false,
      },
      vis_context: {
        suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
        attributes: {
          title: 'results over timestamp',
          references: [],
          state: {
            datasourceStates: {
              textBased: {
                layers: {
                  'd4ce4ad1-dab8-4e76-a4c4-3c0ebcccb48e': {
                    index: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                    query: {
                      esql: 'FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value\n| STATS results = COUNT(*) BY `transaction.id`, timestamp = BUCKET(@timestamp, 30 minute) | sort `transaction.id` asc',
                    },
                    columns: [
                      {
                        columnId: 'timestamp',
                        fieldName: 'timestamp',
                        label: '@timestamp every 30 minute',
                        customLabel: true,
                        meta: {
                          type: 'date',
                        },
                      },
                      {
                        columnId: 'results',
                        fieldName: 'results',
                        label: 'results',
                        customLabel: false,
                        meta: {
                          type: 'number',
                        },
                        inMetricDimension: true,
                      },
                      {
                        columnId: 'transaction.id',
                        fieldName: 'transaction.id',
                        label: 'transaction.id',
                        customLabel: false,
                        meta: {
                          type: 'string',
                          esType: 'keyword',
                          sourceParams: {
                            indexPattern: 'logs*,-logstash*,filebeat-*',
                            sourceField: 'transaction.id',
                          },
                          params: {
                            id: 'string',
                          },
                        },
                      },
                    ],
                    timeField: '@timestamp',
                  },
                },
                indexPatternRefs: [
                  {
                    id: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                    title: 'logs*,-logstash*,filebeat-*',
                    timeField: '@timestamp',
                  },
                ],
              },
            },
            filters: [],
            query: {
              esql: 'FROM logs*,-logstash*,filebeat-* | WHERE ??field_name == ?field_value\n| STATS results = COUNT(*) BY `transaction.id`, timestamp = BUCKET(@timestamp, 30 minute) | sort `transaction.id` asc',
            },
            visualization: {
              legend: {
                isVisible: true,
                position: 'right',
              },
              valueLabels: 'hide',
              fittingFunction: 'Linear',
              axisTitlesVisibilitySettings: {
                x: true,
                yLeft: true,
                yRight: true,
              },
              tickLabelsVisibilitySettings: {
                x: true,
                yLeft: true,
                yRight: true,
              },
              labelsOrientation: {
                x: 0,
                yLeft: 0,
                yRight: 0,
              },
              gridlinesVisibilitySettings: {
                x: true,
                yLeft: true,
                yRight: true,
              },
              preferredSeriesType: 'line',
              layers: [
                {
                  layerId: 'd4ce4ad1-dab8-4e76-a4c4-3c0ebcccb48e',
                  seriesType: 'line',
                  xAccessor: 'timestamp',
                  splitAccessors: ['transaction.id'],
                  accessors: ['results'],
                  layerType: 'data',
                  colorMapping: {
                    assignments: [],
                    specialAssignments: [
                      {
                        rules: [
                          {
                            type: 'other',
                          },
                        ],
                        color: {
                          type: 'loop',
                        },
                        touched: false,
                      },
                    ],
                    paletteId: 'elastic_line_optimized',
                    colorMode: {
                      type: 'categorical',
                    },
                  },
                },
              ],
            },
            adHocDataViews: {
              '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20': {
                id: '6972ccae5b7ff51c24c1129b58e8dc6d56649983d2bb717806063e2da57e0c20',
                title: 'logs*,-logstash*,filebeat-*',
                timeFieldName: '@timestamp',
                sourceFilters: [],
                type: 'esql',
                fieldFormats: {},
                runtimeFieldMap: {},
                allowNoIndex: false,
                name: 'logs*,-logstash*,filebeat-*',
                allowHidden: false,
                managed: false,
              },
            },
          },
          visualizationType: 'lnsXY',
          version: 2,
        },
      },
      control_panels: [
        {
          id: 'e2be5bb5-87d2-4226-8950-2614f0522209',
          type: 'esql_control',
          width: 'medium',
          grow: false,
          config: {
            selected_options: ['event.dataset'],
            variable_name: 'field_name',
            single_select: true,
            variable_type: 'fields',
            control_type: 'STATIC_VALUES',
            available_options: ['event.dataset', 'event.module', 'event.type'],
            title: 'field_name',
          },
        },
        {
          id: 'c8106b8e-e13a-4dc4-9fc6-1a8c48e70464',
          type: 'esql_control',
          width: 'medium',
          grow: false,
          config: {
            selected_options: ['kibana.log'],
            variable_name: 'field_value',
            single_select: true,
            variable_type: 'values',
            control_type: 'VALUES_FROM_QUERY',
            esql_query:
              'FROM logs*,-logstash*,filebeat-* | WHERE @timestamp <= ?_tend and @timestamp > ?_tstart | STATS BY ??field_name',
            title: 'field_value',
          },
        },
      ],
    },
  ],
};
