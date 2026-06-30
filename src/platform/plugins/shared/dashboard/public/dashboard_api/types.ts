/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SearchSessionInfoProvider } from '@kbn/data-plugin/public';
import type { DefaultEmbeddableApi, EmbeddablePackageState } from '@kbn/embeddable-plugin/public';
import type { Filter, ProjectRouting, Query, TimeRange } from '@kbn/es-query';
import type { ESQLControlVariable, PublishesESQLVariables } from '@kbn/esql-types';
import type { GridLayoutData } from '@kbn/grid-layout';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type {
  CanExpandPanels,
  CanIndicateRelatedChildren,
  CanPinPanels,
  HasLastSavedChildState,
  HasSections,
  HasSerializedChildState,
  PresentationContainer,
  PublishesSettings,
  TrackContentfulRender,
  EmbeddableAppContext,
  HasAppContext,
  HasExecutionContext,
  HasType,
  HasUniqueId,
  PublishesDataLoading,
  PublishesDataViews,
  PublishesDescription,
  PublishesEditablePauseFetch,
  PublishesHideBorder,
  PublishesSavedObjectId,
  PublishesTitle,
  PublishesUnifiedSearch,
  PublishesProjectRouting,
  PublishesApproximation,
  PublishesViewMode,
  PublishesWritableViewMode,
  PublishingSubject,
  ViewMode,
  PublishesSearchSession,
  PublishesReload,
} from '@kbn/presentation-publishing';
import { type TracksOverlays } from '@kbn/presentation-util';
import type { TimeSlice } from '@kbn/controls-schemas';
import type { LocatorPublic } from '@kbn/share-plugin/common';
import type { BehaviorSubject, Observable, Subject } from 'rxjs';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { Reference } from '@kbn/content-management-utils';
import type { DashboardLocatorParams } from '../../common';
import type { DashboardState, GridData } from '../../server';
import type { SaveDashboardReturn } from './save_modal/types';
import type { DashboardLayout } from './layout_manager/types';
import type { DashboardSettings } from './settings_manager';
import type { ReadBodyWithResolve } from '../dashboard_client/dashboard_client';

/** The type identifier for dashboard APIs. */
export const DASHBOARD_API_TYPE = 'dashboard';

/**
 * Interface for APIs that publish save events.
 */
export interface DashboardSaveEvent {
  previousDashboardId?: string;
  dashboardId?: string;
  dashboardState: DashboardState;
}

export interface PublishesOnSave {
  /** Observable that emits when a save operation completes successfully. */
  onSave$: Observable<DashboardSaveEvent>;
}

export const ReservedLayoutItemTypes: readonly string[] = ['section'] as const;

export type DashboardInitializationState = Partial<
  DashboardState & { references?: Reference[]; viewMode?: ViewMode }
>;

/**
 * Options for creating a dashboard.
 * These options control how the dashboard is initialized and integrates with various Kibana features.
 */
export interface DashboardCreationOptions {
  /**
   * Returns a partial initial dashboard state and view mode. Keys provided here
   * will act as overrides that replace all other sources of state for that key
   * e.g. default state, saved object state, session backup state.
   */
  getInitialInput?: () => DashboardInitializationState;

  /** Returns embeddables to add to the dashboard on load. */
  getIncomingEmbeddables?: () => EmbeddablePackageState[] | undefined;

  /** Whether to enable search sessions integration. */
  useSearchSessionsIntegration?: boolean;
  /** Settings for search session integration. */
  searchSessionSettings?: {
    sessionIdToRestore?: string;
    sessionIdUrlChangeObservable?: Observable<string | undefined>;
    getSearchSessionIdFromURL: () => string | undefined;
    removeSessionIdFromUrl: () => void;
    createSessionRestorationDataProvider: (
      dashboardApi: DashboardApi,
      dashboardInternalApi: DashboardInternalApi
    ) => SearchSessionInfoProvider;
  };

  /** Whether to enable session storage integration. */
  useSessionStorageIntegration?: boolean;

  /** Whether to enable unified search integration. */
  useUnifiedSearchIntegration?: boolean;
  /** Settings for unified search integration. */
  unifiedSearchSettings?: { kbnUrlStateStorage: IKbnUrlStateStorage };

  /** Whether to render the control group above the dashboard viewport. */
  useControlsIntegration?: boolean;

  /**
   * Validates a loaded saved object and determines whether it is valid.
   *
   * @param result - The loaded dashboard response body.
   * @returns The validation result: 'valid', 'invalid', or 'redirected'.
   */
  validateLoadedSavedObject?: (result: ReadBodyWithResolve) => 'valid' | 'invalid' | 'redirected';

  /** Whether to start the dashboard in full screen mode. */
  fullScreenMode?: boolean;
  /** Whether the dashboard is embedded externally (outside Kibana). */
  isEmbeddedExternally?: boolean;

  /**
   * Returns the embeddable app context for the dashboard.
   *
   * @param dashboardId - The optional dashboard ID.
   * @returns The {@link EmbeddableAppContext} for the dashboard.
   */
  getEmbeddableAppContext?: (dashboardId?: string) => EmbeddableAppContext;
}

/**
 * The public API for interacting with a dashboard.
 * This type combines multiple capability interfaces to provide full dashboard functionality.
 */
export type DashboardApi = CanExpandPanels &
  CanIndicateRelatedChildren &
  CanPinPanels &
  HasSections &
  HasAppContext &
  HasExecutionContext &
  HasLastSavedChildState &
  HasSerializedChildState &
  HasType<typeof DASHBOARD_API_TYPE> &
  HasUniqueId &
  PresentationContainer &
  PublishesDataLoading &
  PublishesDataViews &
  PublishesDescription &
  PublishesHideBorder &
  Pick<PublishesTitle, 'title$' | 'hideTitle$'> &
  PublishesReload &
  PublishesSavedObjectId &
  PublishesESQLVariables &
  PublishesSearchSession &
  PublishesSettings &
  PublishesUnifiedSearch &
  PublishesProjectRouting &
  PublishesApproximation &
  PublishesViewMode &
  PublishesWritableViewMode &
  PublishesEditablePauseFetch &
  TrackContentfulRender &
  TracksOverlays &
  PublishesOnSave & {
    /*
     * Emits on any dashboard state change
     *
     * Recommend to debounce when subscribing
     */
    anyStateChange$: Observable<void>;
    asyncResetToLastSavedState: () => Promise<void>;
    fullScreenMode$: PublishingSubject<boolean>;
    focusedPanelId$: PublishingSubject<string | undefined>;
    setFocusedPanelId: (id: string | undefined) => void;
    forceRefresh: () => void;
    getSettings: () => DashboardSettings;
    getSerializedState: () => {
      attributes: DashboardState;
    };
    getDashboardPanelFromId: (id: string) => {
      type: string;
      grid?: GridData;
      serializedState: object;
    };
    hasOverlays$: PublishingSubject<boolean>;
    hasUnsavedChanges$: PublishingSubject<boolean>;
    highlightPanel: (panelRef: HTMLDivElement) => void;
    highlightPanelId$: PublishingSubject<string | undefined>;
    blurredPanelIds$: PublishingSubject<string[]>;
    isEmbeddedExternally: boolean;
    isEditableByUser: boolean;
    isManaged: boolean;
    locator?: Pick<LocatorPublic<DashboardLocatorParams>, 'navigate' | 'getRedirectUrl'>;
    runInteractiveSave: () => Promise<SaveDashboardReturn | undefined>;
    runQuickSave: () => Promise<void>;
    scrollToPanel: (panelRef: HTMLDivElement) => void;
    scrollToPanelId$: PublishingSubject<string | undefined>;
    scrollToTop: () => void;
    scrollToBottom: () => void;
    scrollToBottom$: Subject<void>;
    setFilters: (filters?: Filter[] | undefined) => void;
    setFullScreenMode: (fullScreenMode: boolean) => void;
    setHighlightPanelId: (id: string | undefined) => void;
    setQuery: (query?: Query | undefined) => void;
    setProjectRouting: (projectRouting?: ProjectRouting) => void;
    setUseApproximation: (useApproximation: boolean) => void;
    setScrollToPanelId: (id: string | undefined) => void;
    setSettings: (settings: DashboardSettings) => void;
    setTags: (tags: string[]) => void;
    setTimeRange: (timeRange?: TimeRange | undefined) => void;
    setState: (state: DashboardState) => void;

    publishedChildFilters$: PublishingSubject<Filter[] | undefined>;
    unpublishedChildFilters$: PublishingSubject<Filter[] | undefined>;
    publishFilters: () => void;

    publishedTimeslice$: PublishingSubject<TimeSlice | undefined>;
    unpublishedTimeslice$: PublishingSubject<TimeSlice | undefined>;
    publishTimeslice: () => void;

    layout$: BehaviorSubject<DashboardLayout>;

    registerChildApi: (api: DefaultEmbeddableApi) => void;

    accessControl$: PublishingSubject<Partial<SavedObjectAccessControl>>;
    changeAccessMode: (accessMode: SavedObjectAccessControl['accessMode']) => Promise<void>;
    createdBy?: string;
    user?: DashboardUser;
    userActivity$: Subject<UserActivity>;
    isAccessControlEnabled?: boolean;

    addIncomingEmbeddables: (embeddables?: EmbeddablePackageState[]) => void;
  };

type ActivityType = 'view' | 'refresh';
export type UserActivity =
  | { type: ActivityType; start: number; end?: undefined }
  | { type: ActivityType; start?: undefined; end: number };

export interface DashboardInternalApi {
  gridLayout$: BehaviorSubject<GridLayoutData>;
  serializeLayout: () => Pick<DashboardState, 'panels' | 'pinned_panels'>;
  isSectionCollapsed: (sectionId?: string) => boolean;
  dashboardContainerRef$: BehaviorSubject<HTMLElement | null>;
  setDashboardContainerRef: (ref: HTMLElement | null) => void;
  publishedEsqlVariables$: PublishingSubject<ESQLControlVariable[]>;
  unpublishedEsqlVariables$: PublishingSubject<ESQLControlVariable[]>;
  publishVariables: () => void;
}

export interface DashboardUser {
  uid: string;
  hasGlobalAccessControlPrivilege: boolean;
}
