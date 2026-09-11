/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isNil, omitBy, orderBy } from 'lodash';

import { LEGACY_COMPLIMENTARY_PALETTE, COMPLEMENTARY_PALETTE } from '@kbn/coloring';
import type { ColorMapping, CustomPaletteParams, PaletteOutput } from '@kbn/coloring';
import type { Reference } from '@kbn/content-management-utils';
import type {
  CountIndexPatternColumn,
  CardinalityIndexPatternColumn,
  DataType,
  DateHistogramIndexPatternColumn,
  FormBasedPersistedState,
  GenericIndexPatternColumn,
  LastValueIndexPatternColumn,
  ReferenceBasedIndexPatternColumn,
  SumIndexPatternColumn,
  TermsIndexPatternColumn,
  TextBasedLayerColumn,
  TextBasedPersistedState,
  ValueFormatConfig,
  RangeIndexPatternColumn,
} from '@kbn/lens-common';
import { hasTextBasedLayers } from '@kbn/lens-common';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';

import { getIndexPatternFromESQLQuery, parseTimeFieldFromESQLQuery } from '@kbn/esql-utils';
import { migrateFilter } from '@kbn/es-query';
import type { Filter, FilterMeta } from '@kbn/es-query';

import {
  LENS_FORMAT_DURATION_COMPACT_DEFAULT,
  LENS_FORMAT_DURATION_DECIMALS_DEFAULT,
  LENS_FORMAT_NUMBER_DECIMALS_DEFAULT,
  LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE,
  LENS_SAMPLING_DEFAULT_VALUE,
} from '../../../../schema/constants';
import type { LensAttributes } from '../../../../types';
import { getValues, type NormalizerConfig } from './normalize';
import { getContinuity, getRangeValue } from '../../../../transforms/coloring';
import { stripUndefined } from '../../../../transforms/charts/utils';
import { generateAdHocDataViewId, getAdHocDataViewSpec } from '../../../../transforms/utils';
import { toApiFieldSettings } from '../../../../transforms/columns/field_settings';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const COMMON_STATE_IGNORE_PATHS = [
  'savedObjectId', // panel-level SO reference, not part of LensAttributes
  'state.visualization.title', // removed by-value nested title
  // TODO: check missing properties striped out in transforms
  'state.datasourceStates.formBased.layers.*.indexPatternId',
  'state.datasourceStates.formBased.currentIndexPatternId',
  // Will be unskipped after the fix for https://github.com/elastic/kibana/issues/283574
  'state.datasourceStates.formBased.layers.*.columns.*.params.orderAgg.params.sortField',
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
        ? parseTimeFieldFromESQLQuery(esqlQuery)
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
      adHocDataView.title = indexPattern;
      // An ES|QL ad-hoc data view has no dedicated `name` in the `{ type: 'esql', query }` data
      // source; the transform re-derives both title and name from the query's index pattern
      // (getAdHocDataViewSpec: `name = dataView.name ?? dataView.index`). This mirrors the DataView
      // runtime, where `getName() = name || title` and a freshly created ES|QL data view
      // (getESQLAdHocDataview) sets only `title = queryIndexPattern`, so the effective name is the
      // query index pattern.
      adHocDataView.name = adHocDataView.title;
      // The transform re-derives the time field from the ES|QL query rather than trusting the
      // persisted value (getAdHocDataViewSpec <- getDataSourceIndex.esql), so align the stored
      // timeFieldName here instead of skipping it entirely.
      adHocDataView.timeFieldName = timeFieldName;
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
        timeFieldName: parseTimeFieldFromESQLQuery(esqlQuery),
      });

      layer.index = spec.id;
      attributes.state.adHocDataViews[spec.id] = spec;
    }

    if (layer.index) {
      // Mutate the existing layer ref in place to keep references; fall back to pushing if no existing ref is found.
      // Keep the original layerId in the name so getCommonNormalizer can apply layerRemapping to it.
      const layerRefName = `indexpattern-datasource-layer-${layerId}`;
      const existingRef = refs.find((r) => r.name === layerRefName);
      if (existingRef) {
        existingRef.id = layer.index;
        // intentionally keep existingRef.name unchanged (still layerId)
      } else {
        refs.push({
          id: layer.index,
          name: layerRefName,
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

  // Compute the deterministic id for every form-based ad-hoc data view once. The
  // transform dedupes views by id, so several layers can reference the same view;
  // remapping per data view (instead of per layer) keeps every referencing layer
  // pointing at the same new id. Doing it per layer would delete the entry on the
  // first layer and leave the rest pointing at the stale id.
  const idRemap = new Map<string, string>();
  for (const [oldId, adHocDataView] of Object.entries(adHocDataViews)) {
    // ES|QL ad-hoc data views are handled by normalizeESQLAdHocDataViews; skip them here.
    if (adHocDataView.type === 'esql') {
      continue;
    }
    const newId = generateAdHocDataViewId({
      index: adHocDataView.title ?? '',
      timeFieldName: adHocDataView.timeFieldName,
      name: adHocDataView.name,
      allowHidden: adHocDataView.allowHidden,
      fieldSettings: toApiFieldSettings(adHocDataView),
    });
    idRemap.set(oldId, newId);

    if (oldId !== newId) {
      delete adHocDataViews[oldId];
      adHocDataView.id = newId;
      adHocDataViews[newId] = adHocDataView;
    }
    // mirror the transform's `name = name ?? index` (title === index for form-based)
    adHocDataView.name = adHocDataView.name ?? adHocDataView.title;
  }

  for (const [layerId, layer] of Object.entries(formBasedLayers)) {
    const layerRefName = `indexpattern-datasource-layer-${layerId}`;
    const ref = refs.find((r) => r.name === layerRefName);
    const adHocId = ref?.id ?? (layer as any).indexPatternId;
    const newId = adHocId ? idRemap.get(adHocId) : undefined;

    if (!newId) {
      continue;
    }

    if (ref) {
      ref.id = newId;
      // Keep the original layerId in the name so getCommonNormalizer can apply layerRemapping to it.
    } else {
      refs.push({
        id: newId,
        name: layerRefName,
        type: 'index-pattern',
      });
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

/**
 * Normalize ad-hoc data view spec noise the SO -> API -> SO round-trip introduces.
 *
 * DROP verdicts — not carried by the embedded API, loss is accepted:
 * - `managed`: leaked saved-object metadata, never authored on a Lens ad-hoc data view and stripped from
 *   the public data-views API anyway.
 * - `allowNoIndex`: a field-fetch option (ES|`allow_no_indices`), not something authored on an
 *   ad-hoc data-view. The embedded API has no field for it and the transform always emits `false`, so a
 *   stored `true` (e.g. Fleet dashboards shipped before their indices exist) can't survive the
 *   round-trip. Coerce the original to `false` to match the transform.
 * - `allowHidden` on ES|QL DataViews: an ES|QL ad-hoc DataView serializes as an `{ type: 'esql', query }`
 *   datasource that carries no `allow_hidden_indices`, so the flag is dropped on that path. Strip
 *   it here. Form-based DataViews round-trip `allowHidden` faithfully and are compared directly.
 */
function normalizeAdHocDataViewSpec(dv: DataViewSpec) {
  delete dv.managed;
  dv.allowNoIndex = false;

  if (dv.type === 'esql' && dv.allowHidden === false) {
    delete dv.allowHidden;
  }

  if (Object.keys(dv.fieldAttrs ?? {}).length === 0) {
    delete dv.fieldAttrs;
  }

  const normalizedFieldFormats = dv.fieldFormats ?? {};
  for (const [key, value] of Object.entries(normalizedFieldFormats)) {
    if (value.id === 'url') {
      // Clean null params + parsedUrl key
      normalizedFieldFormats[key].params = omitBy(value.params, isNil);
      normalizedFieldFormats[key].params.parsedUrl = undefined;
    }

    if (Object.keys(value.params ?? {}).length === 0) {
      delete normalizedFieldFormats[key].params;
    }
  }

  dv.fieldFormats = normalizedFieldFormats;
  if (Object.keys(dv.fieldFormats ?? {}).length === 0) {
    delete dv.fieldFormats;
  }
  if (Object.keys(dv.runtimeFieldMap ?? {}).length === 0) {
    delete dv.runtimeFieldMap;
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

  // Normalize spec noise last so it covers every ad-hoc data view (both the ES|QL and form-based paths
  // rebuild/remap specs above).
  for (const dv of Object.values(attributes.state.adHocDataViews ?? {})) {
    normalizeAdHocDataViewSpec(dv);
  }

  if (Object.keys(attributes.state.adHocDataViews ?? {}).length === 0) {
    delete attributes.state.adHocDataViews;
  }

  attributes.state.internalReferences = internalReferences;
  if (attributes.state.internalReferences.length === 0) {
    delete attributes.state.internalReferences;
  }
}

/**
 * For ES|QL panels, the layer query is the source of truth. Legacy SOs may
 * still carry an aggregate copy in the top-level state.query slot (dead data,
 * dropped at read time) and the API→SO transform emits an empty kuery default
 * — normalize both to an absent slot for comparison.
 */
function normalizeESQLQuery(attributes: LensAttributes) {
  const isTextBased = hasTextBasedLayers(attributes);
  const query: unknown = attributes.state.query;
  if (!query || typeof query !== 'object') {
    return;
  }
  const isAggregate = 'esql' in query;
  const isEmpty = 'query' in query && query.query === '';
  if (isAggregate || (isTextBased && isEmpty)) {
    delete attributes.state.query;
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

/**
 * `meta` cannot round-trip the actual data type — API→SO reconstructs `{ type }` from chart role.
 * `esType` / `field` / `sourceParams` are never produced. Align original `meta` to that guess:
 * keep `'number'` and `'date'`, coerce everything else (including absent) to `'string'`.
 * Same `inferColumnDataType` override as form-based `normalizeDataTypes`.
 */
function normalizeESQLMeta(column: TextBasedLayerColumn, inferred?: DataType) {
  if (inferred === 'number' || inferred === 'string' || inferred === 'date') {
    column.meta = { type: inferred };
    return;
  }

  const rawType = column.meta?.type;
  column.meta = {
    type: rawType === 'number' || rawType === 'date' ? rawType : 'string',
  };
}

const normalizeReferences = <T extends LensAttributes>(
  { references }: T,
  replacements: IdRemapping,
  filterRefNames: ReadonlySet<string> = new Set()
): Reference[] => {
  return orderBy(
    references
      .filter((reference) => {
        // Drop filter data-view references — they're inlined into `filter.meta.index` (re-extracted as
        // `filter-ref-<id>` on the transformed side). `filterRefNames` are the `meta.index` names
        // captured before `normalizeFilters` rewrote them (standard `filter-index-pattern-*` or custom
        // author names); the standard prefix is also matched directly for already-dropped filters.
        return !(
          reference.type === 'index-pattern' &&
          (filterRefNames.has(reference.name) || reference.name.startsWith('filter-index-pattern-'))
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

const isTermsColumn = (col: GenericIndexPatternColumn): col is TermsIndexPatternColumn =>
  col.operationType === 'terms';

/**
 * Canonicalize a `terms` column's `params` empty defaults on the ORIGINAL side to match the SO -> API
 * -> SO transform output.
 */
const normalizeTermsColumnParams = (
  col: TermsIndexPatternColumn,
  innerRefColumnIds: ReadonlySet<string> = new Set()
): void => {
  const { params } = col;

  // `orderAgg`: only meaningful for a custom `orderBy` (`terms/index.tsx` writes
  // `orderBy.type === 'custom' ? orderAgg : undefined`, and the transform only reconstructs it for
  // custom ordering). A leftover `null`/absent value under a non-custom `orderBy` is dead residue.
  if (params.orderAgg == null) {
    delete params.orderAgg;
  }

  // `secondaryFields`: dropped when empty exactly like an absent value; a non-empty list is preserved verbatim.
  if (!params.secondaryFields?.length) {
    delete params.secondaryFields;
  }

  // `include`/`exclude`: dropped when empty. When present, the paired regex flag round-trips as
  //  `as_regex ?? false`. Values themselves are left untouched.
  if (params.include?.length) {
    params.includeIsRegex = Boolean(params.includeIsRegex);
  } else {
    delete params.include;
    delete params.includeIsRegex;
  }
  if (params.exclude?.length) {
    params.excludeIsRegex = Boolean(params.excludeIsRegex);
  } else {
    delete params.exclude;
    delete params.excludeIsRegex;
  }

  // `otherBucket`/`missingBucket`: when `otherBucket` is falsy both are dead at render and dropped by
  //  the transform, so remove both regardless of `missingBucket`. When `otherBucket` is truthy,
  // `missingBucket` round-trips as `Boolean(...)`, so default a missing value to `false`
  if (params.otherBucket) {
    params.missingBucket = Boolean(params.missingBucket);
  } else {
    delete params.otherBucket;
    delete params.missingBucket;
  }

  // `orderBy.fallback`: editor-only hint (re-attach metric sorting when a metric appears). Render
  // resolves alphabetical to `orderBy='_key'` regardless (`terms/index.tsx` toEsAggsFn).
  if (params.orderBy && 'fallback' in params.orderBy) {
    const { fallback: _fallback, ...orderByWithoutFallback } = params.orderBy;
    params.orderBy = orderByWithoutFallback;
  }

  // Order By a Backing Column (e.g. `max` behind `differences`) is out of API contract: `rank_by`
  // indexes Visible Metrics only, so SO→API→SO falls back to alphabetical+fallback. Rewrite after
  // the fallback strip so the rewritten `fallback: true` is kept and matches the transform.
  if (
    params.orderBy?.type === 'column' &&
    params.orderBy.columnId != null &&
    innerRefColumnIds.has(params.orderBy.columnId)
  ) {
    params.orderBy = { type: 'alphabetical', fallback: true };
  }

  // `parentFormat`: the transform derives it from `secondaryFields` (`fromTermsLensApiToLensState`),
  // mirroring runtime `getParentFormatter` (`terms/index.tsx`): `multi_terms` for multi-field terms,
  // `terms` otherwise.
  if (params.parentFormat == null) {
    params.parentFormat = { id: params.secondaryFields?.length ? 'multi_terms' : 'terms' };
  }

  // There is a panel with a stale `{id:'terms'}` on a multi-field terms column
  if (params.parentFormat.id === 'terms' && params.secondaryFields?.length) {
    params.parentFormat.id = 'multi_terms';
  }
};

const isDateHistogramColumn = (
  col: GenericIndexPatternColumn
): col is DateHistogramIndexPatternColumn => col.operationType === 'date_histogram';

/**
 * Default missing `ignoreTimeRange`/`dropPartials`/`includeEmptyRows` to `false` on `date_histogram`
 * columns on the ORIGINAL side. The transform emits `Boolean(...)` in both directions
 * (`transforms/columns/date_histogram.ts`), so a missing flag round-trips as an explicit `false`.
 */
const normalizeDateHistogramColumnParams = (col: DateHistogramIndexPatternColumn): void => {
  const { params } = col;
  params.ignoreTimeRange = Boolean(params.ignoreTimeRange);
  params.dropPartials = Boolean(params.dropPartials);
  params.includeEmptyRows = Boolean(params.includeEmptyRows);
};

const isRangeColumn = (col: GenericIndexPatternColumn): col is RangeIndexPatternColumn =>
  col.operationType === 'range';

/**
 * Canonicalize `range` column params.
 * - Histogram mode: empty unused `ranges`, default `includeEmptyRows`,`maxBars` must round-trip verbatim.
 * - Custom-range mode: `maxBars` is dead at render (`toEsAggsFn` only reads `ranges`); the
 *   transform always writes `'auto'`. Leftover numeric values (e.g. `499.5` from a prior
 *   histogram slider position) are rewritten to `'auto'`.
 */
const normalizeRangeColumnParams = (col: RangeIndexPatternColumn): void => {
  const { params } = col;

  if (params.type === 'range') {
    params.maxBars = 'auto';
    return;
  }

  if (params.type !== 'histogram') {
    return;
  }

  // Unused for histogram mode — transform hardcodes `[]`.
  params.ranges = [];

  // Missing ≡ `false` at render (`Boolean(params.includeEmptyRows)`).
  params.includeEmptyRows = Boolean(params.includeEmptyRows);
};

// Metric operations with the "Hide zero values" (`emptyAsNull`) option
// For these, `emptyAsNull` is a used param that the transform round-trips.
type EmptyAsNullSupportedColumn =
  | CountIndexPatternColumn
  | SumIndexPatternColumn
  | CardinalityIndexPatternColumn;

const isEmptyAsNullSupportedColumn = (
  col: GenericIndexPatternColumn
): col is EmptyAsNullSupportedColumn =>
  col.operationType === 'count' ||
  col.operationType === 'sum' ||
  col.operationType === 'unique_count';

/**
 * Canonicalize `emptyAsNull` on the ORIGINAL side.
 *
 * - `count`/`sum`/`unique_count` (`hideZeroOption`): real render param; transform round-trips as
 *   `Boolean(...)`, so a missing value becomes an explicit `false`.
 * - Auto-generated `cumulative_sum` backing `sum`/`count`: the transform regenerates them with
 *   `empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE` (`false`). Editor-created refs often have
 *   `true` (editor default). That drift is accepted: `emptyAsNull` only affects post-tabify
 *   `getValue` (`0 → null`), and `cumulative_sum` treats `0` and `null` the same for the running
 *   total, so the visible series is unchanged.
 * - Every other operation: dead residue — strip open-ended (a closed denylist previously missed
 *   `static_value`).
 */
const normalizeEmptyAsNull = (
  col: GenericIndexPatternColumn,
  { isCounterRateOrCumSumRefCol = false }: { isCounterRateOrCumSumRefCol?: boolean } = {}
): void => {
  if (isEmptyAsNullSupportedColumn(col)) {
    col.params = {
      ...col.params,
      emptyAsNull: isCounterRateOrCumSumRefCol ? false : Boolean(col.params?.emptyAsNull),
    };
    return;
  }

  if (!('params' in col) || !col.params || !('emptyAsNull' in col.params)) {
    return;
  }

  delete col.params.emptyAsNull;
  if (Object.keys(col.params).length === 0) {
    delete col.params;
  }
};

/**
 * Normalize formula/static_value columns.
 *
 * - `isFormulaBroken` is a validity flag recomputed at load/validation: `extractColumns`
 * (`formula/parse.ts`) writes `isFormulaBroken: !isValid` whenever the formula column is regenerated,
 * and `formula.tsx` resets it to `false`, so it is never authored.
 *
 * - `formula` is dead residue on a `static_value` column
 */
const normalizeFormulaAndStaticValueColumns = (col: GenericIndexPatternColumn): void => {
  if (col.operationType !== 'formula' && col.operationType !== 'static_value') {
    return;
  }
  // formula/static_value are reference-based columns, so `params` is typed via `FormattedIndexPatternColumn`.
  if (!isReferenceBasedColumn(col)) {
    return;
  }

  if (col.params && 'isFormulaBroken' in col.params) {
    delete col.params.isFormulaBroken;
  }

  if (col.params && col.operationType === 'static_value' && 'formula' in col.params) {
    delete col.params.formula;
  }
};

/**
 * Drop a stale `params.sortField` on any column that is not a `last_value`.
 *
 * `sortField` is a `last_value`-only param (`last_value.tsx`); other operations (e.g. `max`,
 * `date_histogram`) never read it at render, and their transforms rebuild `params` without it.
 */
const normalizeStaleSortField = (col: GenericIndexPatternColumn): void => {
  if (col.operationType === 'last_value') {
    return;
  }
  if ('params' in col && col.params && 'sortField' in col.params) {
    delete col.params.sortField;
  }
};

/**
 * Drop a dead display `format` on the auto-generated inner reference column of a
 * `counter_rate`/`cumulative_sum`.
 */
const normalizeCounterRateOrCumSumRefFormat = (col: GenericIndexPatternColumn): void => {
  if ('params' in col && col.params && 'format' in col.params) {
    delete col.params.format;
  }
};

/**
 * Drop an empty `params: {}` that carries no value and is never reproduced by the round-trip.
 */
const normalizeEmptyFormatOnlyParams = (col: GenericIndexPatternColumn): void => {
  if ('params' in col && col.params && Object.keys(col.params).length === 0) {
    delete col.params;
  }
};

/**
 * Canonicalize a `terms` column's custom `orderAgg` (the nested rank-function metric).
 *
 * The order-agg is rebuilt from scratch, so only render-affecting state survives the round-trip:
 * - `scale`: derived OperationMetadata, re-computed at load.
 * - `label`/`customLabel`: display residue. The transform always emits a bare `label: ''` and never a
 *   `customLabel`, mirroring `getCustomOrderAgg` (the nested rank editor has no custom-label input).
 * - `filter`: dead — the terms agg builds the order-agg inline and never wraps it in an
 *   `aggFilteredMetric`, so the filter never reaches the aggregation and the transform drops it.
 * - `emptyAsNull`: dead on an order-agg for every op. Its agg param has a no-op writer
 *   (`metric_agg_type.ts`), so it never reaches Elasticsearch (buckets are ordered by the raw metric
 *   value), and an order-agg is never tabified (it only sorts terms), so the `getValue` `0 → null`
 *   post-processing never runs for it either. The transform emits none, so drop the persisted flag.
 */
const normalizeOrderAgg = (orderAgg: GenericIndexPatternColumn): void => {
  delete orderAgg.scale;

  orderAgg.label = '';
  delete orderAgg.customLabel;

  if ('filter' in orderAgg) {
    delete orderAgg.filter;
  }

  const { params } = orderAgg as { params?: { emptyAsNull?: unknown } };
  if (params && 'emptyAsNull' in params) {
    delete params.emptyAsNull;
  }

  normalizeEmptyFormatOnlyParams(orderAgg);
};

const isLastValueColumn = (col: GenericIndexPatternColumn): col is LastValueIndexPatternColumn =>
  col.operationType === 'last_value';

/**
 * Default a missing/`null` `params.showArrayValues` to `true` on `last_value` columns on the ORIGINAL
 * side to match the 8.2.0 saved-object migration `commonSetLastValueShowArrayValues`
 * (`server/migrations/common_migrations.ts`) that coerces any non-boolean `showArrayValues` to `true` at load.
 */
const normalizeLastValueShowArrayValues = (col: GenericIndexPatternColumn): void => {
  if (!isLastValueColumn(col)) {
    return;
  }
  if (col.params.showArrayValues == null) {
    col.params.showArrayValues = true;
  }
};

type FormatParams = NonNullable<ValueFormatConfig['params']>;

/**
 * Canonicalize `duration` value-format params.
 *
 * - `fromUnit`/`toUnit` are required on the API, so the transform always emits units and reconstructs
 *   both on the way back. A saved object that omits them renders with the formatter defaults —
 *   `inputFormat: params.fromUnit || DEFAULT_DURATION_INPUT_FORMAT.kind` (`seconds`) and
 *   `outputFormat: params.toUnit || DEFAULT_DURATION_OUTPUT_FORMAT.method` (`humanize`)
 *   (`format_column/supported_formats.ts`) — which is exactly what the round-trip produces (`s` → `seconds`,
 *   `auto-approximate` → `humanize`).
 * - `decimals`/`compact` depend on the output unit (`transforms/columns/format.ts`):
 *   - `humanize` (approximate, API `auto-approximate`): the formatter ignores both, so the transform forces
 *     `decimals: 0` to satisfy TS and omits `compact` entirely.
 *   - every other unit (`humanizePrecise`/`asSeconds`/… → precise): both round-trip with editor-aligned
 *     defaults, so default a missing `decimals` to `0` and a missing `compact` to `true`.
 */
const normalizeDurationFormatParams = (params: FormatParams): void => {
  if (params.fromUnit == null) {
    params.fromUnit = 'seconds';
  }
  if (params.toUnit == null) {
    params.toUnit = 'humanize';
  }

  const isApproximate = params.toUnit === 'humanize';
  if (isApproximate) {
    params.decimals = LENS_FORMAT_DURATION_DECIMALS_DEFAULT;
    delete params.compact;
  } else {
    if (params.decimals == null) {
      params.decimals = LENS_FORMAT_DURATION_DECIMALS_DEFAULT;
    }
    if (params.compact == null) {
      params.compact = LENS_FORMAT_DURATION_COMPACT_DEFAULT;
    }
  }
};

const normalizeNumberOrPercentFormatParams = (params: FormatParams): void => {
  if (params.decimals == null && (params.compact != null || params.suffix)) {
    params.decimals = LENS_FORMAT_NUMBER_DECIMALS_DEFAULT;
  }
};

const normalizeBytesOrBitsFormatParams = (params: FormatParams): void => {
  if (params.decimals == null && params.suffix) {
    params.decimals = LENS_FORMAT_NUMBER_DECIMALS_DEFAULT;
  }
};

/**
 * Pattern is the only display input for custom; `decimals` is a TS/editor placeholder (`0`).
 * Selecting Custom in the editor immediately persists `{id:'custom', params:{decimals:0}}`
 * before a pattern is typed — drop that residue. When a pattern is present, canonicalize
 * `decimals` to `0` to match `fromFormatAPIToLensState` / the UI default.
 */
const normalizeCustomFormat = (
  format: ValueFormatConfig,
  columnParams: { format?: ValueFormatConfig }
): boolean => {
  if (!format.params?.pattern) {
    delete columnParams.format;
    return false;
  }

  format.params.decimals = 0;
  return true;
};

const normalizeFormatParamsForId = (
  format: ValueFormatConfig,
  columnParams: { format?: ValueFormatConfig }
): boolean => {
  switch (format.id) {
    case 'custom':
      return normalizeCustomFormat(format, columnParams);
    case 'duration':
      if (!format.params) {
        return true;
      }
      normalizeDurationFormatParams(format.params);
      return true;
    case 'number':
    case 'percent':
      if (!format.params) {
        return true;
      }
      normalizeNumberOrPercentFormatParams(format.params);
      return true;
    case 'bytes':
    case 'bits':
      if (!format.params) {
        return true;
      }
      normalizeBytesOrBitsFormatParams(format.params);
      return true;
    default:
      return true;
  }
};

/**
 * Canonicalize value-format `params`.
 *
 * - Missing `decimals` when other format params are present → `2`, matching
 *   `decimalsToPattern(decimals = 2)` and the transform fill-in when compact/suffix are authored
 *   without decimals.
 * - Empty-string `suffix` is ignored at render and dropped by SO→API.
 * - Pattern-less `custom` format is dropped; with a pattern, `decimals` → `0` — see `normalizeCustomFormat`.
 * - `duration` units and mode-dependent `decimals`/`compact` — see `normalizeDurationFormatParams`.
 */
const normalizeFormatParams = (col: { params?: { format?: ValueFormatConfig } }): void => {
  if (!col.params) {
    return;
  }
  const params = col.params;
  const { format } = params;
  if (!format) {
    return;
  }

  if (format.id !== 'custom' && !format.params) {
    return;
  }

  if (format.params?.suffix === '') {
    delete format.params.suffix;
  }

  if (!normalizeFormatParamsForId(format, params)) {
    return;
  }
};

/**
 * Canonicalize a column's `label`/`customLabel` on the ORIGINAL side to match what the transform emits.
 *
 * A custom label (`customLabel === true`) round-trips verbatim, so it is kept and compared exactly. A
 * dropped or mutated custom label must fail the round-trip. Otherwise the stored `label` is a recomputed
 * non-custom default (`getDefaultLabel`) that the transform does not persist:
 * - form-based columns require `label` on the emitted `Operation`, so the transform emits `''`. Normalize
 *   the original to `customLabel: false` with an empty `label`.
 * - text-based columns keep both keys optional and the transform omits them, so drop both here.
 */
const normalizeColumnLabel = (
  col: { label?: string; customLabel?: boolean },
  {
    isTextBased,
    isCounterRateOrCumSumRefCol = false,
  }: { isTextBased: boolean; isCounterRateOrCumSumRefCol?: boolean }
): void => {
  // For the inner referenced columns of `counter_rate`/`cumulative_sum`: we derive their displayed label
  // from the referenced field's display name, never the inner column's label. So it's safe to normalize
  // away the custom label.
  if (col.customLabel === true && !isCounterRateOrCumSumRefCol) {
    return;
  }

  if (isTextBased) {
    delete col.label;
    delete col.customLabel;
  } else {
    col.customLabel = false;
    col.label = '';
  }
};

export interface CommonNormalizerArgs {
  layerRemapping: IdRemapping;
  columnRemapping: IdRemapping;
  /**
   * Optional per-chart dataType inference. When provided and returns a value,
   * it overrides the generic blanket coercions in `normalizeDataTypes` (form-based)
   * and `normalizeESQLMeta` (text-based). `isTextBased` is which column map is
   * being normalized — remapped IDs are shared, but the correct type is not.
   */
  inferColumnDataType?: (
    newColumnId: string,
    options: { isTextBased: boolean }
  ) => DataType | undefined;
}

// Stored filters carry `field`/ or deprecated `indexRefName` extensions that are absent from the base `FilterMeta`
type StoredFilterMeta = FilterMeta & { field?: string; indexRefName?: string };
type StoredFilter = Filter & { meta: StoredFilterMeta };

// Type guards used to narrow the deliberately-loose `@kbn/es-query` shapes (`query: Record<string, any>`,
// `meta.params: FilterMetaParams`) without any `as` casts.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasQueryValue = (value: unknown): value is { query: unknown } =>
  isRecord(value) && 'query' in value;

// Remove every top-level key except `meta`/`query` (e.g. legacy top-level `exists`/`range` that
// `migrateFilter` folds under `query` on a copy but leaves on the original object).
const stripExtraTopLevelKeys = (value: unknown, keep: readonly string[]): void => {
  if (!isRecord(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (!keep.includes(key)) {
      delete value[key];
    }
  }
};

// Delete every own key whose value is `null` (used for unbounded range bounds).
const dropNullValues = (value: unknown): void => {
  if (!isRecord(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (value[key] === null) {
      delete value[key];
    }
  }
};

/**
 * Canonicalize the ORIGINAL `state.filters` to match what the SO -> API -> SO transform emits, so the
 * strict roundtrip compare lines up. Every change is lossless: it either mirrors runtime
 * (`migrateFilter`/`mapFilter`) or drops a value runtime treats as absent.
 *
 * Returns the set of original `meta.index` reference names it consumed (captured before they are
 * rewritten to `filter-ref-<id>`), so the caller can drop the now-inlined filter reference entries from
 * `attributes.references`. Collecting and rewriting in a single pass keeps the two in lockstep.
 *
 * - `meta.index`: reference indirection only — the transform resolves the reference name to its data
 *   view id and rewrites it to `filter-ref-<id>` (`inject`/`extractFilterReferences`). Combined
 *   sub-filters inherit the parent's index (`to_stored_filter.ts` `cleanBase` has no per-condition one).
 * - Serialization defaults not reconstructed: `$state`, `negate: false`, top-level `alias: null`,
 *   sub-filter `alias`/`disabled` (`cleanBase`), and empty `query` objects.
 */
const normalizeFilters = (
  filters: StoredFilter[] | undefined,
  references: Reference[]
): Set<string> => {
  const filterRefNames = new Set<string>();
  if (!filters?.length) {
    return filterRefNames;
  }

  // Resolve a reference name to its data view id once (ad-hoc index strings are kept as-is), then
  // prefix `filter-ref-`, mirroring the transform's reference indirection.
  const refIdByName = new Map(references.map((reference) => [reference.name, reference.id]));
  const canonicalizeIndex = (index?: string): string | undefined => {
    if (index === undefined) return undefined;
    return `filter-ref-${refIdByName.get(index) ?? index}`;
  };

  // Canonicalize a leaf filter's query body to the transform's output. Lossless: value/field/data-view
  // identity is preserved.
  const canonicalizeQueryShape = (filter: StoredFilter): void => {
    // `migrateFilter` is what both runtime (`filterToQueryDsl`, `mapAndFlattenFilters`) and the transform
    // run: rewrite the deprecated `query.match.<f>: { query, type }` to `match_phrase`, and lift top-level
    // `exists`/`range`/`match_all` under `query`. Then keep only `{ meta, query }`.
    const migrated = migrateFilter(filter);
    filter.query = migrated.query;
    stripExtraTopLevelKeys(filter, ['meta', 'query']);

    // Collapse `match_phrase.<f>: { query }` to the scalar `buildPhraseFilter` shape, and drop the
    // redundant `meta.params.type` — `mapFilter`/`mapPhrase` does the same at render.
    const matchPhrase = isRecord(filter.query) ? filter.query.match_phrase : undefined;
    if (isRecord(matchPhrase)) {
      for (const field of Object.keys(matchPhrase) ?? []) {
        const value = matchPhrase[field];
        if (hasQueryValue(value)) {
          matchPhrase[field] = value.query;
        }
      }
    }
    if (filter.meta.type === 'phrase') {
      const params = filter.meta.params;
      if (isRecord(params) && 'type' in params) {
        delete params.type;
      }
    }

    // Drop `null` range bounds (query body + `meta.params`): a null bound is unbounded, i.e. absent.
    if (filter.meta.type === 'range') {
      const range = isRecord(filter.query) ? filter.query.range : undefined;
      if (isRecord(range)) {
        for (const field of Object.keys(range)) {
          dropNullValues(range[field]);
        }
      }
      dropNullValues(filter.meta.params);
    }
  };

  // Canonicalize one filter (and its combined descendants). `index` is the inherited data view id;
  // `isSubFilter` marks a combined sub-filter (loses more meta than a top-level filter).
  const processFilter = (
    filter: StoredFilter | string | number | boolean,
    index: string | undefined,
    isSubFilter: boolean
  ): void => {
    if (typeof filter !== 'object' || filter === null || !filter.meta) return;

    // Capture the original reference name before it is rewritten, so the caller can drop the matching
    // (now-inlined) `references` entry.
    if (filter.meta.index) {
      filterRefNames.add(filter.meta.index);
    }

    // Set the canonical/inherited index, or drop it when there is none.
    if (index === undefined) {
      delete filter.meta.index;
    } else {
      filter.meta.index = index;
    }

    // `$state` is UI-only and never reconstructed. NOTE: this only models `appState`. A `globalState`
    // (pinned) filter is dropped ENTIRELY by the transform (`from_stored_filter.ts` returns `undefined`),
    // which we do NOT reproduce — Lens panel filters are always `appState`, so the corpus has none. If
    // one appeared the lengths would differ and the test would fail loudly, which is the right outcome.
    delete filter.$state;
    // Drop any residual `meta.indexRefName`. The 8.1.0 migration already moved pre-8.1 `indexRefName`
    // into `meta.index` when the fixture was built; anything left is on a mis-versioned panel with no
    // `meta.index` — unresolvable by both runtime (`injectFilterReferences`) and the transform, so both
    // drop it.
    if ('indexRefName' in filter.meta) {
      delete filter.meta.indexRefName;
    }

    // `negate` is serialized only when `true`.
    if (filter.meta.negate !== true) {
      delete filter.meta.negate;
    }

    if (isSubFilter) {
      // Combined sub-filters carry neither `alias` nor `disabled` (`cleanBase`).
      delete filter.meta.alias;
      delete filter.meta.disabled;
    } else if (filter.meta.alias === null) {
      // A top-level `alias: null` is not representable; only a real label round-trips.
      delete filter.meta.alias;
    }

    // `meta.value` is display state recomputed by `mapFilter`; never persisted.
    delete filter.meta.value;

    // `wildcard` isn't in the `FILTERS` enum, so both runtime (`mapFilter` -> `mapDefault`) and the
    // transform relabel it to `custom`. Relabel so it flows through the `custom` branch below.
    if (filter.meta.type === 'wildcard') {
      filter.meta.type = 'custom';
    }

    // key/field alignment (`meta.field` is an extended stored-filter prop, see `StoredFilterMeta`).
    if (filter.meta.type === 'custom') {
      // Custom/DSL filters have no single field: `meta.key` is the `mapDefault` artifact (literal
      // "query"), dropped by the transform. Keep `meta.field` (scripted filters) so it round-trips.
      delete filter.meta.key;
    } else {
      // Structured filters carry the field in both `meta.key` and `meta.field` (always equal in the
      // corpus); align them.
      const fieldName = filter.meta.key ?? filter.meta.field;
      if (fieldName !== undefined) {
        filter.meta.key = fieldName;
        filter.meta.field = fieldName;
      }
    }

    // Query-shape canonicalization (leaf filters only; sub-filters recurse below and have no query body).
    if (filter.meta.type !== 'combined') {
      canonicalizeQueryShape(filter);
    }

    // Empty `query` objects are not emitted by the transform.
    if (Object.keys(filter.query ?? {}).length === 0) {
      delete filter.query;
    }

    // Recurse into combined sub-filters.
    if (filter.meta.type === 'combined' && Array.isArray(filter.meta.params)) {
      filter.meta.params.forEach((sub) => processFilter(sub, index, true));
    }
  };

  filters.forEach((filter) => processFilter(filter, canonicalizeIndex(filter.meta?.index), false));
  return filterRefNames;
};

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

    // 'type' is a leaked SO envelope field, never part of LensAttributes and dropped by the transform
    // (fixed in https://github.com/elastic/kibana/pull/258250). Strip on the ORIGINAL side only so that
    // if the transform ever re-emits it, transformed still carries it and the strict compare fails.
    if ('type' in attributes && attributes.type === 'lens') {
      delete attributes.type;
    }

    // Canonicalize filters and collect (in a single pass) the reference names they consumed, so the
    // matching (now-inlined) filter reference entries can be dropped from `references` below.
    const filterRefNames = normalizeFilters(attributes.state.filters, attributes.references);

    // replace layer in reference name (filter references are dropped)
    attributes.references = normalizeReferences(attributes, layerRemapping, filterRefNames);

    // Remap internalReferences layer IDs using layerRemapping.
    // normalizeFormBasedAdHocDataViews / normalizeESQLAdHocDataViews now keep the original layer UUID
    // in the ref name so we can apply the same replacement logic here.
    if (attributes.state.internalReferences?.length) {
      attributes.state.internalReferences = attributes.state.internalReferences.map((ref) => {
        let name = ref.name;
        layerRemapping.forEach(([oldId, newId]) => {
          if (oldId && name.includes(oldId)) {
            name = name.replace(oldId, newId);
          }
        });
        return name !== ref.name ? { ...ref, name } : ref;
      });
    }

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
            const columnId = columnIdMap.get(column.columnId) ?? column.columnId;
            const updatedColumn = {
              ...column,
              columnId,
            };
            normalizeESQLMeta(
              updatedColumn,
              inferColumnDataType?.(columnId, { isTextBased: true })
            );
            normalizeColumnLabel(updatedColumn, { isTextBased: true });
            // `null`/`''` are leaked persist; a real Identifier Control name is reconstructed
            // from `??` on `fieldName` by `buildESQLLayer`.
            if (!updatedColumn.variable) {
              delete updatedColumn.variable;
            }
            normalizeFormatParams(updatedColumn);
            return updatedColumn;
          });

          // For non-datatable charts, 'inMetricDimension' is runtime-only state set by the
          // suggestion engine and is not used anywhere else. Strip it.
          if (attributes.visualizationType !== 'lnsDatatable') {
            for (const column of layer.columns) {
              delete column.inMetricDimension;
            }
          }

          // Datatable's ESQL output order is driven by `layer.columns` array order
          // and uses its own canonical (rows → splits → metrics) sort in
          // the datatable normalizer. For every other chart, alphabetical
          // canonicalization is fine because column order does not drive
          // rendering.
          if (attributes.visualizationType !== 'lnsDatatable') {
            layer.columns.sort((a, b) => a.columnId.localeCompare(b.columnId));
          }

          // 'timeField' is dropped and re-inferred at runtime from the data view unless the ESQL query refers to a specific time field
          layer.timeField = layer.query?.esql
            ? parseTimeFieldFromESQLQuery(layer.query.esql) || undefined
            : undefined;

          // 'allColumns' is a runtime-only property, not persisted or produced by transform
          if ('allColumns' in layer) {
            delete layer.allColumns;
          }
        }

        // leaked runtime-only property, not persisted or produced by transform
        if ('initialContext' in ds) {
          delete ds.initialContext;
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

            // Add canonical column IDs that are in layer.columns but were missing from the
            // original columnOrder (e.g. breakdown or inner-reference columns omitted in older SOs).
            // Maintain `inOrder` as entries are pushed to prevent duplicates when multiple original
            // column IDs share the same canonical name (e.g. two layers both mapped to 'line_breakdown').
            const inOrder = new Set(layer.columnOrder);
            for (const [, newCol] of columnRemapping) {
              if (newCol && layer.columns[newCol] && !inOrder.has(newCol)) {
                layer.columnOrder.push(newCol);
                inOrder.add(newCol);
              }
            }

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

            // Inner referenced columns of counter_rate/cumulative_sum are regenerated (label-less) by
            // the transform and their label never surfaces at runtime, so their (possibly custom) label
            // must be dropped on the original side too. Collect their canonical IDs (references are
            // remapped via columnIdMap, matching the already-remapped column keys).
            const counterRateOrCumSumRefIds = new Set<string>();
            // All Backing Columns (any reference target) — used for terms Order By contract loss.
            const innerRefColumnIds = new Set<string>();
            for (const col of Object.values(layer.columns)) {
              if (isReferenceBasedColumn(col)) {
                for (const refId of col.references) {
                  innerRefColumnIds.add(columnIdMap.get(refId) ?? refId);
                }
                if (
                  (col.operationType === 'counter_rate' ||
                    col.operationType === 'cumulative_sum') &&
                  col.references[0]
                ) {
                  counterRateOrCumSumRefIds.add(
                    columnIdMap.get(col.references[0]) ?? col.references[0]
                  );
                }
              }
            }

            for (const [columnId, col] of Object.entries(layer.columns)) {
              // `scale` is derived OperationMetadata, not authored state. The runtime never reads the
              // persisted `column.scale`: `columnToOperation` recomputes it on load from the operation
              // definition or it is even field-type dependent (e.g. last_value -> getScale(field.type), ranges).
              // Dropping it through the SO -> API -> SO round-trip is therefore behaviorally lossless.
              delete col.scale;

              const isCounterRateOrCumSumRefCol = counterRateOrCumSumRefIds.has(columnId);

              normalizeColumnLabel(col, {
                isTextBased: false,
                isCounterRateOrCumSumRefCol,
              });

              // The auto-generated backing column of a counter_rate/cumulative_sum loses its (dead)
              // display format through the round-trip.
              if (isCounterRateOrCumSumRefCol) {
                normalizeCounterRateOrCumSumRefFormat(col);
              }

              // Drop a stale `sortField` on any non-`last_value` column (dead residue)
              normalizeStaleSortField(col);

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
              normalizeDataTypes(col, inferColumnDataType?.(columnId, { isTextBased: false }));

              // Canonicalize terms `params` empty defaults the transform never round-trips
              if (isTermsColumn(col)) {
                normalizeTermsColumnParams(col, innerRefColumnIds);

                // Canonicalize a custom `orderAgg` (rank function) rebuilt by the transform
                if (col.params.orderAgg) {
                  normalizeOrderAgg(col.params.orderAgg);
                }
              }

              // Canonicalize range-column params
              if (isRangeColumn(col)) {
                normalizeRangeColumnParams(col);
              }

              // Default missing date_histogram flags to `false` (transform emits `Boolean(...)`)
              if (isDateHistogramColumn(col)) {
                normalizeDateHistogramColumnParams(col);
              }

              // Normalize `emptyAsNull` param for metric operations
              normalizeEmptyAsNull(col, { isCounterRateOrCumSumRefCol });

              // Drop an empty `params: {}`
              normalizeEmptyFormatOnlyParams(col);

              // Normalizen formula/static_value columns
              normalizeFormulaAndStaticValueColumns(col);

              // Default missing/`null` `showArrayValues` to `true` on last_value columns (8.2 migration)
              normalizeLastValueShowArrayValues(col);

              // Strip empty `format.params` / empty-string `suffix`; canonicalize per format id
              if ('params' in col) {
                normalizeFormatParams(col);
              }
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
    normalizeESQLQuery(attributes);

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

    // Sort references to match normalizeReferences ordering applied on the original side
    attributes.references = orderBy(attributes.references, ['name', 'id', 'type']);

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
 * A named (non-`custom`) palette renders from `palette id + continuity + steps` alone. The stored
 * stop positions, `colorStops`, and numeric bounds (`rangeMin`/`rangeMax`) are throwaway snapshots
 * that the transform does not reproduce (it emits empty `stops` and lets the palette service
 * resupply colors at render time). Drop those.
 *
 * `rangeType` is deliberately NOT dropped: it is deterministic per chart (`percent` everywhere
 * except `legacy_metric` and single-value `metric`, which reconstruct as `number` via
 * `useNumericRange`). Keeping it in the comparison enforces that each chart passes the correct
 * `useNumericRange`; the `original` side defaults a missing `rangeType` to `'percent'` so legacy
 * SOs that omit it still line up.
 */
function clearUnusedNamedPaletteParams(palette: PaletteOutput<CustomPaletteParams>) {
  if (!palette.params) return;
  delete palette.params.stops;
  delete palette.params.colorStops;
  delete palette.params.rangeMin;
  delete palette.params.rangeMax;
}

/**
 * Normalized the palette params provided a string path to the palette(s) in the attributes
 *
 * This need to address:
 * - named palettes: `palette id`, `continuity`, and `rangeType` are compared strictly (see
 *   `normalizeNamedPaletteParams`); the throwaway stops/colorStops/bounds are dropped.
 * - custom palettes: account for the last color stop always becoming `rangeMax`, re-derive
 *   `colorStops` from the normalized `stops`, and default the missing `rangeType`/`continuity`/bounds
 *   the transform always derives.
 */
export function getPaletteNormalizer<T extends LensAttributes>(
  palettePath: string,
  isSingleValuePalette?: (attributes: T) => boolean
): NormalizerConfig<T> {
  return {
    original: (attributes: T) => {
      const palettes = getValues<PaletteOutput<CustomPaletteParams>>(
        attributes,
        palettePath
      ).filter(Boolean);

      const useNumericRange =
        typeof isSingleValuePalette === 'function' ? isSingleValuePalette(attributes) : false;

      palettes.forEach((palette) => {
        if (!palette.params) return;

        const rangeMin = getRangeValue(palette.params.rangeMin);
        const rangeMax = getRangeValue(palette.params.rangeMax);

        if (palette.name !== 'custom') {
          // A distributed palette always opens both bounds so out-of-range values stay colored
          palette.params.continuity = 'all';

          // The transform canonicalizes the legacy `complimentary` spelling to the GA palette id
          // (`complementary`), matching runtime. Canonicalize the original side too so the
          // round-trip identity holds.
          const canonicalName =
            palette.name === LEGACY_COMPLIMENTARY_PALETTE ? COMPLEMENTARY_PALETTE : palette.name;
          palette.name = canonicalName;
          palette.params.name = canonicalName;
          palette.params.rangeType = useNumericRange ? 'number' : 'percent';
          clearUnusedNamedPaletteParams(palette);
          return;
        }

        // For multi-stop palettes: the SO→API transform uses rangeMax as the last step's upper
        // bound (lte), replacing the original stop value. The API→SO step then reconstructs the
        // stop from lte, so the last stop becomes rangeMax after the round-trip.
        //
        // For single stop palettes: the transform's `i === 0` branch emits a closed
        // `lt: <stop>` and returns before the last-step `lte: rangeMax` branch can run, so
        // `lte: rangeMax` is never applied to the stop. For an open-above single stop (continuity
        // 'above'/'all', rangeMax null) the transform instead appends a trailing `gte: <stop>`
        // continuation step, which `mergeTrailingSameColorStep` collapses back on the reverse pass,
        // leaving the original `lt` (the stop value) intact.
        if (palette.params.stops && palette.params.stops.length > 1) {
          const lastStop = palette.params.stops.at(-1);
          if (lastStop) lastStop.stop = rangeMax as unknown as number; // can be null
        }

        if (!palette.params.rangeType) {
          palette.params.rangeType = 'percent';
        }

        if (!palette.params.continuity) {
          palette.params.continuity = getContinuity(rangeMin, rangeMax);
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
