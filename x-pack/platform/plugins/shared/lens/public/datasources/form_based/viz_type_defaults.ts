/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LENS_DATASOURCE_ID,
  type FormBasedPrivateState,
  type LensDocument,
} from '@kbn/lens-common';
import {
  applyEmptyRowsDefaultsOnTypeSwitch,
  applyEmptyRowsDefaultsToSuggestionState,
} from './include_empty_rows_defaults';

interface BaseContext {
  /** Datasource that owns the state being adjusted. */
  datasourceId?: string;
  /** Form-based datasource state to adjust. */
  datasourceState: FormBasedPrivateState;
  /** Visualization type id (subtype where applicable) being switched to. */
  targetVisualizationTypeId: string | undefined;
}

/**
 * A field drop produces a suggestion that may contain freshly created columns.
 * Visualization-type defaults apply to those new columns only.
 */
export interface SuggestionDropContext extends BaseContext {
  kind: 'suggestion';
  /** Form-based state before the drop, used to detect newly created columns. */
  previousDatasourceState: FormBasedPrivateState | undefined;
}

/**
 * A chart-type / series-type switch keeps existing columns. The target type's
 * defaults are applied, except for a layer switched back to its saved type.
 */
export interface TypeSwitchContext extends BaseContext {
  kind: 'typeSwitch';
  /** Loaded saved object, the source of each layer's persisted configuration. */
  persistedDoc: LensDocument | undefined;
  /** Resolves a layer's persisted visualization type id (subtype aware). */
  getPersistedVisualizationTypeId?: (layerId: string) => string | undefined;
  /**
   * Scopes reconciliation to a single layer for a same-visualization subtype
   * switch (e.g. XY series type), which only changes that layer's type. Omitted
   * for a cross-visualization switch, which collapses the whole chart.
   */
  targetLayerId?: string;
}

export type VizTypeDefaultsContext = SuggestionDropContext | TypeSwitchContext;

/**
 * Applies every datasource-owned default that should track the active
 * visualization type when the user switches chart type, series type, or adds a
 * layer.
 *
 * This is the single seam shared by all switch entry points: introducing a new
 * visualization-type default means extending this function rather than touching
 * each call site. Non form-based datasources are returned untouched.
 */
export function applyVizTypeDatasourceDefaults(
  context: VizTypeDefaultsContext
): FormBasedPrivateState {
  const { datasourceId, datasourceState, targetVisualizationTypeId } = context;

  if (datasourceId !== LENS_DATASOURCE_ID.FORM_BASED) {
    return datasourceState;
  }

  if (context.kind === 'suggestion') {
    return applyEmptyRowsDefaultsToSuggestionState(
      datasourceState,
      context.previousDatasourceState,
      targetVisualizationTypeId
    );
  }

  return applyEmptyRowsDefaultsOnTypeSwitch(
    datasourceState,
    context.persistedDoc,
    targetVisualizationTypeId,
    context.getPersistedVisualizationTypeId,
    context.targetLayerId
  );
}
