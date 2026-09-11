/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import type { AggregateQuery, Query, TimeRange } from '@kbn/es-query';
import type { DataTableRecord, DataTableColumnsMeta } from '@kbn/discover-utils/types';
import type { EbtClickAttrs } from '@kbn/ebt-click';
import type { SerializableRecord } from '@kbn/utility-types';
import type { ZodTypeAny } from '@kbn/zod';
import type { ReactElement } from 'react';
import type { DocViewsRegistry } from './doc_views_registry';

/**
 * Represents the restorable state for all doc viewer tabs, keyed by tab ID.
 * Each tab can store its own state as needed.
 */
export type DocViewerTabsState = Record<string, unknown>;

export interface DocViewerRestorableState {
  /**
   * Represents the restorable state for all doc viewer tabs, keyed by tab ID.
   * Each tab can store its own state as needed.
   */
  docViewerTabsState?: DocViewerTabsState;
  /**
   * Used to dedupe initial `unified_doc_viewer_viewed` event when restoring state.
   */
  initialDocViewerViewedEventKey?: string;
}

/**
 * The URL-shareable subset of the doc viewer's state. It is a projection of the (larger)
 * {@link DocViewerRestorableState}: only tabs that declare a `shareableStateSchema` contribute, and
 * only the fields that schema allows.
 */
export interface DocViewerShareableState extends SerializableRecord {
  /** The selected doc viewer tab id. */
  selectedTabId?: string;
  /**
   * Per-tab shareable slices keyed by doc view id, each projected through that tab's
   * `shareableStateSchema`.
   */
  tabsState?: SerializableRecord;
}

export interface FieldMapping {
  filterable?: boolean;
  scripted?: boolean;
  rowCount?: number;
  type: string;
  esTypes?: string[];
  name: string;
  displayName?: string;
}

export type DocViewFilterFn = (
  mapping: FieldMapping | string | undefined,
  value: unknown,
  mode: '+' | '-'
) => void;

export interface DocViewActions {
  openInNewTab?: (params: {
    query?: Query | AggregateQuery;
    tabLabel?: string;
    timeRange?: TimeRange;
  }) => void;
  updateESQLQuery?: (queryOrUpdater: string | ((prevQuery: string) => string)) => void;
}

export interface DocViewRenderProps {
  hit: DataTableRecord;
  dataView: DataView;
  columns?: string[];
  /**
   * If not provided, types will be derived by default from the dataView field types.
   * For displaying text-based search results, define column types (which are available separately in the fetch request) here.
   */
  columnsMeta?: DataTableColumnsMeta;
  textBasedHits?: DataTableRecord[];
  hideActionsColumn?: boolean;
  filter?: DocViewFilterFn;
  onAddColumn?: (columnName: string) => void;
  onRemoveColumn?: (columnName: string) => void;
  docViewsRegistry?: DocViewsRegistry | ((prevRegistry: DocViewsRegistry) => DocViewsRegistry);
  decreaseAvailableHeightBy?: number;
  hideFilteringOnComputedColumns?: boolean;
}

export type DocViewerComponent = React.FC<DocViewRenderProps>;

/**
 * Props a doc view uses to participate in the doc viewer's restorable/shareable state channel: seed
 * from `initialState` on mount, and report changes via `onInitialStateChange`. Provider-agnostic —
 * a tab may satisfy it with `withRestorableState` / `useRestorableState` from `@kbn/restorable-state`
 * (the convenient default), or wire the props itself; it does not have to depend on that package.
 */
export interface DocViewRestorableStateProps<TState extends object = object> {
  /** State to seed the tab with on mount, from local restore or a shared-link deep link. */
  initialState?: Partial<TState>;
  /** Reports the tab's current state so the host can persist it (locally and/or in the URL). */
  onInitialStateChange?: (state: Partial<TState>) => void;
}

export type DocViewRenderFunction<TState extends object = object> = (
  props: DocViewRenderProps & DocViewRestorableStateProps<TState>
) => ReactElement;

export interface DocView<TState extends object = object> {
  id: string;
  order: number;
  title: string;
  enabled?: boolean;
  /** Optional element rendered before the tab title (e.g. a technical preview badge). */
  prepend?: ReactElement;
  /**
   * Optional EBT click attributes (`data-ebt-*`) for the rendered tab button.
   * Every tab gets auto-generated attributes (`data-ebt-action` derived from the
   * tab id, e.g. `doc_view_table` -> `viewTable`); set this field only to
   * override them (e.g. to share an action name with equivalent tabs on other
   * surfaces).
   */
  ebt?: EbtClickAttrs;
  /**
   * Optional schema describing the URL-shareable subset of this tab's state. When set, the doc viewer
   * projects the tab's reported state through it for deep links and validates restored values against
   * it. Keep the schema bounded (e.g. `.max()` on strings/arrays) and evolve it additively so that
   * older shared links degrade gracefully rather than breaking.
   */
  shareableStateSchema?: ZodTypeAny;
  render: DocViewRenderFunction<TState>;
}
