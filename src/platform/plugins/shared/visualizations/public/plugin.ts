/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { filter, map, combineLatest, type Subscription } from 'rxjs';
import { createHashHistory } from 'history';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type { Reference } from '@kbn/content-management-utils';

import {
  createKbnUrlStateStorage,
  createKbnUrlTracker,
  createStartServicesGetter,
  Storage,
  withNotifyOnErrors,
} from '@kbn/kibana-utils-plugin/public';
import { replaceUrlHashQuery } from '@kbn/kibana-utils-plugin/common';

import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';

import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  ApplicationStart,
  AppMountParameters,
  AppUpdater,
  ScopedHistory,
  AppDeepLinkLocations,
} from '@kbn/core/public';
import type { UiActionsStart, UiActionsSetup } from '@kbn/ui-actions-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type {
  Setup as InspectorSetup,
  Start as InspectorStart,
} from '@kbn/inspector-plugin/public';
import type { UsageCollectionStart } from '@kbn/usage-collection-plugin/public';
import type { DataPublicPluginSetup, DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { ExpressionsSetup, ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { EmbeddableSetup, EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SavedObjectTaggingOssPluginStart } from '@kbn/saved-objects-tagging-oss-plugin/public';
import type { NavigationPublicPluginStart as NavigationStart } from '@kbn/navigation-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { UrlForwardingSetup, UrlForwardingStart } from '@kbn/url-forwarding-plugin/public';
import type { PresentationUtilPluginStart } from '@kbn/presentation-util-plugin/public';
import type { ScreenshotModePluginStart } from '@kbn/screenshot-mode-plugin/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { DataViewEditorStart } from '@kbn/data-view-editor-plugin/public';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import type { SavedSearchPublicPluginStart } from '@kbn/saved-search-plugin/public';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type {
  ContentManagementPublicSetup,
  ContentManagementPublicStart,
} from '@kbn/content-management-plugin/public';
import type { NoDataPagePluginStart } from '@kbn/no-data-page-plugin/public';

import { css, injectGlobal } from '@emotion/css';
import {
  VisualizeConstants,
  VISUALIZE_EMBEDDABLE_TYPE,
  VISUALIZE_SAVED_OBJECT_TYPE,
} from '@kbn/visualizations-common';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { DrilldownTransforms } from '@kbn/embeddable-plugin/common';
import { ProjectRoutingAccess } from '@kbn/cps-utils';
import type { TypesSetup, TypesStart } from './vis_types';
import type { VisualizeServices } from './visualize_app/types';
import type { VisEditorsRegistry } from './vis_editors_registry';
import { createVisEditorsRegistry } from './vis_editors_registry';
import { showNewVisModal } from './wizard';
import { findListItems } from './utils/saved_visualize_utils';
import { VisualizeLocatorDefinition } from '../common/locator';
import { xyDimension as xyDimensionExpressionFunction } from '../common/expression_functions/xy_dimension';
import { visDimension as visDimensionExpressionFunction } from '../common/expression_functions/vis_dimension';
import { range as rangeExpressionFunction } from '../common/expression_functions/range';
import { TypesService } from './vis_types/types_service';
import {
  setUISettings,
  setTypes,
  setApplication,
  setCapabilities,
  setHttp,
  setSearch,
  setExpressions,
  setUiActions,
  setTimeFilter,
  setAggs,
  setChrome,
  setOverlays,
  setEmbeddable,
  setDocLinks,
  setSpaces,
  setAnalytics,
  setI18n,
  setTheme,
  setUserProfile,
  setExecutionContext,
  setFieldFormats,
  setSavedObjectTagging,
  setUsageCollection,
  setSavedObjectsManagement,
  setContentManagement,
  setSavedSearch,
  setDataViews,
  setInspector,
  setNotifications,
  getTypes,
} from './services';
import type { ListingViewRegistry } from './types';
import type { VisualizationSavedObjectAttributes } from '../common/content_management';
import { LATEST_VERSION, CONTENT_ID } from '../common/content_management';
import { registerActions } from './actions/register_actions';
import type { VisualizeByReferenceState } from '../common/embeddable/types';
import { VegaIcon } from './components/vega_icon';
import { updateBasicSoAttributes } from './utils/saved_objects_utils/update_basic_attributes';

/**
 * Interface for this plugin's returned setup/start contracts.
 *
 * @public
 */

export type VisualizationsSetup = TypesSetup & {
  visEditorsRegistry: VisEditorsRegistry;
  listingViewRegistry: ListingViewRegistry;
};
export interface VisualizationsStart extends TypesStart {
  showNewVisModal: typeof showNewVisModal;
  findListItems: (
    search: string,
    size: number,
    references?: Reference[],
    referencesToExclude?: Reference[]
  ) => ReturnType<typeof findListItems>;
  updateVisualizationLibraryItem: (
    id: string,
    type: string,
    newAttributes: {
      title: string;
      description: string;
    }
  ) => ReturnType<typeof updateBasicSoAttributes>;
}

export interface VisualizationsSetupDeps {
  data: DataPublicPluginSetup;
  embeddable: EmbeddableSetup;
  expressions: ExpressionsSetup;
  inspector: InspectorSetup;
  uiActions: UiActionsSetup;
  urlForwarding: UrlForwardingSetup;
  home?: HomePublicPluginSetup;
  share?: SharePluginSetup;
  contentManagement: ContentManagementPublicSetup;
}

export interface VisualizationsStartDeps {
  data: DataPublicPluginStart;
  dataViews: DataViewsPublicPluginStart;
  dataViewEditor: DataViewEditorStart;
  expressions: ExpressionsStart;
  embeddable: EmbeddableStart;
  inspector: InspectorStart;
  uiActions: UiActionsStart;
  application: ApplicationStart;
  navigation: NavigationStart;
  presentationUtil: PresentationUtilPluginStart;
  savedSearch: SavedSearchPublicPluginStart;
  cps?: CPSPluginStart;
  spaces?: SpacesPluginStart;
  savedObjectsTaggingOss?: SavedObjectTaggingOssPluginStart;
  share?: SharePluginStart;
  urlForwarding: UrlForwardingStart;
  screenshotMode: ScreenshotModePluginStart;
  fieldFormats: FieldFormatsStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  kql: KqlPluginStart;
  usageCollection: UsageCollectionStart;
  savedObjectsManagement: SavedObjectsManagementPluginStart;
  contentManagement: ContentManagementPublicStart;
  serverless?: ServerlessPluginStart;
  noDataPage?: NoDataPagePluginStart;
}

const styles = {
  visAppWrapper: css({
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  }),
  globalScreenshotMode: css`
    kbn-top-nav,
    filter-bar,
    .kbnTopNavMenu__wrapper,
    ::-webkit-scrollbar,
    .euiNavDrawer {
      display: none !important;
    }
  `,
  visEditorScreenshotMode: css`
    /* hide unusable controls !important is required to override resizable panel inline display */
    .visEditor__content .visEditor--default > :not(.visEditor__visualization__wrapper) {
      display: none !important;
    }

    /** THIS IS FOR TSVB UNTIL REFACTOR **/
    .tvbEditorVisualization {
      position: static !important;
    }
    .visualize .tvbVisTimeSeries__legendToggle {
      /* all non-content rows in interface */
      display: none;
    }

    .tvbEditor--hideForReporting {
      /* all non-content rows in interface */
      display: none;
    }
    /**  END TSVB BAD BAD HACKS **/

    /* remove left padding from visualizations so that map lines up with .leaflet-container and
    *  setting the position to be fixed and to take up the entire screen, because some zoom levels/viewports
    *  are triggering the media breakpoints that cause the .visEditor__canvas to take up more room than the viewport */

    .visEditor .visEditor__canvas {
      padding-left: 0;
      position: fixed;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }

    /** Visualization tweaks */

    /* hide unusable controls */
    .visualize .visLegend__toggle,
    .visualize .kbnAggTable__controls,
    .visualize .leaflet-container .leaflet-top.leaflet-left,
    .visualize paginate-controls /* page numbers */ {
      display: none;
    }

    /* Ensure the min-height of the small breakpoint isn't used */
    .vis-editor visualization {
      min-height: 0 !important;
    }
  `,
};

/**
 * Visualizations Plugin - public
 *
 * This plugin's stateful contracts are returned from the `setup` and `start` methods
 * below. The interfaces for these contracts are provided above.
 *
 * @internal
 */
export class VisualizationsPlugin
  implements
    Plugin<
      VisualizationsSetup,
      VisualizationsStart,
      VisualizationsSetupDeps,
      VisualizationsStartDeps
    >
{
  private readonly types: TypesService = new TypesService();
  private appStateSubscription?: Subscription;
  private urlUpdater = new BehaviorSubject<AppUpdater>(() => ({}));
  private visibilityUpdater = new BehaviorSubject<AppUpdater>(() => ({}));
  private appStateUpdater = new BehaviorSubject<AppUpdater>(() => ({}));
  private stopUrlTracking: (() => void) | undefined = undefined;
  private currentHistory: ScopedHistory | undefined = undefined;
  private isLinkedToOriginatingApp: (() => boolean) | undefined = undefined;

  constructor(private initializerContext: PluginInitializerContext) {}

  public setup(
    core: CoreSetup<VisualizationsStartDeps, VisualizationsStart>,
    {
      expressions,
      embeddable,
      data,
      home,
      urlForwarding,
      share,
      uiActions,
      contentManagement,
    }: VisualizationsSetupDeps
  ): VisualizationsSetup {
    const {
      appMounted,
      appUnMounted,
      stop: stopUrlTracker,
      setActiveUrl,
      restorePreviousUrl,
    } = createKbnUrlTracker({
      baseUrl: core.http.basePath.prepend(VisualizeConstants.VISUALIZE_BASE_PATH),
      defaultSubUrl: '#/',
      storageKey: `lastUrl:${core.http.basePath.get()}:visualize`,
      navLinkUpdater$: this.urlUpdater,
      toastNotifications: core.notifications.toasts,
      stateParams: [
        {
          kbnUrlKey: '_g',
          stateUpdate$: data.query.state$.pipe(
            filter(
              ({ changes }) => !!(changes.globalFilters || changes.time || changes.refreshInterval)
            ),
            map(({ state }) => ({
              ...state,
              filters: data.query.filterManager.getGlobalFilters(),
            }))
          ),
        },
      ],
      getHistory: () => this.currentHistory!,
      onBeforeNavLinkSaved: (urlToSave: string) => {
        if (this.isLinkedToOriginatingApp?.()) {
          return core.http.basePath.prepend(VisualizeConstants.VISUALIZE_BASE_PATH);
        }
        const tableListUrlState = ['s', 'title', 'sort', 'sortdir'];
        return replaceUrlHashQuery(urlToSave, (query) => {
          tableListUrlState.forEach((param) => {
            delete query[param];
          });
          return query;
        });
      },
    });
    this.stopUrlTracking = () => {
      stopUrlTracker();
    };

    this.appStateSubscription = combineLatest([this.urlUpdater, this.visibilityUpdater]).subscribe(
      ([urlUpdater, visibilityUpdater]) => {
        this.appStateUpdater.next((app) => ({
          ...urlUpdater(app),
          ...visibilityUpdater(app),
        }));
      }
    );

    const start = createStartServicesGetter(core.getStartServices);
    const listingViewRegistry: ListingViewRegistry = new Set();
    const visEditorsRegistry = createVisEditorsRegistry();

    core.application.register({
      id: VisualizeConstants.APP_ID,
      title: 'Visualize library',
      order: 8000,
      euiIconType: 'logoKibana',
      defaultPath: '#/',
      category: DEFAULT_APP_CATEGORIES.kibana,
      updater$: this.appStateUpdater.asObservable(),
      // remove all references to visualize
      mount: async (params: AppMountParameters) => {
        const [coreStart, pluginsStart] = await core.getStartServices();
        this.currentHistory = params.history;

        // allows the urlTracker to only save URLs that are not linked to an originatingApp
        this.isLinkedToOriginatingApp = () => {
          return Boolean(
            pluginsStart.embeddable
              .getStateTransfer()
              .getIncomingEditorState(VisualizeConstants.APP_ID)?.originatingApp
          );
        };

        // make sure the index pattern list is up to date
        pluginsStart.dataViews.clearCache();

        appMounted();

        // dispatch synthetic hash change event to update hash history objects
        // this is necessary because hash updates triggered by using popState won't trigger this event naturally.
        const unlistenParentHistory = params.history.listen(() => {
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        /**
         * current implementation uses 2 history objects:
         * 1. the hash history (used for the react hash router)
         * 2. and the scoped history (used for url tracking)
         * this should be replaced to use only scoped history after moving legacy apps to browser routing
         */
        const history = createHashHistory();
        const [{ createVisEmbeddableFromObject }, { renderApp }] = await Promise.all([
          import('./legacy/embeddable'),
          import('./visualize_app'),
        ]);
        const services: VisualizeServices = {
          ...coreStart,
          history,
          kbnUrlStateStorage: createKbnUrlStateStorage({
            history,
            useHash: coreStart.uiSettings.get('state:storeInSessionStorage'),
            ...withNotifyOnErrors(coreStart.notifications.toasts),
          }),
          urlForwarding: pluginsStart.urlForwarding,
          pluginInitializerContext: this.initializerContext,
          chrome: coreStart.chrome,
          data: pluginsStart.data,
          core: coreStart,
          dataViewEditor: pluginsStart.dataViewEditor,
          dataViews: pluginsStart.dataViews,
          localStorage: new Storage(localStorage),
          navigation: pluginsStart.navigation,
          share: pluginsStart.share,
          toastNotifications: coreStart.notifications.toasts,
          visualizeCapabilities: coreStart.application.capabilities.visualize_v2,
          dashboardCapabilities: coreStart.application.capabilities.dashboard_v2,
          embeddable: pluginsStart.embeddable,
          stateTransferService: pluginsStart.embeddable.getStateTransfer(),
          setActiveUrl,
          /** @deprecated */
          createVisEmbeddableFromObject: createVisEmbeddableFromObject({ start }),
          scopedHistory: params.history,
          restorePreviousUrl,
          setHeaderActionMenu: params.setHeaderActionMenu,
          savedObjectsTagging: pluginsStart.savedObjectsTaggingOss?.getTaggingApi(),
          savedSearch: pluginsStart.savedSearch,
          presentationUtil: pluginsStart.presentationUtil,
          getKibanaVersion: () => this.initializerContext.env.packageInfo.version,
          spaces: pluginsStart.spaces,
          visEditorsRegistry,
          listingViewRegistry,
          unifiedSearch: pluginsStart.unifiedSearch,
          kql: pluginsStart.kql,
          serverless: pluginsStart.serverless,
          noDataPage: pluginsStart.noDataPage,
          contentManagement: pluginsStart.contentManagement,
          cps: pluginsStart.cps,
        };

        params.element.classList.add(styles.visAppWrapper);
        if (pluginsStart.screenshotMode.isScreenshotMode()) {
          params.element.classList.add(styles.visEditorScreenshotMode);
          injectGlobal(styles.globalScreenshotMode);
        }
        const unmount = renderApp(params, services);
        return () => {
          data.search.session.clear();
          params.element.classList.remove(styles.visAppWrapper);
          unlistenParentHistory();
          unmount();
          appUnMounted();
        };
      },
    });

    urlForwarding.forwardApp('visualize', 'visualize');

    if (home) {
      home.featureCatalogue.register({
        id: 'visualize',
        title: 'Visualize library',
        description: i18n.translate('visualizations.visualizeDescription', {
          defaultMessage:
            'Create visualizations and aggregate data stores in your Elasticsearch indices.',
        }),
        icon: 'visualizeApp',
        path: `/app/visualize#${VisualizeConstants.LANDING_PAGE_PATH}`,
        showOnHomePage: false,
        category: 'data',
      });
    }

    if (share) {
      share.url.locators.create(new VisualizeLocatorDefinition());
    }

    setUISettings(core.uiSettings);
    setAnalytics(core.analytics);
    setTheme(core.theme);

    expressions.registerFunction(rangeExpressionFunction);
    expressions.registerFunction(visDimensionExpressionFunction);
    expressions.registerFunction(xyDimensionExpressionFunction);
    embeddable.registerEmbeddablePublicDefinition(VISUALIZE_EMBEDDABLE_TYPE, async () => {
      const { visualizeEmbeddableFactory } = await import('./embeddable/embeddable_module');
      return visualizeEmbeddableFactory;
    });
    embeddable.registerAddFromLibraryType<VisualizationSavedObjectAttributes>({
      onAdd: async (container, savedObject) => {
        container.addNewPanel<VisualizeByReferenceState>(
          {
            panelType: VISUALIZE_EMBEDDABLE_TYPE,
            serializedState: {
              savedObjectId: savedObject.id,
            },
          },
          {
            displaySuccessMessage: true,
          }
        );
      },
      savedObjectType: VISUALIZE_SAVED_OBJECT_TYPE,
      savedObjectName: i18n.translate('visualizations.visualizeSavedObjectName', {
        defaultMessage: 'Visualization',
      }),
      getIconForSavedObject: (savedObject) => {
        const visState = JSON.parse(savedObject.attributes.visState ?? '{}');
        return visState.type === 'vega' ? VegaIcon : 'visualizeApp';
      },
    });
    embeddable.registerLegacyURLTransform(
      VISUALIZE_EMBEDDABLE_TYPE,
      async (transformDrilldownsOut: DrilldownTransforms['transformOut']) => {
        const { getTransformOut } = await import('./embeddable/embeddable_module');
        return getTransformOut(transformDrilldownsOut);
      }
    );

    contentManagement.registry.register({
      id: CONTENT_ID,
      version: {
        latest: LATEST_VERSION,
      },
      name: 'Visualize library',
    });

    return {
      ...this.types.setup(),
      visEditorsRegistry,
      listingViewRegistry,
    };
  }

  public start(
    core: CoreStart,
    {
      data,
      expressions,
      uiActions,
      embeddable,
      spaces,
      savedObjectsTaggingOss,
      fieldFormats,
      usageCollection,
      savedObjectsManagement,
      contentManagement,
      savedSearch,
      dataViews,
      inspector,
      serverless,
      cps,
    }: VisualizationsStartDeps
  ): VisualizationsStart {
    const types = this.types.start();
    setTypes(types);
    setI18n(core.i18n);
    setUserProfile(core.userProfile);
    setEmbeddable(embeddable);
    setApplication(core.application);
    setCapabilities(core.application.capabilities);
    setHttp(core.http);
    setDocLinks(core.docLinks);
    setSearch(data.search);
    setExpressions(expressions);
    setUiActions(uiActions);
    setTimeFilter(data.query.timefilter.timefilter);
    setAggs(data.search.aggs);
    setOverlays(core.overlays);
    setExecutionContext(core.executionContext);
    setChrome(core.chrome);
    setFieldFormats(fieldFormats);
    setUsageCollection(usageCollection);
    setSavedObjectsManagement(savedObjectsManagement);
    setContentManagement(contentManagement);
    setSavedSearch(savedSearch);
    setDataViews(dataViews);
    setInspector(inspector);
    setNotifications(core.notifications);

    if (spaces) {
      setSpaces(spaces);
      spaces.getActiveSpace$().subscribe((space) => {
        if (!space) return;
        const isServerless = Boolean(serverless);
        const isSolutionView = space.solution && space.solution !== 'classic';
        const visibleIn: AppDeepLinkLocations[] =
          isServerless || isSolutionView ? [] : ['globalSearch', 'classicSideNav'];
        this.visibilityUpdater.next(() => ({ visibleIn }));
      });
    }

    if (savedObjectsTaggingOss) {
      setSavedObjectTagging(savedObjectsTaggingOss);
    }

    registerActions(uiActions, data, types);

    cps?.cpsManager?.registerAppAccess('visualize', (location: string) =>
      location.includes('type:vega') ? ProjectRoutingAccess.EDITABLE : ProjectRoutingAccess.DISABLED
    );

    return {
      ...types,
      showNewVisModal,
      findListItems: (search, size, references, referencesToExclude) =>
        findListItems(types, search, size, references, referencesToExclude),
      updateVisualizationLibraryItem: (id, type, newAttributes) =>
        updateBasicSoAttributes(id, type, newAttributes, {
          savedObjectsTagging: savedObjectsTaggingOss?.getTaggingApi(),
          typesService: getTypes(),
          contentManagement,
          ...core,
        }),
    };
  }

  public stop() {
    this.types.stop();
    if (this.stopUrlTracking) {
      this.stopUrlTracking();
    }
    this.appStateSubscription?.unsubscribe();
  }
}
