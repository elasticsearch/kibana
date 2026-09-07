/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LENS_DATASOURCE_ID,
  LENS_METRIC_GROUP_ID,
  buildTrendlineBucketExpression,
  buildTrendlineQueryWithMetricFieldMap,
} from '@kbn/lens-common';

import React from 'react';

import type { CoreStart } from '@kbn/core/public';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import { getESQLAdHocDataview } from '@kbn/esql-utils';
import type { AggregateQuery } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { Reference } from '@kbn/content-management-utils';
import type { ExpressionsStart, DatatableColumn } from '@kbn/expressions-plugin/public';
import type { DataViewsPublicPluginStart, DataView } from '@kbn/data-views-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import memoizeOne from 'memoize-one';
import { flatten, isEqual } from 'lodash';
import type {
  DatasourceDimensionEditorProps,
  DatasourceLayerPanelProps,
  PublicAPIProps,
  DataType,
  TableChangeType,
  DatasourceDimensionTriggerProps,
  DataSourceInfo,
  UserMessage,
  OperationMetadata,
  TextBasedPrivateState,
  TextBasedPersistedState,
  TextBasedLayerColumn,
  TextBasedField,
  Datasource,
  DatasourceSuggestion,
} from '@kbn/lens-common';
import { TextBasedDimensionEditor } from './components/dimension_editor';
import { TextBasedDimensionTrigger } from './components/dimension_trigger';
import { LayerSettingsPanel } from './layer_settings';
import { toExpression } from './to_expression';
import { generateId } from '../../id_generator';
import { getUniqueLabelGenerator, nonNullable } from '../../utils';
import { onDrop, getDropProps } from './dnd';
import { removeColumn } from './remove_column';
import {
  canColumnBeUsedBeInMetricDimension,
  isNotNumeric,
  isNumeric,
  MAX_NUM_OF_COLUMNS,
} from './utils';
import {
  getColumnsFromCache,
  addColumnsToCache,
  retrieveLayerColumnsFromCache,
} from './fieldlist_cache';
import { TEXT_BASED_LANGUAGE_ERROR } from '../../user_messages_ids';

function getLayerReferenceName(layerId: string) {
  return `textBasedLanguages-datasource-layer-${layerId}`;
}

const getSelectedFieldsFromColumns = memoizeOne(
  (columns: TextBasedLayerColumn[]) =>
    columns
      .map((c) => {
        if ('fieldName' in c) {
          return c.fieldName;
        }
      })
      .filter(nonNullable),
  isEqual
);

const getUnchangedSuggestionTable = (
  state: TextBasedPrivateState,
  allColumns: TextBasedLayerColumn[],
  id: string
) => {
  return {
    state: {
      ...state,
    },
    table: {
      changeType: 'unchanged' as TableChangeType,
      isMultiRow: false,
      layerId: id,
      columns:
        state.layers[id].columns?.map((f) => {
          const inMetricDimension = canColumnBeUsedBeInMetricDimension(allColumns, f?.meta?.type);
          return {
            columnId: f.columnId,
            operation: {
              dataType: f?.meta?.type as DataType,
              label: f.fieldName,
              isBucketed: Boolean(isNotNumeric(f)),
              // makes non-number fields to act as metrics, used for datatable suggestions
              ...(inMetricDimension && {
                inMetricDimension,
              }),
            },
          };
        }) ?? [],
    },
    keptLayerIds: [id],
  };
};

const getSuggestionsByRules = (
  state: TextBasedPrivateState,
  allColumns: TextBasedLayerColumn[],
  id: string,
  rules: Array<{ isBucketed: boolean; allowAll?: boolean }>
) => {
  const columnsToKeep = rules.reduce<TextBasedLayerColumn[]>((acc, rule) => {
    const fn = rule.isBucketed ? isNotNumeric : isNumeric;
    let column = state.layers[id].columns?.find(
      (col) => fn(col) && !acc.some((c) => c.columnId === col.columnId)
    );
    if (!column && rule.allowAll) {
      column = state.layers[id].columns?.find(
        (col) => !acc.some((c) => c.columnId === col.columnId)
      );
    }
    return column ? [...acc, column] : acc;
  }, []);

  if (!columnsToKeep.length || columnsToKeep.length !== rules.length) {
    return;
  }
  return {
    state: {
      ...state,
      layers: {
        [id]: {
          ...state.layers[id],
          columns: columnsToKeep,
        },
      },
    },
    table: {
      changeType: 'reduced' as TableChangeType,
      isMultiRow: false,
      layerId: id,
      columns:
        columnsToKeep?.map((f, i) => {
          const inMetricDimension = canColumnBeUsedBeInMetricDimension(allColumns, f?.meta?.type);
          return {
            columnId: f.columnId,
            operation: {
              dataType: f?.meta?.type as DataType,
              label: f.fieldName,
              isBucketed: !!rules[i].isBucketed,
              // makes non-number fields to act as metrics, used for datatable suggestions
              ...(inMetricDimension && {
                inMetricDimension,
              }),
            },
          };
        }) ?? [],
    },
    keptLayerIds: [id],
  };
};

export function getTextBasedDatasource({
  core,
  storage,
  data,
  expressions,
  dataViews,
}: {
  core: CoreStart;
  storage: IStorageWrapper;
  data: DataPublicPluginStart;
  expressions: ExpressionsStart;
  dataViews: DataViewsPublicPluginStart;
}) {
  const getSuggestionsForState = (state: TextBasedPrivateState) => {
    return Object.entries(state.layers)?.flatMap(([id, layer]) => {
      const allColumns = retrieveLayerColumnsFromCache(layer.columns, layer.query);

      if (!allColumns.length && layer.query) {
        const layerColumns = layer.columns.map((c) => ({
          id: c.columnId,
          name: c.fieldName,
          meta: c.meta,
        })) as DatatableColumn[];
        addColumnsToCache(layer.query, layerColumns);
      }

      const unchangedSuggestionTable = getUnchangedSuggestionTable(state, allColumns, id);

      // we are trying here to cover the most common cases for the charts we offer
      const metricTable = getSuggestionsByRules(state, allColumns, id, [{ isBucketed: false }]);
      const metricBucketTable = getSuggestionsByRules(state, allColumns, id, [
        { isBucketed: false },
        { isBucketed: true, allowAll: true },
      ]);
      const metricBucketBucketTable = getSuggestionsByRules(state, allColumns, id, [
        { isBucketed: false },
        { isBucketed: true, allowAll: true },
        { isBucketed: true, allowAll: true },
      ]);

      return [unchangedSuggestionTable, metricBucketBucketTable, metricBucketTable, metricTable]
        .filter(nonNullable)
        .reduce<Array<DatasourceSuggestion<TextBasedPrivateState>>>((acc, cur) => {
          if (acc.find(({ table }) => isEqual(table.columns, cur.table.columns))) {
            return acc;
          }
          return [...acc, cur];
        }, []);
    });
  };
  const getSuggestionsForVisualizeField = (
    state: TextBasedPrivateState,
    indexPatternId: string,
    fieldName: string
  ) => {
    const context = state.initialContext;
    // on text based mode we offer suggestions for the query and not for a specific field
    if (fieldName) return [];
    if (context && 'dataViewSpec' in context && context.dataViewSpec.id && context.query) {
      const newLayerId = generateId();
      const textBasedQueryColumns = context.textBasedColumns?.slice(0, MAX_NUM_OF_COLUMNS) ?? [];
      // Number fields are assigned automatically as metrics (!isBucketed). There are cases where the query
      // will not return number fields. In these cases we want to suggest a datatable
      // Datatable works differently in this case. On the metrics dimension can be all type of fields
      const hasNumberTypeColumns = textBasedQueryColumns?.some(isNumeric);
      const newColumns = textBasedQueryColumns.map((c) => {
        const inMetricDimension = canColumnBeUsedBeInMetricDimension(
          textBasedQueryColumns,
          c?.meta?.type
        );
        return {
          columnId: c.variable ?? c.id,
          fieldName: c.variable ? `??${c.variable}` : c.id,
          variable: c.variable,
          label: c.name,
          customLabel: c.id !== c.name,
          meta: c.meta,
          // makes non-number fields to act as metrics, used for datatable suggestions
          ...(inMetricDimension && {
            inMetricDimension,
          }),
        };
      });

      addColumnsToCache(context.query, textBasedQueryColumns);

      const index = context.dataViewSpec.id ?? context.dataViewSpec.title;
      const query = context.query;
      const updatedState = {
        ...state,
        initialContext: undefined,
        ...(context.dataViewSpec.id
          ? {
              indexPatternRefs: [
                {
                  id: context.dataViewSpec.id,
                  title: context.dataViewSpec.title ?? '',
                  timeField: context.dataViewSpec.timeFieldName,
                },
              ],
            }
          : {}),
        layers: {
          ...state.layers,
          [newLayerId]: {
            index,
            query,
            columns: newColumns ?? [],
            timeField: context.dataViewSpec.timeFieldName,
          },
        },
      };

      return [
        {
          state: {
            ...updatedState,
          },
          table: {
            changeType: 'initial' as TableChangeType,
            isMultiRow: false,
            notAssignedMetrics: !hasNumberTypeColumns,
            layerId: newLayerId,
            columns:
              newColumns?.map((f) => {
                return {
                  columnId: f.columnId,
                  operation: {
                    dataType: f?.meta?.type as DataType,
                    label: f.fieldName,
                    isBucketed: Boolean(isNotNumeric(f)),
                  },
                };
              }) ?? [],
          },
          keptLayerIds: [newLayerId],
        },
      ];
    }

    return [];
  };
  const TextBasedDatasource: Datasource<TextBasedPrivateState, TextBasedPersistedState> = {
    id: LENS_DATASOURCE_ID.TEXT_BASED,

    checkIntegrity: () => {
      return [];
    },
    getUserMessages: (state) => {
      const errors: Error[] = [];

      Object.values(state.layers).forEach((layer) => {
        if (layer.errors && layer.errors.length > 0) {
          errors.push(...layer.errors);
        }
      });
      return errors.map((err) => {
        const message: UserMessage = {
          uniqueId: TEXT_BASED_LANGUAGE_ERROR,
          severity: 'error',
          fixableInEditor: true,
          displayLocations: [{ id: 'visualization' }, { id: 'textBasedLanguagesQueryInput' }],
          shortMessage: err.message,
          longMessage: err.message,
        };
        return message;
      });
    },
    initialize(
      state?: TextBasedPersistedState,
      references?,
      context?,
      indexPatternRefs?,
      indexPatterns?
    ) {
      const patterns = indexPatterns ? Object.values(indexPatterns) : [];
      const refs = patterns.map((p) => {
        return {
          id: p.id,
          title: p.title,
          timeField: p.timeFieldName,
        };
      });

      const initState = state ?? { layers: {} };
      const hydratedLayers: typeof initState.layers = {};

      // Validate the layers without a timeField configured at runtime.
      // The ad-hoc DataView specs are regenerated at initialization (with time field
      // detection via HTTP), but the persisted layer state may not have a timeField (if comes from the API)
      // This ensures each layer picks up the correct timeFieldName so that
      // time-based filtering works correctly for ES|QL visualizations.
      for (const [layerId, persistedLayer] of Object.entries(initState.layers)) {
        // Inject the data view reference extracted by getPersistableState back into
        // the layer: on saved-object import or copy-to-space the reference id gets
        // remapped, while the copy kept in layer.index still points at the source
        // space's data view.
        const reference = references?.find(({ name }) => name === getLayerReferenceName(layerId));
        const layer =
          reference && persistedLayer.index !== reference.id
            ? { ...persistedLayer, index: reference.id }
            : persistedLayer;

        if (layer.timeField || !indexPatterns) {
          hydratedLayers[layerId] = layer;
          continue;
        }

        const matchedIndexPattern = layer.index ? indexPatterns[layer.index] : undefined;
        hydratedLayers[layerId] = matchedIndexPattern?.timeFieldName
          ? { ...layer, timeField: matchedIndexPattern.timeFieldName }
          : layer;
      }

      return {
        ...initState,
        layers: hydratedLayers,
        indexPatternRefs: refs,
        initialContext: context,
      };
    },

    // Synchronizes columns between linked layers. When a visualization declares
    // dimension links (e.g. a metric chart linking its primary metric column to
    // the trendline layer), this method copies the source column definition into
    // the target layer so that the trendline layer has the same field/meta info
    // without the user manually configuring it.
    syncColumns({ state, links }) {
      if (!links?.length) return state;

      let newState = state;
      for (const link of links) {
        const fromLayer = newState.layers[link.from.layerId];
        const toLayer = newState.layers[link.to.layerId];
        if (!fromLayer || !toLayer) continue;

        const sourceCol = fromLayer.columns.find((c) => c.columnId === link.from.columnId);
        if (!sourceCol) continue;

        const trendlineLayerLinks = links.filter((l) => l.to.layerId === link.to.layerId);

        // Collect metric field names from all links targeting the same
        // trendline layer so the auto-generated STATS uses AVG(<field>)
        // instead of COUNT(*) when the source query has no STATS.
        const metricGroupIds: string[] = [
          LENS_METRIC_GROUP_ID.METRIC,
          LENS_METRIC_GROUP_ID.SECONDARY_METRIC,
        ];
        const metricFields = trendlineLayerLinks
          .filter((l) => metricGroupIds.includes(l.from.groupId))
          .map((l) => fromLayer.columns.find((c) => c.columnId === l.from.columnId))
          .filter((c): c is TextBasedLayerColumn => Boolean(c))
          .map((c) => c.fieldName);

        const groupByColumns = trendlineLayerLinks
          .filter((l) => l.from.groupId === LENS_METRIC_GROUP_ID.BREAKDOWN_BY)
          .map((l) => fromLayer.columns.find((c) => c.columnId === l.from.columnId))
          .filter((c): c is TextBasedLayerColumn => Boolean(c))
          .filter((c) => c.fieldName !== toLayer.timeField);
        const groupByFields = groupByColumns.map((c) => c.fieldName);

        // Sync the trendline layer's query from the source layer.
        // The trendline query is derived from the main query with an appropriate
        // BUCKET() or TBUCKET() clause. When the main query changes we must regenerate it.
        let updatedQuery = toLayer.query;
        let metricFieldMap = new Map<string, string>();
        let trendlineTimeField: string | undefined;
        if (fromLayer.query && isOfAggregateQueryType(fromLayer.query) && toLayer.timeField) {
          try {
            const trendlineQueryResult = buildTrendlineQueryWithMetricFieldMap(
              fromLayer.query.esql,
              toLayer.timeField,
              metricFields,
              groupByFields
            );
            metricFieldMap = trendlineQueryResult.metricFieldMap;
            trendlineTimeField = trendlineQueryResult.timeField;
            if (
              !updatedQuery ||
              !isOfAggregateQueryType(updatedQuery) ||
              updatedQuery.esql !== trendlineQueryResult.query
            ) {
              updatedQuery = { esql: trendlineQueryResult.query };
            }
          } catch {
            // If the query can't be parsed, keep the existing query unchanged
          }
        }

        const shouldSkipColumn =
          link.from.groupId === LENS_METRIC_GROUP_ID.BREAKDOWN_BY &&
          !groupByColumns.some((c) => c.columnId === link.from.columnId);
        const newCol: TextBasedLayerColumn = {
          ...sourceCol,
          columnId: link.to.columnId,
          // When the source has no STATS, the shared trendline query helper wraps
          // raw metric fields in AVG(); use its map so the column fieldName matches.
          ...(metricFieldMap.has(sourceCol.fieldName) && {
            fieldName: metricFieldMap.get(sourceCol.fieldName),
          }),
        };

        const existingCol = toLayer.columns.find((c) => c.columnId === link.to.columnId);

        // Update columns: add if missing, update if field changed. The trendline
        // time column is the only generated column not represented by a link.
        const linkedTargetColumnIds = new Set(trendlineLayerLinks.map((item) => item.to.columnId));
        const shouldUpdateTimeField = toLayer.columns.some(
          (column) =>
            trendlineTimeField &&
            column.meta?.type === 'date' &&
            !linkedTargetColumnIds.has(column.columnId) &&
            column.fieldName !== trendlineTimeField
        );
        let updatedColumns = shouldUpdateTimeField
          ? toLayer.columns.map((column) =>
              column.meta?.type === 'date' && !linkedTargetColumnIds.has(column.columnId)
                ? { ...column, fieldName: trendlineTimeField ?? column.fieldName }
                : column
            )
          : toLayer.columns;
        if (shouldSkipColumn) {
          updatedColumns = updatedColumns.filter((c) => c.columnId !== link.to.columnId);
        } else if (!existingCol) {
          updatedColumns = [...updatedColumns, newCol];
        } else if (existingCol.fieldName !== newCol.fieldName) {
          updatedColumns = updatedColumns.map((c) =>
            c.columnId === link.to.columnId ? newCol : c
          );
        }

        // Skip if nothing changed
        if (updatedColumns === toLayer.columns && updatedQuery === toLayer.query) continue;

        newState = {
          ...newState,
          layers: {
            ...newState.layers,
            [link.to.layerId]: {
              ...toLayer,
              columns: updatedColumns,
              query: updatedQuery,
            },
          },
        };
      }
      return newState;
    },

    onRefreshIndexPattern() {},

    getUsedDataViews: (state) => {
      return Object.values(state.layers)
        .map(({ index }) => index)
        .filter(nonNullable);
    },

    getPersistableState({ layers }: TextBasedPrivateState) {
      const references: Reference[] = [];
      Object.entries(layers).forEach(([layerId, { index, ...persistableLayer }]) => {
        if (index) {
          references.push({
            type: 'index-pattern',
            id: index,
            name: getLayerReferenceName(layerId),
          });
        }
      });
      return { state: { layers }, references };
    },
    insertLayer(state: TextBasedPrivateState, newLayerId: string) {
      const layer = Object.values(state?.layers)?.[0];
      const query = layer?.query;
      const index =
        layer?.index ??
        (JSON.parse(localStorage.getItem('lens-settings') || '{}').indexPatternId ||
          state.indexPatternRefs[0].id);
      // Resolve timeField from the source layer, or fall back to the index pattern ref
      const timeField =
        layer?.timeField ??
        state.indexPatternRefs?.find((ref) => ref.id === (layer?.index ?? index))?.timeField;
      return {
        ...state,
        layers: {
          ...state.layers,
          [newLayerId]: { ...blankLayer(index, query), timeField },
        },
      };
    },
    // Called by the visualization to pre-populate a dimension when a new layer is
    // created. For metric trendline layers, this auto-initializes the time field
    // column and applies the appropriate ES|QL time bucket so the trendline has
    // time-series data without manual user configuration.
    initializeDimension(state, layerId, indexPatterns, { columnId, groupId, autoTimeField }) {
      const layer = state.layers[layerId];
      if (!layer) return state;
      if (autoTimeField && layer.timeField) {
        const tf = layer.timeField;
        let trendlineTimeField = buildTrendlineBucketExpression(tf);

        // Auto-modify query to add time bucketing for trendline and resolve the
        // actual result column, including a user-defined TBUCKET alias.
        let trendlineQuery = layer.query;
        if (trendlineQuery && 'esql' in trendlineQuery) {
          try {
            const result = buildTrendlineQueryWithMetricFieldMap(trendlineQuery.esql, tf);
            trendlineQuery = { esql: result.query };
            trendlineTimeField = result.timeField;
          } catch {
            // If the query can't be parsed, keep the existing query unchanged
          }
        }

        const timeColumn: TextBasedLayerColumn = {
          columnId,
          fieldName: trendlineTimeField,
          meta: { type: 'date' },
        };

        return {
          ...state,
          layers: {
            ...state.layers,
            [layerId]: {
              ...layer,
              query: trendlineQuery,
              columns: [...layer.columns, timeColumn],
            },
          },
        };
      }
      return state;
    },
    createEmptyLayer() {
      return {
        indexPatternRefs: [],
        layers: {},
      };
    },

    cloneLayer(state, layerId, newLayerId, getNewId) {
      return {
        ...state,
      };
    },

    removeLayer(state: TextBasedPrivateState, layerId: string) {
      const newLayers = { ...state.layers };
      delete newLayers[layerId];

      return {
        removedLayerIds: [layerId],
        newState: {
          ...state,
          layers: newLayers,
        },
      };
    },

    clearLayer(state: TextBasedPrivateState, layerId: string) {
      return {
        removedLayerIds: [],
        newState: {
          ...state,
          layers: {
            ...state.layers,
            [layerId]: { ...state.layers[layerId], columns: [] },
          },
        },
      };
    },

    getLayers(state: TextBasedPrivateState) {
      return state && state.layers ? Object.keys(state?.layers) : [];
    },
    isTimeBased: (state) => {
      if (!state) return false;
      const { layers } = state;
      return Boolean(layers) && Object.values(layers).some((layer) => Boolean(layer.timeField));
    },
    getUsedDataView: (state: TextBasedPrivateState, layerId?: string) => {
      if (!layerId || !state.layers[layerId].index) {
        const layers = Object.values(state.layers);
        return layers?.[0]?.index as string;
      }
      return state.layers[layerId].index as string;
    },

    removeColumn,

    toExpression: (state, layerId, indexPatterns, dateRange, searchSessionId) => {
      return toExpression(state, layerId);
    },
    getSelectedFields(state) {
      return getSelectedFieldsFromColumns(
        Object.values(state?.layers)?.flatMap((l) => Object.values(l.columns))
      );
    },

    DataPanelComponent: () => null,

    DimensionTriggerComponent: (props: DatasourceDimensionTriggerProps<TextBasedPrivateState>) => {
      const columnLabelMap = TextBasedDatasource.uniqueLabels(props.state, props.indexPatterns);
      return (
        <TextBasedDimensionTrigger
          {...props}
          expressions={expressions}
          columnLabelMap={columnLabelMap}
        />
      );
    },

    getRenderEventCounters(state: TextBasedPrivateState): string[] {
      const counters = flatten(
        Object.values(state?.layers ?? {}).map((layer) => {
          if (isOfAggregateQueryType(layer.query)) {
            return ['esql_chart'];
          }
          return [];
        })
      );
      return counters;
    },

    DimensionEditorComponent: (props: DatasourceDimensionEditorProps<TextBasedPrivateState>) => {
      return <TextBasedDimensionEditor {...props} expressions={expressions} />;
    },

    LayerPanelComponent: (props: DatasourceLayerPanelProps<TextBasedPrivateState>) => {
      return null;
    },

    LayerSettingsComponent: LayerSettingsPanel,

    uniqueLabels(state: TextBasedPrivateState) {
      const layers = state.layers;
      const columnLabelMap = {} as Record<string, string>;
      const uniqueLabelGenerator = getUniqueLabelGenerator();

      Object.values(layers).forEach((layer) => {
        if (!layer.columns) {
          return;
        }
        Object.values(layer.columns).forEach((column) => {
          columnLabelMap[column.columnId] = uniqueLabelGenerator(
            column.customLabel ? column.label ?? column.fieldName : column.fieldName
          );
        });
      });

      return columnLabelMap;
    },
    getDropProps,
    onDrop,
    getPublicAPI({ state, layerId, indexPatterns }: PublicAPIProps<TextBasedPrivateState>) {
      return {
        datasourceId: LENS_DATASOURCE_ID.TEXT_BASED,

        getTableSpec: () => {
          const layerColumns = state.layers[layerId]?.columns ?? [];
          // Column ordering: non-metric columns (rows) before metric columns
          const nonMetric = layerColumns.filter((col) => !(col.inMetricDimension ?? false));
          const metric = layerColumns.filter((col) => col.inMetricDimension ?? false);
          return [...nonMetric, ...metric].map((column) => ({
            columnId: column.columnId,
            fields: [column.fieldName],
          }));
        },
        getOperationForColumnId: (columnId: string) => {
          const layer = state.layers[layerId];
          const column = layer?.columns?.find((c) => c.columnId === columnId);
          const columnLabelMap = TextBasedDatasource.uniqueLabels(state, indexPatterns);
          let scale: OperationMetadata['scale'] = 'ordinal';
          switch (column?.meta?.type) {
            case 'date':
              scale = 'interval';
              break;
            case 'number':
              scale = 'ratio';
              break;
            default:
              scale = 'ordinal';
              break;
          }

          if (column) {
            return {
              dataType: column?.meta?.type as DataType,
              label: columnLabelMap[columnId] ?? column?.fieldName,
              isBucketed: Boolean(isNotNumeric(column)),
              inMetricDimension: column.inMetricDimension,
              hasTimeShift: false,
              hasReducedTimeRange: false,
              ...(column.customLabel ? { customLabel: true } : {}),
              scale,
            };
          }
          return null;
        },
        getVisualDefaults: () => ({}),
        isTextBasedLanguage: () => true,
        getMaxPossibleNumValues: (columnId) => {
          return null;
        },
        getSourceId: () => {
          const layer = state.layers[layerId];
          return layer.index;
        },
        getFilters: () => {
          return {
            enabled: {
              kuery: [],
              lucene: [],
            },
            disabled: {
              kuery: [],
              lucene: [],
            },
          };
        },
        hasDefaultTimeField: () => Boolean(state.layers[layerId]?.timeField),
      };
    },
    getDatasourceSuggestionsForField(state, draggedField) {
      const layers = Object.values(state.layers);
      const query = layers?.[0]?.query;
      const fieldList = query ? getColumnsFromCache(query) : [];
      const field = fieldList?.find((f) => f.id === (draggedField as TextBasedField).id);
      if (!field) return [];
      return Object.entries(state.layers)?.map(([id, layer]) => {
        const newId = generateId();
        const newColumn = {
          columnId: newId,
          fieldName: field?.name ?? '',
          meta: field?.meta,
        };
        return {
          state: {
            ...state,
            layers: {
              ...state.layers,
              [id]: {
                ...state.layers[id],
                columns: [...layer.columns, newColumn],
              },
            },
          },
          table: {
            changeType: 'initial' as TableChangeType,
            isMultiRow: false,
            layerId: id,
            columns: [
              ...layer.columns?.map((f) => {
                return {
                  columnId: f.columnId,
                  operation: {
                    dataType: f?.meta?.type as DataType,
                    label: f.fieldName,
                    isBucketed: Boolean(isNotNumeric(f)),
                  },
                };
              }),
              {
                columnId: newId,
                operation: {
                  dataType: field?.meta?.type as DataType,
                  label: field?.name ?? '',
                  isBucketed: Boolean(isNotNumeric(field)),
                },
              },
            ],
          },
          keptLayerIds: [id],
        };
      });
    },
    getDatasourceSuggestionsForVisualizeField: getSuggestionsForVisualizeField,
    getDatasourceSuggestionsFromCurrentState: getSuggestionsForState,
    getDatasourceSuggestionsForVisualizeCharts: getSuggestionsForState,
    isEqual: (
      persistableState1: TextBasedPersistedState,
      references1: Reference[],
      persistableState2: TextBasedPersistedState,
      references2: Reference[]
    ) =>
      // undefined is not equal to missing
      isEqual(
        {
          initialContext: undefined,
          ...persistableState1,
        },
        {
          initialContext: undefined,
          ...persistableState2,
        }
      ),
    getDatasourceInfo: async (state, references, dataViewsService) => {
      if (!dataViewsService) {
        return [];
      }
      const indexPatterns: DataView[] = [];

      for (const { query } of Object.values(state.layers)) {
        if (query) {
          const esqlAdhocDataview = await getESQLAdHocDataview({
            dataViewsService,
            query: query.esql,
            options: { skipFetchFields: true },
          });
          indexPatterns.push(esqlAdhocDataview);
        }
      }

      return Object.entries(state.layers).reduce<DataSourceInfo[]>((acc, [key, layer]) => {
        const columns = Object.entries(layer.columns).map(([colId, col]) => {
          return {
            id: colId,
            role: isNotNumeric(col) ? ('split' as const) : ('metric' as const),
            operation: {
              dataType: col?.meta?.type as DataType,
              label: col.fieldName,
              isBucketed: Boolean(isNotNumeric(col)),
              hasTimeShift: false,
              hasReducedTimeRange: false,
              fields: [col.fieldName],
              type: col.meta?.type || 'unknown',
              filter: undefined,
            },
          };
        });

        acc.push({
          layerId: key,
          columns,
          dataView: indexPatterns?.find((dataView) => dataView.id === layer.index),
        });

        return acc;
      }, []);
    },
  };

  return TextBasedDatasource;
}

function blankLayer(index: string, query?: AggregateQuery) {
  return {
    index,
    query,
    columns: [],
  };
}
