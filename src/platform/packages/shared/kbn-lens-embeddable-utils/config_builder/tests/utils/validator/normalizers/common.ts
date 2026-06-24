/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { orderBy } from 'lodash';

import type { ColorMapping, CustomPaletteParams, PaletteOutput } from '@kbn/coloring';
import type { Reference } from '@kbn/content-management-utils';
import type {
  DataType,
  FormBasedPersistedState,
  GenericIndexPatternColumn,
  ReferenceBasedIndexPatternColumn,
  TextBasedPersistedState,
} from '@kbn/lens-common';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';

import { getIndexPatternFromESQLQuery, getTimeFieldFromESQLQuery } from '@kbn/esql-utils';

import {
  LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
  LENS_SAMPLING_DEFAULT_VALUE,
} from '../../../../schema/constants';
import type { LensAttributes } from '../../../../types';
import { getValues, type NormalizerConfig } from './normalize';
import { getContinuity, getRangeValue } from '../../../../transforms/coloring';
import { stripUndefined } from '../../../../transforms/charts/utils';
import { generateAdHocDataViewId, getAdHocDataViewSpec } from '../../../../transforms/utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const COMMON_STATE_IGNORE_PATHS = [
  'savedObjectId', // panel-level SO reference, not part of LensAttributes
  'type', // misplaced type, see https://github.com/elastic/kibana/issues/245683
  'state.filters', // remove for now
  'state.visualization.title', // removed by-value nested title
  // TODO: check missing properties striped out in transforms
  'state.datasourceStates.formBased.layers.*.indexPatternId',
  'state.datasourceStates.formBased.currentIndexPatternId',
  // Label and customLabel diffs
  'state.datasourceStates.*.layers.*.columns.*.label', // is kept at state -> API only if it is a custom label
  'state.datasourceStates.*.layers.*.columns.*.customLabel', // dropped at state -> API and only applied from API -> State if label is explicitly set
  // TODO: check DSL differing properties changed in transforms
  'state.datasourceStates.formBased.layers.*.columns.*.params',
  'state.datasourceStates.formBased.layers.*.columns.*.scale', // conditionally set for data columns
  // TODO: check missing ES|QL column properties stripped out in transforms
  'state.datasourceStates.textBased.layers.*.columns.*.inMetricDimension', // dropped at state -> API and only applied from API -> State if explicitly set
  'state.datasourceStates.textBased.layers.*.columns.*.meta', // meta is inferred by the transform -> originals may have it, miss it, or have different values
  'state.datasourceStates.textBased.layers.*.allColumns', // runtime-only property, not persisted or produced by transform
  'state.datasourceStates.textBased.layers.*.timeField', // inferred at runtime from the data view -> original may have undefined while transform sets @timestamp from query.esql
  // TODO: check missing/different properties on adHocDataViews
  'state.adHocDataViews.*.timeFieldName', // not saved in API re-derived at runtime
  'state.adHocDataViews.*.fieldAttrs',
  'state.adHocDataViews.*.managed',
  'state.adHocDataViews.*.allowNoIndex', // hardcoded to false by transform; if original was true, missing indices would error instead of returning empty
  'state.adHocDataViews.*.allowHidden', // hardcoded to false by transform; if original was true, hidden indices would no longer be queried
  'state.adHocDataViews.*.fieldFormats', // custom field formats (e.g. url formatters) will be lost
  'state.adHocDataViews.*.runtimeFieldMap', // runtime field definitions will be lost
  // TODO: check missing/different properties on colorMapping
  'state.visualization.columns.*.colorMapping.assignments.*.touched', // dropped at state -> API and only applied from API -> State, hardcoded to false by transform
  'state.visualization.columns.*.colorMapping.specialAssignments.*.touched',
  'state.visualization.layers.*.colorMapping.assignments.*.touched',
  'state.visualization.layers.*.colorMapping.specialAssignments.*.touched',
  'state.visualization.layers.*.colorMapping.colorMode.steps.*.touched',
  'state.visualization.colorMapping.colorMode.steps.*.touched',
];

export const DEFAULT_LAYER_ID = 'layer_0';

export type IdRemapping = Array<[old: string | undefined, new: string]>;

/**
 * Resolve the form-based datasource state, falling back to the legacy
 * `indexpattern` key.
 */
export const getFormBasedDatasourceState = (
  datasourceStates: LensAttributes['state']['datasourceStates']
): FormBasedPersistedState | undefined =>
  datasourceStates.formBased ?? ((datasourceStates as any).indexpattern as FormBasedPersistedState);

export const isReferenceBasedColumn = (
  c: GenericIndexPatternColumn
): c is ReferenceBasedIndexPatternColumn => 'references' in c && Array.isArray(c.references);
/**
 * ES|QL ad-hoc data views: remap existing ones to deterministic IDs or create
 * new ones from the ES|QL query. Returns rebuilt internalReferences with standard naming.
 */
function normalizeESQLAdHocDataViews(
  attributes: LensAttributes,
  internalReferences: Reference[]
): Reference[] {
  if (
    attributes.state.datasourceStates.textBased &&
    'indexPatternRefs' in attributes.state.datasourceStates.textBased
  ) {
    delete attributes.state.datasourceStates.textBased.indexPatternRefs;
  }

  const textBasedLayerEntries = Object.entries(
    attributes.state.datasourceStates.textBased?.layers ?? {}
  );
  if (textBasedLayerEntries.length === 0) return internalReferences;

  // Remove 'textBasedLanguages-datasource-layer-*' references — they are rebuilt below
  const refs = internalReferences.filter(
    (r) => !r.name.startsWith('textBasedLanguages-datasource-layer-')
  );

  if (!attributes.state.adHocDataViews) {
    attributes.state.adHocDataViews = {};
  }

  for (const [layerId, layer] of textBasedLayerEntries) {
    const esqlQuery = layer.query?.esql;
    const oldIndex = layer.index;

    if (oldIndex && attributes.state.adHocDataViews[oldIndex]) {
      // Existing adHocDataView: remap to a deterministic ID
      const adHocDataView: DataViewSpec = attributes.state.adHocDataViews[oldIndex];
      // Use the same logic as the transform: derive timeField from the ES|QL query
      const timeFieldName = esqlQuery
        ? getTimeFieldFromESQLQuery(esqlQuery)
        : adHocDataView.timeFieldName ?? layer.timeField ?? undefined;
      // The transform re-derives the index pattern (and the data view title/name) from the ES|QL
      // query, so a stale persisted name (e.g. a broader multi-index pattern) is normalized away.
      const indexPattern = esqlQuery
        ? getIndexPatternFromESQLQuery(esqlQuery)
        : adHocDataView.name ?? '';
      const newId = generateAdHocDataViewId({
        index: indexPattern,
        dataSourceType: 'esql',
        esqlQuery,
        timeFieldName,
      });

      layer.index = newId;
      adHocDataView.id = newId;
      adHocDataView.name = indexPattern;
      adHocDataView.title = indexPattern;
      // Transform always sets type: 'esql' on ESQL adHocDataViews (via getAdHocDataViewSpec)
      adHocDataView.type = 'esql';
      attributes.state.adHocDataViews[newId] = adHocDataView;
      if (newId !== oldIndex) {
        delete attributes.state.adHocDataViews[oldIndex];
      }
    } else if (esqlQuery) {
      // No adHocDataView exists: create one from the ES|QL query (matches what the transform produces)
      const indexPattern = getIndexPatternFromESQLQuery(esqlQuery);
      const spec = getAdHocDataViewSpec({
        type: 'adHocDataView',
        index: indexPattern,
        dataSourceType: 'esql',
        esqlQuery,
        timeFieldName: getTimeFieldFromESQLQuery(esqlQuery),
      });

      layer.index = spec.id;
      attributes.state.adHocDataViews[spec.id] = spec;
    }

    if (layer.index) {
      // Mutate the existing layer ref in place to keep references; fall back to pushing if no existing ref is found.
      const layerRefName = `indexpattern-datasource-layer-${layerId}`;
      const existingRef = refs.find((r) => r.name === layerRefName);
      if (existingRef) {
        existingRef.id = layer.index;
        existingRef.name = `indexpattern-datasource-layer-${DEFAULT_LAYER_ID}`;
      } else {
        refs.push({
          id: layer.index,
          name: `indexpattern-datasource-layer-${DEFAULT_LAYER_ID}`,
          type: 'index-pattern',
        });
      }
    }
  }

  return refs;
}

/**
 * Form-based ad-hoc data views: remap UUID-keyed entries to deterministic IDs
 * and update internal references to match.
 */
function normalizeFormBasedAdHocDataViews(
  attributes: LensAttributes,
  internalReferences: Reference[]
): Reference[] {
  const formBasedLayers = attributes.state.datasourceStates.formBased?.layers ?? {};
  const adHocDataViews = attributes.state.adHocDataViews ?? {};
  const refs = [...internalReferences];

  for (const [layerId, layer] of Object.entries(formBasedLayers)) {
    const layerRefName = `indexpattern-datasource-layer-${layerId}`;
    const ref = refs.find((r) => r.name === layerRefName);
    const adHocId = ref?.id ?? (layer as any).indexPatternId;

    if (adHocId && adHocDataViews[adHocId]) {
      const adHocDataView: DataViewSpec = adHocDataViews[adHocId];
      const newId = generateAdHocDataViewId({
        index: adHocDataView.title ?? '',
        timeFieldName: adHocDataView.timeFieldName,
      });

      delete adHocDataViews[adHocId];
      adHocDataView.id = newId;
      adHocDataView.name = adHocDataView.title ?? adHocDataView.name;
      adHocDataViews[newId] = adHocDataView;

      if (ref) {
        ref.id = newId;
        ref.name = `indexpattern-datasource-layer-${DEFAULT_LAYER_ID}`;
      } else {
        refs.push({
          id: newId,
          name: `indexpattern-datasource-layer-${DEFAULT_LAYER_ID}`,
          type: 'index-pattern',
        });
      }
    }
  }

  return refs;
}

/**
 * Remove ad-hoc data views not referenced by any layer or internal reference.
 */
function removeOrphanedAdHocDataViews(attributes: LensAttributes, internalReferences: Reference[]) {
  const referencedAdHocIds = new Set<string>();

  for (const layer of Object.values(attributes.state.datasourceStates.textBased?.layers ?? {})) {
    if (layer.index) {
      referencedAdHocIds.add(layer.index);
    }
  }

  for (const ref of internalReferences) {
    referencedAdHocIds.add(ref.id);
  }

  for (const id of Object.keys(attributes.state.adHocDataViews ?? {})) {
    if (!referencedAdHocIds.has(id)) {
      delete attributes.state.adHocDataViews![id];
    }
  }
}

/**
 * Switching between chart types in ES|QL mode leaves behind empty-column layers
 * from previously selected charts (Check https://github.com/elastic/kibana/issues/243084).
 * Only the active layer (in layerRemapping) survives the round-trip.
 */
function pruneEmptyColumnTextBasedLayers(attributes: LensAttributes) {
  const textBasedLayers = attributes.state.datasourceStates.textBased?.layers;
  if (!textBasedLayers) return;

  for (const [layerId, layer] of Object.entries(textBasedLayers)) {
    if (layer.columns.length === 0) {
      delete textBasedLayers[layerId];
    }
  }
}

function normalizeAdHocDataViews(attributes: LensAttributes) {
  // Clear empty typeMeta objects
  for (const dv of Object.values(attributes.state.adHocDataViews ?? {})) {
    if (dv.typeMeta && Object.keys(dv.typeMeta).length === 0) {
      delete dv.typeMeta;
    }
  }

  let internalReferences = attributes.state.internalReferences ?? [];
  removeOrphanedAdHocDataViews(attributes, internalReferences);
  internalReferences = normalizeESQLAdHocDataViews(attributes, internalReferences);
  internalReferences = normalizeFormBasedAdHocDataViews(attributes, internalReferences);

  if (Object.keys(attributes.state.adHocDataViews ?? {}).length === 0) {
    delete attributes.state.adHocDataViews;
  }

  attributes.state.internalReferences = internalReferences;
  if (attributes.state.internalReferences.length === 0) {
    delete attributes.state.internalReferences;
  }
}

/**
 * For ES|QL panels, the layer query is the source of truth at runtime.
 * The top-level state.query may diverge in legacy SOs — sync it to the layer.
 */
function normalizeESQLQuery(attributes: LensAttributes) {
  const textBasedLayers = Object.values(attributes.state.datasourceStates.textBased?.layers ?? {});
  if (textBasedLayers.length > 0) {
    const layerQuery = textBasedLayers[0].query;
    // For ES|QL panels the layer query is authoritative; the transform always promotes it to the
    // top-level state query, replacing any stale legacy query (even a different language).
    if (layerQuery?.esql && attributes.state.query) {
      attributes.state.query = layerQuery;
    }
  }
}

/**
 * An empty query (query: "") is dropped during SO→API conversion, and the API→SO
 * step defaults to { language: 'kuery', query: '' }. Both are semantically identical.
 */
function normalizeEmptyQuery(attributes: LensAttributes) {
  const q = attributes.state.query;
  if (q && 'language' in q && typeof q.query === 'string' && q.query === '') {
    q.language = 'kuery';
  }
}

/**
 * description: null is equivalent to absent
 */
function normalizeDescription(attributes: LensAttributes) {
  if (attributes.description === null) {
    delete attributes.description;
  }
}

/**
 * dataType cannot always be preserved through transforms — it usually falls back to the
 * actual field type at runtime. These are the known remappings the transform applies.
 *
 * Some charts (e.g. datatable) can derive a more accurate dataType from extra context
 * (color config, etc.) and provide it via `inferred`. When supplied, it overrides the
 * generic fallback rules below; otherwise the default coercions are applied.
 */
function normalizeDataTypes(col: GenericIndexPatternColumn, inferred?: DataType) {
  if (inferred !== undefined) {
    col.dataType = inferred;
    return;
  }
  const { dataType, isBucketed, operationType } = col;
  if (operationType === 'terms' && dataType === 'number') {
    col.dataType = 'string';
  } else if (
    !isBucketed &&
    (dataType === 'date' || dataType === 'string' || dataType === 'ip' || dataType === 'boolean')
  ) {
    col.dataType = 'number';
  } else if (isBucketed && (dataType === 'ip' || dataType === 'boolean')) {
    col.dataType = 'string';
  }
}

const normalizeReferences = <T extends LensAttributes>(
  { references, state }: T,
  replacements: IdRemapping
): Reference[] => {
  const filterIndexIds = new Set(
    state.filters.map((filter) => filter.meta?.index).filter((s): s is string => !!s)
  );

  return orderBy(
    references
      .filter((reference) => {
        // ignore filter index pattern references (legacy: filter-index-pattern-*, current: via filter.meta.index)
        return !(
          reference.type === 'index-pattern' &&
          (filterIndexIds.has(reference.name) || reference.name.startsWith('filter-index-pattern-'))
        );
      })
      // ignore current index pattern reference
      .filter((reference) => {
        return !(
          reference.type === 'index-pattern' &&
          reference.name === 'indexpattern-datasource-current-indexpattern'
        );
      })
      // textBasedLanguages-* references are replaced by indexpattern-datasource-layer-* in internalReferences
      .filter((reference) => {
        return !(
          reference.type === 'index-pattern' &&
          reference.name.startsWith('textBasedLanguages-datasource-layer-')
        );
      })
      // legacy bare-UUID-named references (pre-standardized naming), probably from dashboard reference extraction
      .filter((reference) => {
        return !(reference.type === 'index-pattern' && UUID_PATTERN.test(reference.name));
      })
      .map((reference) => {
        let name = reference.name;

        // replace all layer ids in reference name
        replacements.forEach(([oldId, newId]) => {
          if (oldId && name.includes(oldId)) {
            name = name.replace(oldId, newId);
          }
        });

        return {
          ...reference,
          name,
        };
      }),
    ['name', 'id', 'type'] // order is superfluous but ensures consistent comparison
  );
};

/**
 * Remap column references (e.g. counter_rate → max) using the column ID map.
 * Formula columns have their internal references cleared — they are not preserved through transforms.
 */
function normalizeColumnReferences(
  col: GenericIndexPatternColumn,
  columnIdMap: Map<string | undefined, string>
) {
  if (isReferenceBasedColumn(col)) {
    col.references = col.references.map((refId: string) => columnIdMap.get(refId) ?? refId);
  }

  if (col.operationType === 'formula') {
    (col as any).references = [];
  }
}

export interface CommonNormalizerArgs {
  layerRemapping: IdRemapping;
  columnRemapping: IdRemapping;
  /**
   * Optional per-chart dataType inference. When provided and returns a value,
   * it overrides the generic blanket coercions in `normalizeDataTypes`.
   */
  inferColumnDataType?: (newColumnId: string) => DataType | undefined;
}

export const getCommonNormalizer = <T extends LensAttributes>(
  getArgs: (attributes: T) => CommonNormalizerArgs
): NormalizerConfig<T> => ({
  order: -1,
  ignore: COMMON_STATE_IGNORE_PATHS,
  original: (attributes: T) => {
    const { layerRemapping, columnRemapping, inferColumnDataType } = getArgs(attributes);

    pruneEmptyColumnTextBasedLayers(attributes);
    normalizeAdHocDataViews(attributes);
    normalizeESQLQuery(attributes);
    normalizeEmptyQuery(attributes);
    normalizeDescription(attributes);

    // replace layer in reference name
    attributes.references = normalizeReferences(attributes, layerRemapping);

    const layerIdMap = new Map(layerRemapping);
    const columnIdMap = new Map(columnRemapping);

    function normalizeDatasourceState<S extends FormBasedPersistedState | TextBasedPersistedState>(
      dsState: S | undefined,
      fn: (ds: S) => S
    ): S | undefined {
      // remove empty datasource states
      if (!dsState || Object.keys(dsState.layers).length === 0) return;

      // prune erroneous columns and swap ids
      for (const [id, layer] of Object.entries(dsState.layers)) {
        // apply defaults
        layer.ignoreGlobalFilters =
          layer.ignoreGlobalFilters ?? LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE;

        if (layerIdMap.has(id)) {
          const newId = layerIdMap.get(id)!;
          // Avoid deleting the layer when the canonical id matches the current id
          if (newId !== id) {
            dsState.layers[newId] = layer;
            delete dsState.layers[id];
          }
        }
      }

      return fn(dsState);
    }

    attributes.state.datasourceStates = stripUndefined({
      textBased: normalizeDatasourceState(attributes.state.datasourceStates.textBased, (ds) => {
        for (const layer of Object.values(ds.layers)) {
          layer.columns = layer.columns.map((column) => {
            return {
              ...column,
              columnId: columnIdMap.get(column.columnId) ?? column.columnId,
            };
          });

          // Datatable's ESQL output order is driven by `layer.columns` array order
          // and uses its own canonical (rows → splits → metrics) sort in
          // the datatable normalizer. For every other chart, alphabetical
          // canonicalization is fine because column order does not drive
          // rendering.
          if (attributes.visualizationType !== 'lnsDatatable') {
            layer.columns.sort((a, b) => a.columnId.localeCompare(b.columnId));
          }

          if (layer.timeField) {
            layer.timeField = undefined; // not saved in API re-derived at runtime
          }
        }

        return ds;
      }),
      formBased: normalizeDatasourceState(
        getFormBasedDatasourceState(attributes.state.datasourceStates),
        (ds) => {
          for (const layer of Object.values(ds.layers)) {
            layer.columns = columnRemapping.reduce((columns, [oldColumn, newColumn]) => {
              if (oldColumn && layer.columns[oldColumn]) {
                columns[newColumn] = layer.columns[oldColumn];
              }

              return columns;
            }, {} as typeof layer.columns);

            layer.columnOrder = layer.columnOrder
              .filter((colId: string) => columnIdMap.has(colId))
              .map(
                (colId: string) =>
                  columnRemapping.find(([oldColumn]) => oldColumn === colId)?.[1] ?? colId
              );

            // Datatable uses its own canonical (rows → splits → metrics) sort in
            // the datatable normalizer. For every other chart, alphabetical
            // canonicalization is fine because column order does not drive
            // rendering.
            if (attributes.visualizationType !== 'lnsDatatable') {
              layer.columnOrder.sort();
            }

            // apply defaults
            layer.sampling = layer.sampling ?? LENS_SAMPLING_DEFAULT_VALUE;

            // remove empty incompleteColumns
            if (Object.keys(layer.incompleteColumns ?? {}).length === 0) {
              delete layer.incompleteColumns;
            }

            if (layer.linkToLayers) {
              layer.linkToLayers = layer.linkToLayers?.map((l) => layerIdMap.get(l) ?? l);
            }

            for (const [columnId, col] of Object.entries(layer.columns)) {
              // scale is not preserved through transforms
              delete col.scale;

              // Empty-string timeShift is semantically "no shift" and is dropped by the transform
              if (col.timeShift === '') {
                delete col.timeShift;
              }

              // remap inner column references (e.g. orderBy.columnId in terms columns)
              const orderByCol = (col as any).params?.orderBy?.columnId;
              if (orderByCol && columnIdMap.has(orderByCol)) {
                (col as any).params.orderBy.columnId = columnIdMap.get(orderByCol);
              }

              normalizeColumnReferences(col, columnIdMap);
              normalizeDataTypes(col, inferColumnDataType?.(columnId));
            }
          }
          return ds;
        }
      ),
    });

    attributes.state.needsRefresh = attributes.state.needsRefresh ?? false;
    attributes.version = LENS_ITEM_LATEST_VERSION; // transforms should return latest version

    return attributes;
  },
  transformed: (attributes: T) => {
    if (Object.keys(attributes.state.adHocDataViews ?? {}).length === 0) {
      delete attributes.state.adHocDataViews;
    }

    if (attributes.state.internalReferences?.length === 0) {
      delete attributes.state.internalReferences;
    }

    // remove as-code filter references
    attributes.references = attributes.references.filter((reference) => {
      return !(reference.type === 'index-pattern' && reference.name.startsWith('filter-ref-'));
    });

    attributes.state.needsRefresh = attributes.state.needsRefresh ?? false;

    if (attributes.visualizationType !== 'lnsDatatable') {
      Object.values(attributes.state.datasourceStates.formBased?.layers ?? {}).forEach((layer) => {
        layer.columnOrder.sort();
      });
      Object.values(attributes.state.datasourceStates.textBased?.layers ?? {}).forEach((layer) => {
        layer.columns.sort((a, b) => a.columnId.localeCompare(b.columnId));
      });
    }

    return attributes;
  },
});

/**
 * Normalized the palette params provided a string path to the palette(s) in the attributes
 *
 * This need to address:
 * - account for bad last color stop including shifting palettes :(
 * - defaulting missing rangeType
 * - defaulting missing continuity
 */
export function getPaletteNormalizer<T extends LensAttributes>(
  palettePath: string
): NormalizerConfig<T> {
  return {
    original: (attributes: T) => {
      const palettes = getValues<PaletteOutput<CustomPaletteParams>>(
        attributes,
        palettePath
      ).filter(Boolean);

      palettes.forEach((palette) => {
        const rangeMin = getRangeValue(palette.params?.rangeMin);
        const rangeMax = getRangeValue(palette.params?.rangeMax);

        if (palette.params) {
          // The SO→API transform always uses rangeMax as the last step's upper bound (lte),
          // replacing the original stop value. The API→SO step then reconstructs the stop from lte,
          // so the last stop always becomes rangeMax after the round-trip.
          if (palette.params.stops) {
            const isLegacy = palette.name !== 'custom';
            const needsPaletteShift =
              isLegacy &&
              ((rangeMin !== null && rangeMin === palette.params.stops.at(0)?.stop) ||
                (rangeMax !== null && rangeMax !== palette.params.stops.at(-1)?.stop));
            const lastStop = palette.params.stops.at(-1);
            if (lastStop && !needsPaletteShift) lastStop.stop = rangeMax as unknown as number; // can be null
          }

          if (!palette.params?.rangeType) {
            palette.params.rangeType = 'percent';
          }

          if (!palette.params?.continuity) {
            palette.params.continuity = getContinuity(rangeMin, rangeMax);
          }

          if (palette.name !== 'custom') {
            delete palette.params.colorStops;
          }

          // Legacy SOs may omit params.name, but the transform always sets it from the root name
          if (palette.params.name === undefined && palette.name) {
            palette.params.name = palette.name;
          }

          // Legacy SOs may omit rangeMin/rangeMax, but the transform always derives them (can be null)
          if (!('rangeMin' in palette.params)) {
            palette.params.rangeMin = null as unknown as number;
          }
          if (!('rangeMax' in palette.params)) {
            palette.params.rangeMax = null as unknown as number;
          }
        }
      });

      return attributes;
    },
    transformed: (attributes: T) => {
      const palettes = getValues<PaletteOutput<CustomPaletteParams>>(
        attributes,
        palettePath
      ).filter(Boolean);

      palettes.forEach((palette) => {
        if (palette.name !== 'custom') {
          delete palette.params?.colorStops;
        }
      });

      return attributes;
    },
    ignore: [
      'maxSteps', // often omitted in original
      'progression', // deprecated but defaults to 'fixed'
      'reverse', // typically unused or omitted
      'steps', // count of steps in original is not right
    ].map((param) => `${palettePath}.params.${param}`),
  };
}

/**
 * Returns a normalizer that pre-applies the lossy state -> API collapse that
 * `fromRulesLensStateToAPI` performs on color-mapping rules.
 *
 * - `match` with `matchEntireWord: true` becomes a `raw` rule.
 * - `match` with `matchEntireWord: false`, `regex`, and `range` rules are
 *   runtime-dead (`getKey` returns `null`) and are stripped.
 */
export function getColorMappingNormalizer<T extends LensAttributes>(
  colorMappingPath: string
): NormalizerConfig<T> {
  return {
    original: (attributes: T) => {
      const configs = getValues<ColorMapping.Config>(attributes, colorMappingPath).filter(Boolean);

      configs.forEach((config) => {
        for (const assignment of config.assignments) {
          assignment.rules = assignment.rules.flatMap((rule): ColorMapping.ColorRule[] => {
            if (rule.type === 'raw') return [rule];
            if (rule.type === 'match' && rule.matchEntireWord === true) {
              const value = rule.matchCase ? rule.pattern : rule.pattern.toLowerCase();
              return [{ type: 'raw', value }];
            }
            return [];
          });
        }
      });

      return attributes;
    },
  };
}
