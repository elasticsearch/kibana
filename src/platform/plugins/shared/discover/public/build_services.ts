/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { History } from 'history';
import type {
  Capabilities,
  ChromeStart,
  CoreStart,
  DocLinksStart,
  ToastsStart,
  I18nStart,
  IUiSettingsClient,
  PluginInitializerContext,
  HttpStart,
  NotificationsStart,
  ApplicationStart,
  AnalyticsServiceStart,
  AppMountParameters,
  ScopedHistory,
  ThemeServiceStart,
  UserProfileService,
} from '@kbn/core/public';
import type { Logger } from '@kbn/logging';
import type {
  FilterManager,
  TimefilterContract,
  DataPublicPluginStart,
} from '@kbn/data-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { Start as InspectorPublicPluginStart } from '@kbn/inspector-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { UiCounterMetricType } from '@kbn/analytics';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import type { UrlForwardingStart } from '@kbn/url-forwarding-plugin/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import type { IndexPatternFieldEditorStart } from '@kbn/data-view-field-editor-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SavedSearchPublicPluginStart } from '@kbn/saved-search-plugin/public';
import type { SpacesApi } from '@kbn/spaces-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { TriggersAndActionsUIPublicPluginStart } from '@kbn/triggers-actions-ui-plugin/public';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { ContentClient } from '@kbn/content-management-plugin/public';
import type { ObservabilityAIAssistantPublicStart } from '@kbn/observability-ai-assistant-plugin/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import { noop } from 'lodash';
import type { NoDataPagePluginStart } from '@kbn/no-data-page-plugin/public';
import type { AiopsPluginStart } from '@kbn/aiops-plugin/public';
import type { DataVisualizerPluginStart } from '@kbn/data-visualizer-plugin/public';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { LogsDataAccessPluginStart } from '@kbn/logs-data-access-plugin/public';
import type { DiscoverSharedPublicStart } from '@kbn/discover-shared-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { AlertingV2PublicStart } from '@kbn/alerting-v2-plugin/public';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { DiscoverStartPlugins } from './types';
import type { DiscoverContextAppLocator } from './application/context/services/locator';
import type { DiscoverSingleDocLocator } from './application/doc/locator';
import type { DiscoverAppLocator } from '../common';
import { type ProfilesManager, ProfileStateRegistry } from './context_awareness';
import type { DiscoverEBTManager } from './ebt_manager';
import {
  CASCADE_LAYOUT_ENABLED_FEATURE_FLAG_KEY,
  EMBEDDABLE_TRANSFORMS_FEATURE_FLAG_KEY,
  IS_ESQL_DEFAULT_FEATURE_FLAG_KEY,
} from './constants';
import { EmbeddableEditorService } from './plugin_imports/embeddable_editor_service';

/**
 * Location state of internal Discover history instance
 */
export interface HistoryLocationState {
  referrer: string;
}

export interface UrlTracker {
  setTrackedUrl: (url: string) => void;
  restorePreviousUrl: () => void;
  setTrackingEnabled: (value: boolean) => void;
}

export interface DiscoverFeatureFlags {
  getCascadeLayoutEnabled: () => boolean;
  getIsEsqlDefault: () => boolean;
  getEmbeddableTransformsEnabled: () => boolean;
}

export interface DiscoverServices {
  agentBuilder?: AgentBuilderPluginStart;
  aiops?: AiopsPluginStart;
  alertingVTwo?: AlertingV2PublicStart;
  application: ApplicationStart;
  addBasePath: (path: string) => string;
  analytics: AnalyticsServiceStart;
  i18n: I18nStart;
  capabilities: Capabilities;
  chrome: ChromeStart;
  contentManagement: ContentManagementPublicStart;
  core: CoreStart;
  data: DataPublicPluginStart;
  discoverShared: DiscoverSharedPublicStart;
  discoverFeatureFlags: DiscoverFeatureFlags;
  docLinks: DocLinksStart;
  embeddable: EmbeddableStart;
  history: History<HistoryLocationState>;
  getScopedHistory: <T>() => ScopedHistory<T | undefined> | undefined;
  setHeaderActionMenu: AppMountParameters['setHeaderActionMenu'];
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
  filterManager: FilterManager;
  fieldFormats: FieldFormatsStart;
  dataViews: DataViewsContract;
  inspector: InspectorPublicPluginStart;
  metadata: { branch: string; version: string };
  navigation: NavigationPublicPluginStart;
  share?: SharePluginStart;
  urlForwarding: UrlForwardingStart;
  urlTracker: UrlTracker;
  timefilter: TimefilterContract;
  toastNotifications: ToastsStart;
  notifications: NotificationsStart;
  uiSettings: IUiSettingsClient;
  settings: SettingsStart;
  trackUiMetric?: (metricType: UiCounterMetricType, eventName: string | string[]) => void;
  dataViewFieldEditor: IndexPatternFieldEditorStart;
  dataViewEditor: DataViewEditorStart;
  dataVisualizer?: DataVisualizerPluginStart;
  http: HttpStart;
  storage: Storage;
  spaces?: SpacesApi;
  triggersActionsUi: TriggersAndActionsUIPublicPluginStart;
  locator: DiscoverAppLocator;
  contextLocator: DiscoverContextAppLocator;
  singleDocLocator: DiscoverSingleDocLocator;
  expressions: ExpressionsStart;
  charts: ChartsPluginStart;
  savedObjectsManagement: SavedObjectsManagementPluginStart;
  savedObjectsTagging?: SavedObjectsTaggingApi;
  savedSearch: SavedSearchPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  lens: LensPublicStart;
  uiActions: UiActionsStart;
  contentClient: ContentClient;
  noDataPage?: NoDataPagePluginStart;
  observabilityAIAssistant?: ObservabilityAIAssistantPublicStart;
  profilesManager: ProfilesManager;
  profileStateRegistry: ProfileStateRegistry;
  ebtManager: DiscoverEBTManager;
  fieldsMetadata?: FieldsMetadataPublicStart;
  logsDataAccess?: LogsDataAccessPluginStart;
  cps?: CPSPluginStart;
  embeddableEditor: EmbeddableEditorService;
  logger: Logger;
}

export const buildServices = ({
  core,
  plugins,
  context,
  locator,
  contextLocator,
  singleDocLocator,
  history,
  scopedHistory,
  urlTracker,
  profilesManager,
  ebtManager,
  setHeaderActionMenu = noop,
}: {
  core: CoreStart;
  plugins: DiscoverStartPlugins;
  context: PluginInitializerContext;
  locator: DiscoverAppLocator;
  contextLocator: DiscoverContextAppLocator;
  singleDocLocator: DiscoverSingleDocLocator;
  history: History<HistoryLocationState>;
  scopedHistory?: ScopedHistory;
  urlTracker: UrlTracker;
  profilesManager: ProfilesManager;
  ebtManager: DiscoverEBTManager;
  setHeaderActionMenu?: AppMountParameters['setHeaderActionMenu'];
}): DiscoverServices => {
  const { usageCollection } = plugins;
  const storage = new Storage(localStorage);

  return {
    agentBuilder: plugins.agentBuilder,
    aiops: plugins.aiops,
    alertingVTwo: plugins.alertingVTwo,
    application: core.application,
    addBasePath: core.http.basePath.prepend,
    analytics: core.analytics,
    capabilities: core.application.capabilities,
    contentManagement: plugins.contentManagement,
    chrome: core.chrome,
    core,
    data: plugins.data,
    dataVisualizer: plugins.dataVisualizer,
    discoverShared: plugins.discoverShared,
    discoverFeatureFlags: {
      getCascadeLayoutEnabled: () =>
        core.featureFlags.getBooleanValue(CASCADE_LAYOUT_ENABLED_FEATURE_FLAG_KEY, true),
      getIsEsqlDefault: () =>
        core.featureFlags.getBooleanValue(IS_ESQL_DEFAULT_FEATURE_FLAG_KEY, false),
      getEmbeddableTransformsEnabled: () =>
        core.featureFlags.getBooleanValue(EMBEDDABLE_TRANSFORMS_FEATURE_FLAG_KEY, true),
    },
    docLinks: core.docLinks,
    embeddable: plugins.embeddable,
    i18n: core.i18n,
    theme: core.theme,
    userProfile: core.userProfile,
    fieldFormats: plugins.fieldFormats,
    filterManager: plugins.data.query.filterManager,
    history,
    getScopedHistory: <T>() => scopedHistory as ScopedHistory<T | undefined>,
    setHeaderActionMenu,
    dataViews: plugins.data.dataViews,
    inspector: plugins.inspector,
    metadata: {
      branch: context.env.packageInfo.branch,
      version: context.env.packageInfo.version,
    },
    navigation: plugins.navigation,
    share: plugins.share,
    urlForwarding: plugins.urlForwarding,
    urlTracker,
    timefilter: plugins.data.query.timefilter.timefilter,
    toastNotifications: core.notifications.toasts,
    notifications: core.notifications,
    uiSettings: core.uiSettings,
    settings: core.settings,
    storage,
    trackUiMetric: usageCollection?.reportUiCounter.bind(usageCollection, 'discover'),
    dataViewFieldEditor: plugins.dataViewFieldEditor,
    http: core.http,
    spaces: plugins.spaces,
    dataViewEditor: plugins.dataViewEditor,
    triggersActionsUi: plugins.triggersActionsUi,
    locator,
    contextLocator,
    singleDocLocator,
    expressions: plugins.expressions,
    charts: plugins.charts,
    savedObjectsTagging: plugins.savedObjectsTaggingOss?.getTaggingApi(),
    savedObjectsManagement: plugins.savedObjectsManagement,
    savedSearch: plugins.savedSearch,
    unifiedSearch: plugins.unifiedSearch,
    lens: plugins.lens,
    uiActions: plugins.uiActions,
    contentClient: plugins.contentManagement.client,
    noDataPage: plugins.noDataPage,
    observabilityAIAssistant: plugins.observabilityAIAssistant,
    profilesManager,
    profileStateRegistry: new ProfileStateRegistry(),
    ebtManager,
    fieldsMetadata: plugins.fieldsMetadata,
    logsDataAccess: plugins.logsDataAccess,
    cps: plugins.cps,
    embeddableEditor: new EmbeddableEditorService(
      plugins.embeddable.getStateTransfer(),
      core.application
    ),
    logger: context.logger.get(),
  };
};
