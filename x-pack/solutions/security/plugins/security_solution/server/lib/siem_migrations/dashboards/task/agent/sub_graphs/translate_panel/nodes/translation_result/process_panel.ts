/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esFieldTypeToKibanaFieldType, KBN_FIELD_TYPES } from '@kbn/field-types';
import { getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { ParsedPanel } from '../../../../../../../../../../common/siem_migrations/parsers/types';
import type { EsqlColumn } from '../../types';

const kbnFieldTypeValues = new Set<string>(Object.values(KBN_FIELD_TYPES));

/**
 * Converts a field type string to a valid Kibana field type.
 * First attempts to map as an Elasticsearch field type (e.g. "double" -> "number").
 * If that yields "unknown", checks whether the input is already a valid Kibana
 * field type (e.g. "number") and uses it directly. This handles LLM responses
 * that return Kibana types instead of Elasticsearch types.
 */
export const toKibanaFieldType = (type: string): string => {
  const mapped = esFieldTypeToKibanaFieldType(type);
  if (mapped !== KBN_FIELD_TYPES.UNKNOWN) {
    return mapped;
  }
  if (kbnFieldTypeValues.has(type)) {
    return type;
  }
  return KBN_FIELD_TYPES.UNKNOWN;
};

interface ColumnInfo {
  columnId: string;
  fieldName: string;
  meta: {
    type: string;
  };
  inMetricDimension?: boolean;
}

interface PanelJSON {
  title?: string;
  gridData?: {
    x: number;
    y: number;
    w: number;
    h: number;
    i: string;
    sectionId?: string;
  };
  panelIndex?: string;
  embeddableConfig?: {
    attributes?: {
      state?: {
        visualization?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        datasourceStates?: {
          textBased?: {
            layers?: {
              [key: string]: {
                query?: { esql: string };
                columns?: ColumnInfo[];
              };
            };
            indexPatternRefs?: Array<{ id: string; title: string }>;
          };
        };
        query?: { esql: string };
        adHocDataViews?: Record<string, { title: string; name: string; [key: string]: unknown }>;
      };
    };
  };
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Process the panel and return the modified panelJSON
export const processPanel = (
  panel: object,
  query: string,
  esqlColumns: EsqlColumn[],
  parsedPanel: ParsedPanel
): object => {
  const panelJSON = structuredClone(panel) as PanelJSON;

  const { columnList, columns } = parseColumns(esqlColumns);
  const vizType = parsedPanel.viz_type;

  // Set panel basic properties
  panelJSON.title = parsedPanel.title;

  // Set position from parsed_panel.position
  if (parsedPanel.position) {
    panelJSON.gridData = {
      x: parsedPanel.position.x,
      y: parsedPanel.position.y,
      w: parsedPanel.position.w,
      h: parsedPanel.position.h,
      i: parsedPanel.id,
      sectionId: parsedPanel.section?.id,
    };
    panelJSON.panelIndex = parsedPanel.id;
  }

  // Configure visualization-specific properties
  configureVixTypeProperties(panelJSON, vizType, query, columns);
  configureStackedProperties(panelJSON, vizType, columns);
  configureDatasourceProperties(panelJSON, query, columnList);

  return panelJSON;
};

// Parse columns from ESQL query and build column array for panel JSON
function parseColumns(extractedColumns: EsqlColumn[]): {
  columnList: ColumnInfo[];
  columns: string[];
} {
  const columnList: ColumnInfo[] = [];
  const columnNames: string[] = [];
  extractedColumns.forEach(({ name: columnName, type }, index) => {
    columnList.push({
      columnId: columnName,
      fieldName: columnName,
      meta: { type: toKibanaFieldType(type) },
      /* The first column is mostly a metric so here we are making that assumption
       * unless we have better way to do this. */
      ...(index === 0 ? { inMetricDimension: true } : {}),
    });
    columnNames.push(columnName);
  });

  return { columnList, columns: columnNames };
}

// Configure chart-specific properties
function configureVixTypeProperties(
  panelJSON: PanelJSON,
  vizType: string,
  query: string,
  columns: string[]
): void {
  const chartTypes = [
    'bar',
    'bar_vertical',
    'bar_horizontal',
    'bar_vertical_stacked',
    'bar_horizontal_stacked',
    'area',
    'area_stacked',
    'line',
    'heatmap',
    'markdown',
  ];

  if (chartTypes.includes(vizType)) {
    if (panelJSON.embeddableConfig?.attributes?.state?.visualization?.layers?.[0]) {
      panelJSON.embeddableConfig.attributes.state.visualization.layers[0].xAccessor =
        columns[columns.length - 1];
      panelJSON.embeddableConfig.attributes.state.visualization.layers[0].accessors = [columns[0]];
    }
  }

  if (vizType === 'pie') {
    if (panelJSON.embeddableConfig?.attributes?.state?.visualization?.layers?.[0]) {
      panelJSON.embeddableConfig.attributes.state.visualization.layers[0].primaryGroups = [
        columns[columns.length - 1],
      ];
      panelJSON.embeddableConfig.attributes.state.visualization.layers[0].metrics = [[columns[0]]];
    }
  }

  if (vizType === 'table') {
    if (panelJSON.embeddableConfig?.attributes?.state?.visualization) {
      panelJSON.embeddableConfig.attributes.state.visualization.columns = columns.map((column) => ({
        columnId: column,
      }));
    }
  }

  if (vizType === 'heatmap') {
    configureHeatmapProperties(panelJSON, columns);
  }

  if (vizType === 'treemap') {
    configureTreemapProperties(panelJSON, columns);
  }

  // Handle metric visualization
  if (vizType === 'metric') {
    if (panelJSON.embeddableConfig?.attributes?.state?.visualization) {
      panelJSON.embeddableConfig.attributes.state.visualization.metricAccessor = columns[0];
    }
  }

  // Handle gauge visualization
  if (vizType === 'gauge') {
    configureGaugeProperties(panelJSON, query, columns);
  }
}

// Configure heatmap specific properties
function configureHeatmapProperties(panelJSON: PanelJSON, columns: string[]): void {
  if (panelJSON.embeddableConfig?.attributes?.state?.visualization) {
    panelJSON.embeddableConfig.attributes.state.visualization.valueAccessor = columns[0];
    panelJSON.embeddableConfig.attributes.state.visualization.xAccessor =
      columns[columns.length - 1];
    if (columns.length > 1) {
      panelJSON.embeddableConfig.attributes.state.visualization.yAccessor =
        columns[columns.length - 2];
    }
  }
}

// Configure treemap specific properties
function configureTreemapProperties(panelJSON: PanelJSON, columns: string[]): void {
  if (panelJSON.embeddableConfig?.attributes?.state?.visualization?.layers?.[0]) {
    if (panelJSON.embeddableConfig.attributes.state.visualization.layers[0].metrics) {
      panelJSON.embeddableConfig.attributes.state.visualization.layers[0].metrics.push(columns[0]);
    }
    if (panelJSON.embeddableConfig.attributes.state.visualization.layers[0].primaryGroups) {
      for (let i = 1; i < columns.length - 1; i++) {
        panelJSON.embeddableConfig.attributes.state.visualization.layers[0].primaryGroups.push(
          columns[i]
        );
      }
    }
  }
}

// Configure gauge visualization
function configureGaugeProperties(panelJSON: PanelJSON, query: string, columns: string[]): void {
  const gaugeLayerId = '3b1b0102-bb45-40f5-9ef2-419d2eaaa56c';
  if (
    panelJSON.embeddableConfig?.attributes?.state?.datasourceStates?.textBased?.layers?.[
      gaugeLayerId
    ]
  ) {
    const gaugeLayer =
      panelJSON.embeddableConfig.attributes.state.datasourceStates.textBased.layers[gaugeLayerId];
    if (gaugeLayer.columns?.[0]) {
      gaugeLayer.columns[0].fieldName = columns[0];
      gaugeLayer.columns[0].columnId = columns[0];
    }
    gaugeLayer.query = { esql: query };
  }
  if (panelJSON.embeddableConfig?.attributes?.state?.visualization) {
    panelJSON.embeddableConfig.attributes.state.visualization.metricAccessor = columns[0];
  }
}

// Configure stacked chart properties
function configureStackedProperties(
  panelJSON: PanelJSON,
  vizType: string,
  columns: string[]
): void {
  if ((vizType.includes('stacked') || vizType.includes('line')) && columns.length > 2) {
    const layer = panelJSON.embeddableConfig?.attributes?.state?.visualization?.layers?.[0];
    if (layer) {
      if (!layer.splitAccessors) {
        layer.splitAccessors = [];
      }
      layer.splitAccessors[0] = columns[columns.length - 2];
    }
  }

  if (vizType.includes('stacked') && columns.length === 2) {
    const layer = panelJSON.embeddableConfig?.attributes?.state?.visualization?.layers?.[0];
    if (layer) {
      if (!layer.splitAccessors) {
        layer.splitAccessors = [];
      }
      layer.splitAccessors[0] = columns[columns.length - 1];
    }
  }
}

// Configure datasource properties
function configureDatasourceProperties(
  panelJSON: PanelJSON,
  query: string,
  columnList: ColumnInfo[]
): void {
  const indexPattern = getIndexPatternFromESQLQuery(query);

  const textBased = panelJSON.embeddableConfig?.attributes?.state?.datasourceStates?.textBased;
  if (textBased?.layers) {
    const layerId = '3a5310ab-2832-41db-bdbe-1b6939dd5651';
    if (textBased.layers[layerId]) {
      textBased.layers[layerId].query = { esql: query };
      textBased.layers[layerId].columns = columnList;
    }

    if (textBased.indexPatternRefs?.[0]) {
      textBased.indexPatternRefs[0].title = indexPattern;
    }
  }

  const state = panelJSON.embeddableConfig?.attributes?.state;
  if (state?.query) {
    state.query.esql = query;
  }

  if (state?.adHocDataViews) {
    for (const spec of Object.values(state.adHocDataViews)) {
      spec.title = indexPattern;
      spec.name = indexPattern;
    }
  }
}
