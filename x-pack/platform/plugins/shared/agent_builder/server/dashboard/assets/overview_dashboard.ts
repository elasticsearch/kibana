/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_BUILDER_OVERVIEW_DASHBOARD_ID,
  AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION,
  AGENT_BUILDER_DASHBOARD_CORE_MIGRATION_VERSION,
  AGENT_BUILDER_DASHBOARD_TYPE_MIGRATION_VERSION,
} from '../constants';

/**
 * Dashboard panels, authored as readable objects. They are serialized into the
 * `panelsJSON` string the saved object format expects at the bottom of this file.
 */
const panels = [
  {
    type: 'markdown',
    panelIndex: '4af33165-34e4-4a29-9ae6-d244c114bcdc',
    gridData: {
      x: 0,
      y: 0,
      w: 48,
      h: 5,
      i: '4af33165-34e4-4a29-9ae6-d244c114bcdc',
    },
    embeddableConfig: {
      content: `## 🤖 Agent Builder — Overview
Real-time observability for **Agent Builder** OTel traces (\`data_stream.dataset: agent_builder.otel\`). Monitor LLM token usage & cost, conversation throughput, agent execution, tool call health, and workflow performance — all in one place.`,
      settings: {
        open_links_in_new_tab: true,
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '4507e5df-7576-4f75-8c44-5feca451578d',
    gridData: {
      x: 0,
      y: 0,
      w: 16,
      h: 6,
      i: '4507e5df-7576-4f75-8c44-5feca451578d',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Input Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Total Input Tokens',
                      label: 'Total Input Tokens',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Input Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens))',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'e0392d97-cf51-4db7-96d8-292c9b8b5e0e',
    gridData: {
      x: 16,
      y: 0,
      w: 16,
      h: 6,
      i: 'e0392d97-cf51-4db7-96d8-292c9b8b5e0e',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Output Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.output_tokens))',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Total Output Tokens',
                      label: 'Total Output Tokens',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Output Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.output_tokens))',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'c0b1be03-24c7-4b60-8e3b-edebe734bddd',
    gridData: {
      x: 32,
      y: 0,
      w: 16,
      h: 6,
      i: 'c0b1be03-24c7-4b60-8e3b-edebe734bddd',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `LLM Requests` = COUNT(*)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'LLM Requests',
                      label: 'LLM Request Count',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `LLM Requests` = COUNT(*)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'ac6e7dfd-f5f2-4eaa-8248-338894f2f274',
    gridData: {
      x: 0,
      y: 6,
      w: 48,
      h: 12,
      i: 'ac6e7dfd-f5f2-4eaa-8248-338894f2f274',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      title: 'Total Token Usage Over Time by Model',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                area_stacked_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens)) + SUM(TO_LONG(attributes.gen_ai.usage.output_tokens)) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Model` = attributes.gen_ai.request.model',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'area_stacked_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'area_stacked_y_0',
                      fieldName: 'Total Tokens',
                      label: 'Total Tokens',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'area_stacked_breakdown',
                      fieldName: 'Model',
                      label: 'Model',
                      customLabel: true,
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-area_stacked_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'area_stacked',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            fillOpacity: 0.3,
            layers: [
              {
                layerId: 'area_stacked_0',
                accessors: ['area_stacked_y_0'],
                layerType: 'data',
                seriesType: 'area_stacked',
                xAccessor: 'area_stacked_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'area_stacked_y_0',
                  },
                ],
                splitAccessors: ['area_stacked_breakdown'],
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'default',
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
                },
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Total Tokens` = SUM(TO_LONG(attributes.gen_ai.usage.input_tokens)) + SUM(TO_LONG(attributes.gen_ai.usage.output_tokens)) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Model` = attributes.gen_ai.request.model',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '8f0e5888-b6eb-49b4-8de5-37ec28e0b7ad',
    gridData: {
      x: 0,
      y: 18,
      w: 24,
      h: 10,
      i: '8f0e5888-b6eb-49b4-8de5-37ec28e0b7ad',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      title: 'LLM Request Count by Model',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                bar_horizontal_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Request Count` = COUNT(*) BY `Model` = attributes.gen_ai.request.model\n| SORT `Request Count` DESC',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'bar_horizontal_x',
                      fieldName: 'Model',
                      meta: {
                        type: 'string',
                      },
                    },
                    {
                      columnId: 'bar_horizontal_y_0',
                      fieldName: 'Request Count',
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-bar_horizontal_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'bar_horizontal',
            legend: {
              isVisible: false,
              position: 'bottom',
              maxLines: 1,
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            valueLabels: 'hide',
            minBarHeight: 1,
            layers: [
              {
                layerId: 'bar_horizontal_0',
                accessors: ['bar_horizontal_y_0'],
                layerType: 'data',
                seriesType: 'bar_horizontal',
                xAccessor: 'bar_horizontal_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'bar_horizontal_y_0',
                  },
                ],
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Request Count` = COUNT(*) BY `Model` = attributes.gen_ai.request.model\n| SORT `Request Count` DESC',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '6cc1f9df-33ed-4aa3-a864-be56411a60d4',
    gridData: {
      x: 24,
      y: 18,
      w: 24,
      h: 10,
      i: '6cc1f9df-33ed-4aa3-a864-be56411a60d4',
      sectionId: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
    },
    embeddableConfig: {
      title: 'LLM Request Count by Provider',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                bar_horizontal_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Request Count` = COUNT(*) BY `Provider` = attributes.gen_ai.provider.name\n| SORT `Request Count` DESC',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'bar_horizontal_x',
                      fieldName: 'Provider',
                      meta: {
                        type: 'string',
                      },
                    },
                    {
                      columnId: 'bar_horizontal_y_0',
                      fieldName: 'Request Count',
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-bar_horizontal_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'bar_horizontal',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              maxLines: 1,
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            valueLabels: 'hide',
            minBarHeight: 1,
            layers: [
              {
                layerId: 'bar_horizontal_0',
                accessors: ['bar_horizontal_y_0'],
                layerType: 'data',
                seriesType: 'bar_horizontal',
                xAccessor: 'bar_horizontal_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'bar_horizontal_y_0',
                  },
                ],
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "chat *"\n| STATS `Request Count` = COUNT(*) BY `Provider` = attributes.gen_ai.provider.name\n| SORT `Request Count` DESC',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '13d60028-dca1-4022-96b1-3cc06de48c3f',
    gridData: {
      x: 0,
      y: 0,
      w: 12,
      h: 6,
      i: '13d60028-dca1-4022-96b1-3cc06de48c3f',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| STATS `Conversations` = COUNT(*)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Conversations',
                      label: 'Converse Span Count',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| STATS `Conversations` = COUNT(*)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'eeb0b789-816d-4041-8987-820256c3e533',
    gridData: {
      x: 12,
      y: 0,
      w: 12,
      h: 6,
      i: 'eeb0b789-816d-4041-8987-820256c3e533',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Avg Duration (s)',
                      label: 'Converse Avg Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '35d56053-985c-4f05-85c4-bff5a6ba8bb3',
    gridData: {
      x: 24,
      y: 0,
      w: 12,
      h: 6,
      i: '35d56053-985c-4f05-85c4-bff5a6ba8bb3',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `P95 Duration (s)` = ROUND(PERCENTILE(duration_sec, 95), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'P95 Duration (s)',
                      label: 'P95 Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            subtitle: 'Converse Spans — 95th Percentile',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `P95 Duration (s)` = ROUND(PERCENTILE(duration_sec, 95), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '2840d232-a130-496d-8dfe-8ff93537f0c1',
    gridData: {
      x: 36,
      y: 0,
      w: 12,
      h: 6,
      i: '2840d232-a130-496d-8dfe-8ff93537f0c1',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Max Duration (s)` = ROUND(MAX(duration_sec), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Max Duration (s)',
                      label: 'Converse Max Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Max Duration (s)` = ROUND(MAX(duration_sec), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'cf8ac568-2845-4915-bb46-e33db715b902',
    gridData: {
      x: 0,
      y: 6,
      w: 24,
      h: 10,
      i: 'cf8ac568-2845-4915-bb46-e33db715b902',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      title: 'Converse Count Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| STATS `Conversations` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend)\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Conversations',
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              legendStats: ['total'],
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| STATS `Conversations` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend)\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'eddf10ab-63bc-4f02-af46-a26850a09873',
    gridData: {
      x: 24,
      y: 6,
      w: 24,
      h: 10,
      i: 'eddf10ab-63bc-4f02-af46-a26850a09873',
      sectionId: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
    },
    embeddableConfig: {
      title: 'Converse Avg Duration Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend)\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Avg Duration (s)',
                      label: 'Avg Duration (s)',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'duration',
                          params: {
                            decimals: 2,
                            fromUnit: 'seconds',
                            toUnit: 'seconds',
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "CHAIN"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend)\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '08fb7452-173b-4c55-b9c4-71a84af29c42',
    gridData: {
      x: 0,
      y: 0,
      w: 12,
      h: 6,
      i: '08fb7452-173b-4c55-b9c4-71a84af29c42',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| STATS `Agent Executions` = COUNT(*)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Agent Executions',
                      label: 'ExecuteAgent Count',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| STATS `Agent Executions` = COUNT(*)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'dbc6538f-1748-4538-a051-ecac3fb9240c',
    gridData: {
      x: 12,
      y: 0,
      w: 12,
      h: 6,
      i: 'dbc6538f-1748-4538-a051-ecac3fb9240c',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Avg Duration (s)',
                      label: 'ExecuteAgent Avg Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '77b15777-9c16-4daf-aa5e-ab9253d856a3',
    gridData: {
      x: 24,
      y: 0,
      w: 12,
      h: 6,
      i: '77b15777-9c16-4daf-aa5e-ab9253d856a3',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `P95 Duration (s)` = ROUND(PERCENTILE(duration_sec, 95), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'P95 Duration (s)',
                      label: 'P95 Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `P95 Duration (s)` = ROUND(PERCENTILE(duration_sec, 95), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '2facea6a-ca9c-49bb-be62-0c18593740b7',
    gridData: {
      x: 36,
      y: 0,
      w: 12,
      h: 6,
      i: '2facea6a-ca9c-49bb-be62-0c18593740b7',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Max Duration (s)` = ROUND(MAX(duration_sec), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Max Duration (s)',
                      label: 'Max Duration (s)',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Max Duration (s)` = ROUND(MAX(duration_sec), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '8d2e6aa9-bc39-494b-b4b5-31452238bf1e',
    gridData: {
      x: 24,
      y: 6,
      w: 24,
      h: 10,
      i: '8d2e6aa9-bc39-494b-b4b5-31452238bf1e',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      title: 'ExecuteAgent Avg Duration (s) by Agent Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Agent` = attributes.gen_ai.agent.id\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Avg Duration (s)',
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'line_breakdown',
                      fieldName: 'Agent',
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
                splitAccessors: ['line_breakdown'],
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'elastic_line_optimized',
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
                },
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Agent` = attributes.gen_ai.agent.id\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '37d2bb24-c788-4492-b3c3-fe498115daa4',
    gridData: {
      x: 0,
      y: 6,
      w: 24,
      h: 10,
      i: '37d2bb24-c788-4492-b3c3-fe498115daa4',
      sectionId: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
    },
    embeddableConfig: {
      title: 'ExecuteAgent Execution Count by Agent Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| STATS `Execution Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Agent` = attributes.gen_ai.agent.id\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Execution Count',
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'line_breakdown',
                      fieldName: 'Agent',
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              legendStats: ['total'],
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
                splitAccessors: ['line_breakdown'],
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'elastic_line_optimized',
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
                },
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE span.name LIKE "invoke_agent *" AND attributes.elastic.inference.span.kind == "AGENT"\n| STATS `Execution Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Agent` = attributes.gen_ai.agent.id\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '30130f49-04ea-4876-8230-11b6b752a80c',
    gridData: {
      x: 0,
      y: 0,
      w: 12,
      h: 6,
      i: '30130f49-04ea-4876-8230-11b6b752a80c',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Calls` = COUNT(*)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Tool Calls',
                      label: 'Tool Span Count',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Calls` = COUNT(*)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'b3622b3b-0190-4ea1-86f3-371f7a2110b4',
    gridData: {
      x: 12,
      y: 0,
      w: 12,
      h: 6,
      i: 'b3622b3b-0190-4ea1-86f3-371f7a2110b4',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *" AND status.code == "Error"\n| STATS `Tool Errors` = COUNT(*)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Tool Errors',
                      label: 'Tool Errors',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *" AND status.code == "Error"\n| STATS `Tool Errors` = COUNT(*)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'ba18c35c-2b91-4f42-a1c2-2ea26d6521f8',
    gridData: {
      x: 24,
      y: 0,
      w: 12,
      h: 6,
      i: 'ba18c35c-2b91-4f42-a1c2-2ea26d6521f8',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS total = COUNT(*), errors = COUNT(*) WHERE status.code == "Error"\n| EVAL `Success Rate (%)` = ROUND((total - errors) / total * 100, 2)\n| KEEP `Success Rate (%)`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Success Rate (%)',
                      label: 'Tool Span Success Rate',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 1,
                            suffix: '%',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            palette: {
              type: 'palette',
              name: 'custom',
              params: {
                name: 'custom',
                progression: 'fixed',
                reverse: false,
                rangeMin: null,
                rangeMax: null,
                rangeType: 'number',
                stops: [
                  {
                    color: '#f6726a',
                    stop: 90,
                  },
                  {
                    color: '#fcd883',
                    stop: 99,
                  },
                  {
                    color: '#24c292',
                    stop: null,
                  },
                ],
                colorStops: [
                  {
                    color: '#f6726a',
                    stop: null,
                  },
                  {
                    color: '#fcd883',
                    stop: 90,
                  },
                  {
                    color: '#24c292',
                    stop: 99,
                  },
                ],
                continuity: 'all',
                steps: 3,
                maxSteps: 5,
              },
            },
            applyColorTo: 'value',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS total = COUNT(*), errors = COUNT(*) WHERE status.code == "Error"\n| EVAL `Success Rate (%)` = ROUND((total - errors) / total * 100, 2)\n| KEEP `Success Rate (%)`',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'd7c5d7a8-5a9c-4547-9d4a-1b6e7163daa9',
    gridData: {
      x: 36,
      y: 0,
      w: 12,
      h: 6,
      i: 'd7c5d7a8-5a9c-4547-9d4a-1b6e7163daa9',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      attributes: {
        visualizationType: 'lnsMetric',
        title: '',
        references: [],
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'metric_accessor_metric',
                      fieldName: 'Avg Duration (s)',
                      label: 'Avg Tool Duration',
                      customLabel: true,
                      params: {
                        format: {
                          id: 'number',
                          params: {
                            decimals: 2,
                            suffix: 's',
                            compact: false,
                          },
                        },
                      },
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            layerId: 'layer_0',
            layerType: 'data',
            metricAccessor: 'metric_accessor_metric',
            showBar: false,
            valueFontMode: 'default',
            titlesTextAlign: 'left',
            primaryAlign: 'right',
            primaryPosition: 'bottom',
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| EVAL duration_sec = duration / 1000000000.0\n| STATS `Avg Duration (s)` = ROUND(AVG(duration_sec), 2)',
          },
          filters: [],
        },
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'a227e7c3-a20c-499a-b555-03e69940a7a6',
    gridData: {
      x: 0,
      y: 6,
      w: 24,
      h: 10,
      i: 'a227e7c3-a20c-499a-b555-03e69940a7a6',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      title: 'Tool Invocations by Tool Name Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Tool Name` = name\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Tool Count',
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'line_breakdown',
                      fieldName: 'Tool Name',
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
                splitAccessors: ['line_breakdown'],
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'elastic_line_optimized',
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
                },
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Tool Name` = name\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '29a62933-b5a5-473e-a174-000adf5be76a',
    gridData: {
      x: 24,
      y: 6,
      w: 24,
      h: 10,
      i: '29a62933-b5a5-473e-a174-000adf5be76a',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      title: 'Tool Count by Status Over Time',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                line_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Status` = status.code\n| SORT `Time`',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'line_x',
                      fieldName: 'Time',
                      meta: {
                        type: 'date',
                      },
                    },
                    {
                      columnId: 'line_y_0',
                      fieldName: 'Tool Count',
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'line_breakdown',
                      fieldName: 'Status',
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-line_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'line',
            legend: {
              isVisible: true,
              showSingleSeries: true,
              position: 'bottom',
              layout: 'list',
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            pointVisibility: 'auto',
            curveType: 'LINEAR',
            layers: [
              {
                layerId: 'line_0',
                accessors: ['line_y_0'],
                layerType: 'data',
                seriesType: 'line',
                xAccessor: 'line_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'line_y_0',
                  },
                ],
                splitAccessors: ['line_breakdown'],
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'elastic_line_optimized',
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
                },
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Time` = BUCKET(@timestamp, 75, ?_tstart, ?_tend), `Status` = status.code\n| SORT `Time`',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: 'fbd7eda6-8ebc-4ada-9507-482b646f72b6',
    gridData: {
      x: 0,
      y: 16,
      w: 24,
      h: 10,
      i: 'fbd7eda6-8ebc-4ada-9507-482b646f72b6',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      title: 'Top 15 Tools by Call Count',
      attributes: {
        visualizationType: 'lnsXY',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                bar_horizontal_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Tool Name` = name\n| SORT `Tool Count` DESC\n| LIMIT 15',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'bar_horizontal_x',
                      fieldName: 'Tool Name',
                      meta: {
                        type: 'string',
                      },
                    },
                    {
                      columnId: 'bar_horizontal_y_0',
                      fieldName: 'Tool Count',
                      label: 'Call Count',
                      customLabel: true,
                      meta: {
                        type: 'number',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-bar_horizontal_0',
            },
          ],
          visualization: {
            preferredSeriesType: 'bar_horizontal',
            legend: {
              isVisible: false,
              position: 'bottom',
              maxLines: 1,
            },
            yLeftScale: 'linear',
            axisTitlesVisibilitySettings: {
              x: false,
              yLeft: false,
              yRight: true,
            },
            tickLabelsVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            gridlinesVisibilitySettings: {
              x: true,
              yLeft: true,
              yRight: true,
            },
            xExtent: {
              mode: 'dataBounds',
              niceValues: false,
            },
            yLeftExtent: {
              mode: 'full',
              niceValues: true,
            },
            labelsOrientation: {
              x: 0,
              yLeft: 0,
              yRight: 0,
            },
            hideEndzones: true,
            showCurrentTimeMarker: false,
            valueLabels: 'hide',
            minBarHeight: 1,
            layers: [
              {
                layerId: 'bar_horizontal_0',
                accessors: ['bar_horizontal_y_0'],
                layerType: 'data',
                seriesType: 'bar_horizontal',
                xAccessor: 'bar_horizontal_x',
                yConfig: [
                  {
                    axisMode: 'left',
                    forAccessor: 'bar_horizontal_y_0',
                  },
                ],
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Tool Count` = COUNT(*) BY `Tool Name` = name\n| SORT `Tool Count` DESC\n| LIMIT 15',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
  {
    type: 'vis',
    panelIndex: '2c7aef77-fc32-4683-b10d-40fd160251f1',
    gridData: {
      x: 24,
      y: 16,
      w: 24,
      h: 10,
      i: '2c7aef77-fc32-4683-b10d-40fd160251f1',
      sectionId: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
    },
    embeddableConfig: {
      title: 'Top 15 Tools by Call Count',
      attributes: {
        visualizationType: 'lnsPie',
        title: '',
        state: {
          datasourceStates: {
            textBased: {
              layers: {
                layer_0: {
                  index: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
                  query: {
                    esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Call Count` = COUNT(*) BY `Tool Name` = name\n| SORT `Call Count` DESC\n| LIMIT 15',
                  },
                  timeField: '@timestamp',
                  columns: [
                    {
                      columnId: 'partition_value_accessor_metric_0',
                      fieldName: 'Call Count',
                      meta: {
                        type: 'number',
                      },
                    },
                    {
                      columnId: 'partition_value_accessor_group_by_0',
                      fieldName: 'Tool Name',
                      meta: {
                        type: 'string',
                      },
                    },
                  ],
                  ignoreGlobalFilters: false,
                },
              },
            },
          },
          internalReferences: [
            {
              type: 'index-pattern',
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              name: 'indexpattern-datasource-layer-layer_0',
            },
          ],
          visualization: {
            shape: 'pie',
            layers: [
              {
                metrics: ['partition_value_accessor_metric_0'],
                primaryGroups: ['partition_value_accessor_group_by_0'],
                allowMultipleMetrics: false,
                layerId: 'layer_0',
                layerType: 'data',
                numberDisplay: 'percent',
                percentDecimals: 1,
                legendDisplay: 'show',
                legendSize: 'medium',
                truncateLegend: false,
                collapseFns: {},
                colorMapping: {
                  colorMode: {
                    type: 'categorical',
                  },
                  paletteId: 'default',
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
                },
                categoryDisplay: 'default',
              },
            ],
          },
          adHocDataViews: {
            'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp': {
              id: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__-@timestamp',
              title: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              name: 'traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__',
              timeFieldName: '@timestamp',
              sourceFilters: [],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              type: 'esql',
            },
          },
          query: {
            esql: 'FROM traces-agent_builder.otel-__AGENT_BUILDER_TRACES_NAMESPACE__\n| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n| WHERE `span.name` LIKE "execute_tool *"\n| STATS `Call Count` = COUNT(*) BY `Tool Name` = name\n| SORT `Call Count` DESC\n| LIMIT 15',
          },
          filters: [],
        },
        references: [],
      },
    },
  },
];

/** Collapsible sections that group the panels above. */
const sections = [
  {
    collapsed: false,
    gridData: {
      i: '466dc07a-4a6a-4b5d-b82f-7e96e890e545',
      y: 5,
    },
    title: '💰 Token Usage & Cost',
  },
  {
    collapsed: false,
    gridData: {
      i: 'fe075a3d-30b1-43f4-bb1d-87767d91579e',
      y: 6,
    },
    title: '💬 Conversation Volume & Latency',
  },
  {
    collapsed: false,
    gridData: {
      i: '7f9d1645-0bc3-49fa-9630-4dc3e28418c6',
      y: 7,
    },
    title: '🤖 Agent Execution',
  },
  {
    collapsed: true,
    gridData: {
      i: '894aa1e7-61e8-4fd4-8b99-842f8ab9f73f',
      y: 8,
    },
    title: '🔧 Tool Call Frequency & Errors',
  },
];

/** Saved object meta describing the (empty) base query for the dashboard. */
const searchSource = {
  query: {
    query: '',
    language: 'kuery',
  },
};

/** Dashboard display options. */
const options = {
  hidePanelTitles: false,
  hidePanelBorders: false,
  useMargins: true,
  syncColors: false,
  syncTooltips: false,
  syncCursor: true,
  autoApplyFilters: true,
};

/**
 * Managed Agent Builder overview dashboard saved object. The deeply-nested
 * `panelsJSON`/`optionsJSON`/`searchSourceJSON` fields are stringified here so
 * the rest of the definition above can stay human-readable.
 */
export const overviewDashboard = {
  id: AGENT_BUILDER_OVERVIEW_DASHBOARD_ID,
  type: 'dashboard',
  managed: true,
  coreMigrationVersion: AGENT_BUILDER_DASHBOARD_CORE_MIGRATION_VERSION,
  typeMigrationVersion: AGENT_BUILDER_DASHBOARD_TYPE_MIGRATION_VERSION,
  references: [],
  attributes: {
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify(searchSource),
    },
    optionsJSON: JSON.stringify(options),
    panelsJSON: JSON.stringify(panels),
    sections,
    timeRestore: false,
    title: '[Elastic] Agent Builder Overview',
    version: AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION,
  },
};
