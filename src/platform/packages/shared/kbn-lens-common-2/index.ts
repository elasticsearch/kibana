/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CanCancelRequests,
  HasEditCapabilities,
  HasLibraryTransforms,
  HasSupportedTriggers,
  PublishesBlockingError,
  PublishesDataLoading,
  PublishesDataViews,
  PublishesDisabledActionIds,
  PublishesEsql,
  PublishesProjectRoutingOverrides,
  PublishesRendered,
  PublishesSavedObjectId,
  PublishesUnifiedSearch,
  PublishesViewMode,
  PublishesWritableDescription,
  PublishesWritableTitle,
  PublishesUnsavedChanges,
  SerializedTitles,
  SerializedTimeRange,
  SupportsJsonExport,
} from '@kbn/presentation-publishing';
import type { LensApiConfig } from '@kbn/lens-embeddable-utils';
import type { Simplify } from '@kbn/chart-expressions-common';
import type {
  LensByValueBase,
  LensByRefSerializedState,
  LensInspectorAdapters,
  LensRequestHandlersProps,
  LensApiCallbacks,
  LensHasEditPanel,
  LensSerializedState,
} from '@kbn/lens-common';
import type { PublishesSearchSession } from '@kbn/presentation-publishing/interfaces/fetch/publishes_search_session';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { SerializedDrilldowns } from '@kbn/embeddable-plugin/server';

/**
 * Panel-level connfigurations that should be persisted for by-value Lens panels.
 * Excludes runtime/inherited state from unified search and dashboard contexts.
 */
export type LensByValuePanelConfigs = SerializedTitles & // title, description, hide_title
  SerializedDrilldowns &
  SerializedTimeRange;

export type LensByValueSerializedAPIConfig = LensByValuePanelConfigs & {
  // Temporarily allow both old and new attributes until all chart types are supported and feature flag removed
  attributes: LensApiConfig | LensByValueBase['attributes'];
  ref_id?: string; // really should be never but creates type issues
};

/**
 * By-value Lens panel config in flattened wire shape (dashboard app API with `lens.apiFormat`).
 * Chart API fields from {@link LensApiConfig} sit at the root next to panel metadata.
 */
export type LensByValueFlattenedSerializedAPIConfig = LensByValuePanelConfigs & LensApiConfig;

export type LensByRefSerializedAPIConfig = LensByRefSerializedState;

/**
 * Combined properties of API config used in dashboard API for lens panels
 *
 *  Includes:
 * - Lens document state (for by-value)
 * - Panel settings
 * - other props from the embeddable
 */
export type LensSerializedAPIConfig = LensByRefSerializedAPIConfig | LensByValueSerializedAPIConfig;

/**
 * The full wire-level serialized type that includes the flattened lens by value variant.
 * Used at serialization/deserialization boundaries where the panel config
 * may arrive in the flat wire shape (with `lens.apiFormat` enabled).
 */
export type LensWireAPIConfig = LensSerializedAPIConfig | LensByValueFlattenedSerializedAPIConfig;

export interface LegacyLensStateApi {
  /**
   * Returns legacy serialized state to avoid duplicate transformations
   *
   * @deprecated use `serializeState` instead
   */
  getLegacySerializedState: () => LensSerializedState;
}

export type LensApi = Simplify<
  DefaultEmbeddableApi<LensWireAPIConfig> &
    // This is used by actions to operate the edit action
    HasEditCapabilities &
    // for blocking errors leverage the embeddable panel UI
    PublishesBlockingError &
    // This is used by dashboard/container to show filters/queries on the panel
    PublishesUnifiedSearch &
    // Forward the search session id
    PublishesSearchSession &
    // Let the container know the loading state
    PublishesDataLoading &
    // Let the container know when the rendering has completed rendering
    PublishesRendered &
    // Let the container know the used data views
    PublishesDataViews &
    // Let the container operate on panel title/description
    PublishesWritableTitle &
    PublishesWritableDescription &
    // This embeddable can narrow down specific triggers usage
    HasSupportedTriggers &
    PublishesDisabledActionIds &
    // Offers methods to operate from/on the linked saved object
    HasLibraryTransforms<LensWireAPIConfig, LensWireAPIConfig> &
    // Let the container know the view mode
    PublishesViewMode &
    // Let the container know the saved object id
    PublishesSavedObjectId &
    // Let the container know about unsaved changes
    PublishesUnsavedChanges &
    PublishesProjectRoutingOverrides &
    PublishesEsql &
    // Lens specific API methods:
    // Let the container know when the data has been loaded/updated
    LensInspectorAdapters &
    LensRequestHandlersProps &
    LensApiCallbacks &
    LensHasEditPanel &
    LegacyLensStateApi &
    SupportsJsonExport &
    CanCancelRequests
>;

/**
 * Backward compatibility types
 */
export type LensEmbeddableOutput = LensApi;
