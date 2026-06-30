/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { set } from '@kbn/safer-lodash-set';
import { uniq } from 'lodash';
import { i18n } from '@kbn/i18n';
import moment from 'moment-timezone';
import type { Serializable } from '@kbn/utility-types';
import { DEFAULT_COLOR_MAPPING_CONFIG, type ColorMapping } from '@kbn/coloring';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { Reference } from '@kbn/content-management-utils';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import type { DatatableUtilitiesService } from '@kbn/data-plugin/common';
import { emptyTitleText } from '@kbn/visualization-ui-components';
import type { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { ISearchStart } from '@kbn/data-plugin/public';
import type { DraggingIdentifier, DropType } from '@kbn/dom-drag-drop';
import { getAbsoluteTimeRange } from '@kbn/data-plugin/common';
import type {
  LensDocument,
  DateRange,
  Datasource,
  DatasourceMap,
  Visualization,
  IndexPatternMap,
  IndexPatternRef,
  DraggedField,
  DragDropOperation,
  UserMessage,
  DatasourceStates,
  VisualizationState,
  TriggerEvent,
} from '@kbn/lens-common';
import type { LensDatasourceId } from '@kbn/lens-common';
import { LENS_DATASOURCE_ID } from '@kbn/lens-common';
import {
  isOperation,
  isLensBrushEvent,
  isLensMultiFilterEvent,
  isLensFilterEvent,
} from './types_guards';
import type { IndexPatternServiceAPI } from './data_views_service/service';
import { COLOR_MAPPING_OFF_BY_DEFAULT } from '../common/constants';

export function getVisualizeGeoFieldMessage(fieldType: string) {
  return i18n.translate('xpack.lens.visualizeGeoFieldMessage', {
    defaultMessage: `Lens cannot visualize {fieldType} fields`,
    values: { fieldType },
  });
}

export function getResolvedDateRange(timefilter: TimefilterContract) {
  const { from, to } = timefilter.getTime();
  return { fromDate: from, toDate: to };
}

export function getAbsoluteDateRange(timefilter: TimefilterContract) {
  const { from, to } = timefilter.getTime();
  const { min, max } = timefilter.calculateBounds({
    from,
    to,
  });
  return { fromDate: min?.toISOString() || from, toDate: max?.toISOString() || to };
}

export function convertToAbsoluteDateRange(dateRange: DateRange, now: Date) {
  const absRange = getAbsoluteTimeRange(
    {
      from: dateRange.fromDate as string,
      to: dateRange.toDate as string,
    },
    { forceNow: now }
  );

  return {
    fromDate: absRange.from,
    toDate: absRange.to,
  };
}

export function containsDynamicMath(dateMathString: string) {
  return dateMathString.includes('now');
}

export function getTimeZone(uiSettings: IUiSettingsClient) {
  const configuredTimeZone = uiSettings.get('dateFormat:tz');
  if (configuredTimeZone === 'Browser') {
    return moment.tz.guess();
  }

  return configuredTimeZone;
}

export function getActiveDatasourceIdFromDoc(doc?: LensDocument): LensDatasourceId | null {
  if (!doc) {
    return null;
  }

  const [firstDatasourceFromDoc] = Object.keys(doc.state.datasourceStates);
  if (
    firstDatasourceFromDoc === LENS_DATASOURCE_ID.FORM_BASED ||
    firstDatasourceFromDoc === LENS_DATASOURCE_ID.TEXT_BASED
  ) {
    return firstDatasourceFromDoc as LensDatasourceId;
  }
  return null;
}

export function getActiveVisualizationIdFromDoc(doc?: LensDocument) {
  if (!doc) {
    return null;
  }
  return doc.visualizationType || null;
}

export function getInitialDatasourceId(datasourceMap: DatasourceMap, doc?: LensDocument) {
  return (doc && getActiveDatasourceIdFromDoc(doc)) || Object.keys(datasourceMap)[0] || null;
}

export function getInitialDataViewsObject(
  indexPatterns: IndexPatternMap,
  indexPatternRefs: IndexPatternRef[]
) {
  return {
    indexPatterns,
    indexPatternRefs,
  };
}

export async function refreshIndexPatternsList({
  activeDatasources,
  indexPatternService,
  indexPatternId,
  indexPatternsCache,
}: {
  indexPatternService: IndexPatternServiceAPI;
  activeDatasources: Record<string, Datasource>;
  indexPatternId: string;
  indexPatternsCache: IndexPatternMap;
}) {
  // collect all the onRefreshIndex callbacks from datasources
  const onRefreshCallbacks = Object.values(activeDatasources)
    .map((datasource) => datasource?.onRefreshIndexPattern)
    .filter(Boolean);

  const newlyMappedIndexPattern = await indexPatternService.loadIndexPatterns({
    cache: {},
    patterns: [indexPatternId],
    onIndexPatternRefresh: () => onRefreshCallbacks.forEach((fn) => fn()),
  });
  const indexPattern = newlyMappedIndexPattern[indexPatternId];
  indexPatternService.updateDataViewsState({
    indexPatterns: {
      ...indexPatternsCache,
      [indexPatternId]: indexPattern,
    },
  });
}

export function extractReferencesFromState({
  activeDatasourceId,
  activeDatasources,
  datasourceStates,
  visualizationState,
  activeVisualization,
}: {
  activeDatasourceId: string | null;
  activeDatasources: DatasourceMap;
  datasourceStates: DatasourceStates;
  visualizationState: unknown;
  activeVisualization?: Visualization;
}): Reference[] {
  const references: Reference[] = [];
  Object.entries(activeDatasources).forEach(([id, datasource]) => {
    const { references: persistableReferences } = datasource.getPersistableState(
      datasourceStates[id].state
    );
    references.push(...persistableReferences);
  });

  if (activeVisualization?.getPersistableState) {
    const { references: persistableReferences } = activeVisualization.getPersistableState(
      visualizationState,
      activeDatasourceId ? activeDatasources[activeDatasourceId] : undefined,
      activeDatasourceId ? datasourceStates[activeDatasourceId] : undefined
    );
    references.push(...persistableReferences);
  }
  return references;
}

export function getIndexPatternsIds({
  activeDatasourceId,
  activeDatasources,
  datasourceStates,
  visualizationState,
  activeVisualization,
}: {
  activeDatasourceId: string | null;
  activeDatasources: Record<string, Datasource>;
  datasourceStates: DatasourceStates;
  visualizationState: unknown;
  activeVisualization?: Visualization;
}): string[] {
  const references = extractReferencesFromState({
    activeDatasourceId,
    activeDatasources,
    datasourceStates,
    visualizationState,
    activeVisualization,
  });

  const currentIndexPatternId: string | undefined = Object.entries(activeDatasources).reduce<
    string | undefined
  >((currentId, [id, datasource]) => {
    if (currentId == null) {
      return datasource.getUsedDataView(datasourceStates[id].state);
    }
    return currentId;
  }, undefined);

  const referencesIds = references
    .filter(({ type }) => type === 'index-pattern')
    .map(({ id }) => id);
  if (currentIndexPatternId) {
    referencesIds.unshift(currentIndexPatternId);
  }
  return uniq(referencesIds);
}

export async function getIndexPatternsObjects(
  ids: string[],
  dataViews: DataViewsContract
): Promise<{ indexPatterns: DataView[]; rejectedIds: string[] }> {
  const responses = await Promise.allSettled(ids.map((id) => dataViews.get(id)));
  const fullfilled = responses.filter(
    (response): response is PromiseFulfilledResult<DataView> => response.status === 'fulfilled'
  );
  const rejectedIds = responses
    .map((_response, i) => ids[i])
    .filter((id, i) => responses[i].status === 'rejected');
  // return also the rejected ids in case we want to show something later on
  return { indexPatterns: fullfilled.map((response) => response.value), rejectedIds };
}

export function getRemoveOperation(
  activeVisualization: Visualization,
  visualizationState: VisualizationState['state'],
  layerId: string,
  layerCount: number
) {
  if (activeVisualization.getRemoveOperation) {
    return activeVisualization.getRemoveOperation(visualizationState, layerId);
  }
  // fallback to generic count check
  return layerCount === 1 ? 'clear' : 'remove';
}

function getTablesAndColumnsFromContext(event: TriggerEvent) {
  // if it's a negated filter, never respect bound time field
  if ('negate' in event.data && event.data.negate) {
    return [];
  }
  if (isLensBrushEvent(event)) {
    return [{ table: event.data.table, column: event.data.column }];
  }
  if (isLensMultiFilterEvent(event)) {
    return event.data.data.map(({ table, cells }) => ({
      table,
      column: cells[0].column,
    }));
  }
  if (isLensFilterEvent(event)) {
    return event.data.data;
  }
  return event.data;
}

export function inferTimeField(datatableUtilities: DatatableUtilitiesService, event: TriggerEvent) {
  const tablesAndColumns = getTablesAndColumnsFromContext(event);
  return !Array.isArray(tablesAndColumns)
    ? [tablesAndColumns]
    : tablesAndColumns
        .map(({ table, column }) => {
          const tableColumn = table.columns[column];
          const hasTimeRange = Boolean(
            tableColumn && datatableUtilities.getColumnTimeRange(tableColumn)
          );
          if (hasTimeRange) {
            return tableColumn.meta.field;
          }
        })
        .find(Boolean);
}

export function renewIDs<T = unknown>(
  obj: T,
  forRenewIds: string[],
  getNewId: (id: string) => string | undefined
): T {
  obj = structuredClone(obj);
  const recursiveFn = (
    item: Serializable,
    parent?: Record<string, Serializable> | Serializable[],
    key?: string | number
  ) => {
    if (typeof item === 'object') {
      if (Array.isArray(item)) {
        item.forEach((a, k, ref) => recursiveFn(a, ref, k));
      } else {
        if (item) {
          Object.keys(item).forEach((k) => {
            let newId = k;
            if (forRenewIds.includes(k)) {
              newId = getNewId(k) ?? k;
              item[newId] = item[k];
              delete item[k];
            }
            recursiveFn(item[newId], item, newId);
          });
        }
      }
    } else if (
      parent &&
      key !== undefined &&
      typeof item === 'string' &&
      forRenewIds.includes(item)
    ) {
      set(parent, key, getNewId(item) ?? item);
    }
  };
  recursiveFn(obj as unknown as Serializable);
  return obj;
}

/**
 * The dimension container is set up to close when it detects a click outside it.
 * Use this CSS class to exclude particular elements from this behavior.
 */
export const DONT_CLOSE_DIMENSION_CONTAINER_ON_CLICK_CLASS =
  'lensDontCloseDimensionContainerOnClick';

export function isDraggedField(fieldCandidate: unknown): fieldCandidate is DraggedField {
  return (
    typeof fieldCandidate === 'object' &&
    fieldCandidate !== null &&
    ['id', 'field'].every((prop) => prop in fieldCandidate)
  );
}

export function isDraggedDataViewField(fieldCandidate: unknown): fieldCandidate is DraggedField {
  return (
    typeof fieldCandidate === 'object' &&
    fieldCandidate !== null &&
    ['id', 'field', 'indexPatternId'].every((prop) => prop in fieldCandidate)
  );
}

export const isOperationFromCompatibleGroup = (
  op1?: DraggingIdentifier,
  op2?: DragDropOperation
) => {
  return (
    isOperation(op1) &&
    isOperation(op2) &&
    op1.columnId !== op2.columnId &&
    op1.groupId === op2.groupId &&
    op1.layerId !== op2.layerId
  );
};

export const isOperationFromTheSameGroup = (op1?: DraggingIdentifier, op2?: DragDropOperation) => {
  return (
    isOperation(op1) &&
    isOperation(op2) &&
    op1.columnId !== op2.columnId &&
    op1.groupId === op2.groupId &&
    op1.layerId === op2.layerId
  );
};

export const sortDataViewRefs = (dataViewRefs: IndexPatternRef[]) =>
  dataViewRefs.sort((a, b) => {
    return a.title.localeCompare(b.title);
  });

export const getSearchWarningMessages = (
  adapter: RequestAdapter,
  datasource: Datasource,
  state: unknown,
  deps: {
    searchService: ISearchStart;
  }
): UserMessage[] => {
  const userMessages: UserMessage[] = [];

  deps.searchService.showWarnings(adapter, (warning, meta) => {
    const { request, response } = meta;

    const userMessagesFromWarning = datasource.getSearchWarningMessages?.(
      state,
      warning,
      request,
      response
    );

    if (userMessagesFromWarning?.length) {
      userMessages.push(...userMessagesFromWarning);
      return true;
    }
    return false;
  });

  return userMessages;
};

function getSafeLabel(label: string) {
  return label.trim().length ? label : emptyTitleText;
}

export function getUniqueLabelGenerator() {
  const counts = {} as Record<string, number>;
  return function makeUnique(label: string) {
    let uniqueLabel = getSafeLabel(label);

    while (counts[uniqueLabel] >= 0) {
      const num = ++counts[uniqueLabel];
      uniqueLabel = i18n.translate('xpack.lens.uniqueLabel', {
        defaultMessage: '{label} [{num}]',
        values: { label: getSafeLabel(label), num },
      });
    }

    counts[uniqueLabel] = 0;
    return uniqueLabel;
  };
}

export function nonNullable<T>(v: T): v is NonNullable<T> {
  return v != null;
}

export function reorderElements<S>(items: S[], targetId: S, sourceId: S) {
  const result = items.filter((c) => c !== sourceId);
  const targetIndex = items.findIndex((c) => c === sourceId);
  const sourceIndex = items.findIndex((c) => c === targetId);

  const targetPosition = result.indexOf(targetId);
  result.splice(targetIndex < sourceIndex ? targetPosition + 1 : targetPosition, 0, sourceId);
  return result;
}

export function shouldRemoveSource(
  source: unknown,
  dropType: DropType
): source is DragDropOperation {
  return (
    isOperation(source) &&
    (dropType === 'move_compatible' ||
      dropType === 'move_incompatible' ||
      dropType === 'combine_incompatible' ||
      dropType === 'combine_compatible' ||
      dropType === 'replace_compatible' ||
      dropType === 'replace_incompatible')
  );
}

export const getColorMappingDefaults = (
  options: {
    defaultPaletteId?: ColorMapping.Config['paletteId'];
  } = {}
) => {
  if (COLOR_MAPPING_OFF_BY_DEFAULT) {
    return undefined;
  }
  const defaultPaletteId = options.defaultPaletteId ?? DEFAULT_COLOR_MAPPING_CONFIG.paletteId;
  return { ...DEFAULT_COLOR_MAPPING_CONFIG, paletteId: defaultPaletteId };
};

export const EXPRESSION_BUILD_ERROR_ID = 'expression_build_error';
