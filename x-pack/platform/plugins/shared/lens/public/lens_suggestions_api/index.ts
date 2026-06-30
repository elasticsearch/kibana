/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { VisualizeFieldContext } from '@kbn/ui-actions-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { ChartType, mapVisToChartType } from '@kbn/visualization-utils';
import { hasTransformationalCommand } from '@kbn/esql-utils';
import type {
  DatasourceMap,
  VisualizationMap,
  VisualizeEditorContext,
  DataViewsState,
  TypedLensByValueInput,
} from '@kbn/lens-common';
import { getSuggestions } from '../editor_frame_service/editor_frame/suggestion_helpers';
import { createSuggestionWithAttributes, selectAndApplyChartSuggestion } from './helpers';

interface SuggestionsApiProps {
  context: VisualizeFieldContext | VisualizeEditorContext;
  dataView: DataView;
  visualizationMap?: VisualizationMap;
  datasourceMap?: DatasourceMap;
  excludedVisualizations?: string[];
  preferredChartType?: ChartType;
  preferredVisAttributes?: TypedLensByValueInput['attributes'];
}

const APPROXIMATION_COLUMN_PREFIX = '_approximation_';

export const suggestionsApi = ({
  context,
  dataView,
  datasourceMap,
  visualizationMap,
  excludedVisualizations,
  preferredChartType,
  preferredVisAttributes,
}: SuggestionsApiProps) => {
  const initialContext =
    'textBasedColumns' in context && context.textBasedColumns
      ? {
          ...context,
          textBasedColumns: context.textBasedColumns.filter(
            (col) => !col.name.startsWith(APPROXIMATION_COLUMN_PREFIX)
          ),
        }
      : context;
  if (!datasourceMap || !visualizationMap || !dataView.id) return undefined;
  const datasourceStates = {
    formBased: {
      isLoading: false,
      state: {
        layers: {},
      },
    },
    textBased: {
      isLoading: false,
      state: {
        layers: {},
        indexPatternRefs: [],
        initialContext,
      },
    },
  };
  const currentDataViewId = dataView.id;
  const dataViews = {
    indexPatterns: {
      [currentDataViewId]: dataView,
    },
    indexPatternRefs: [],
  } as unknown as DataViewsState;

  const initialVisualization = visualizationMap?.[Object.keys(visualizationMap)[0]] || null;
  const isInitialSubTypeSupported = preferredChartType
    ? initialVisualization?.isSubtypeSupported?.(preferredChartType.toLowerCase())
    : undefined;

  const query = 'query' in context ? context.query : undefined;

  // When preferred visualization attributes are provided, pass the prior visualization state
  // so that each visualization's suggestion logic can preserve its own settings (e.g. XY chart
  // preserves legend, axis titles, etc. via its buildSuggestion when it receives currentState).
  const preferredVisualization = preferredVisAttributes
    ? visualizationMap[preferredVisAttributes.visualizationType] ?? initialVisualization
    : initialVisualization;
  const previousVisualizationState = preferredVisAttributes
    ? preferredVisAttributes.state.visualization
    : undefined;

  // find the active visualizations from the context
  const suggestions = getSuggestions({
    datasourceMap,
    datasourceStates,
    visualizationMap,
    activeVisualization: preferredVisualization,
    visualizationState: previousVisualizationState,
    visualizeTriggerFieldContext: context,
    subVisualizationId: isInitialSubTypeSupported ? preferredChartType?.toLowerCase() : undefined,
    dataViews,
    query,
  });
  if (!suggestions.length) return [];

  const primarySuggestion =
    preferredVisAttributes && preferredVisualization
      ? suggestions.find(
          (suggestion) => suggestion.visualizationId === preferredVisualization.id
        ) ?? suggestions[0]
      : suggestions[0];
  const activeVisualization = visualizationMap[primarySuggestion.visualizationId];
  if (
    primarySuggestion.incomplete ||
    excludedVisualizations?.includes(primarySuggestion.visualizationId)
  ) {
    return [];
  }
  const chartType = preferredChartType?.toLowerCase();

  // compute the rest suggestions depending on the active one and filter out the lnsLegacyMetric
  const newSuggestions = getSuggestions({
    datasourceMap,
    datasourceStates: {
      textBased: {
        isLoading: false,
        state: primarySuggestion.datasourceState,
      },
    },
    visualizationMap,
    activeVisualization,
    subVisualizationId: chartType,
    visualizationState: primarySuggestion.visualizationState,
    dataViews,
    query,
  }).filter(
    (sug) =>
      // Datatables are always return as hidden suggestions
      // if the user has requested for a datatable (preferredChartType), we want to return it
      // although it is a hidden suggestion
      (sug.hide && sug.visualizationId === 'lnsDatatable') ||
      // Filter out suggestions that are hidden and legacy metrics
      (!sug.hide && sug.visualizationId !== 'lnsLegacyMetric')
  );

  const chartTypeFromAttrs = preferredVisAttributes
    ? mapVisToChartType(preferredVisAttributes.visualizationType)
    : undefined;

  const targetChartType = preferredChartType ?? chartTypeFromAttrs;

  // However, for ESQL queries without transformational commands, prefer datatable
  const hasTransformations = query ? hasTransformationalCommand(query.esql) : true;

  // in case the user asks for another type (except from area, line) check if it exists
  // in suggestions and return this instead
  const suggestionsList = [primarySuggestion, ...newSuggestions]
    .filter((s) => {
      // if we only have non-transformed ESQL, suggest only table
      if (!hasTransformations) {
        return s.visualizationId === 'lnsDatatable';
      }
      return true;
    })
    .sort((a, b) => {
      const priorityA = visualizationMap[a.visualizationId]?.suggestionPriority ?? 0;
      const priorityB = visualizationMap[b.visualizationId]?.suggestionPriority ?? 0;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return b.score - a.score;
    });

  // Handle preferred chart type logic
  if (targetChartType) {
    // Special case for table when user hasn't changed chart type and there's only one suggestion
    if (
      !preferredChartType &&
      suggestionsList.length === 1 &&
      targetChartType === ChartType.Table
    ) {
      const suggestion = createSuggestionWithAttributes(
        suggestionsList[0],
        preferredVisAttributes,
        context
      );
      return [suggestion];
    }

    // General case: find compatible suggestion for preferred chart type
    // Skip if user hasn't changed chart type, has multiple suggestions, and wants table
    const shouldSkipSearch =
      !preferredChartType && suggestionsList.length > 1 && targetChartType === ChartType.Table;
    if (!shouldSkipSearch) {
      return [
        selectAndApplyChartSuggestion({
          suggestionsList,
          targetChartType,
          chartType,
          visualizationMap,
          preferredVisAttributes,
          context,
        }),
      ];
    }
  }

  return suggestionsList;
};
