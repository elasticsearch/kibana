/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Setup as InspectorSetupContract } from '@kbn/inspector-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import type { Start as InspectorStartContract } from '@kbn/inspector-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type { HomePublicPluginSetup } from '@kbn/home-plugin/public';
import type { VisualizationsSetup, VisualizationsStart } from '@kbn/visualizations-plugin/public';
import type { Plugin as ExpressionsPublicPlugin } from '@kbn/expressions-plugin/public';
import type { EmbeddableSetup, EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { MapsEmsPluginPublicStart } from '@kbn/maps-ems-plugin/public';
import type { DataPublicPluginSetup, DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { LicensingPluginSetup, LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { FileUploadPluginStart } from '@kbn/file-upload-plugin/public';
import type { PresentationUtilPluginStart } from '@kbn/presentation-util-plugin/public';
import type { SavedObjectTaggingPluginStart } from '@kbn/saved-objects-tagging-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { CloudSetup } from '@kbn/cloud-plugin/public';
import type { LensPublicSetup } from '@kbn/lens-plugin/public';
import type { ScreenshotModePluginSetup } from '@kbn/screenshot-mode-plugin/public';
import type {
  ContentManagementPublicSetup,
  ContentManagementPublicStart,
} from '@kbn/content-management-plugin/public';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type { CPSPluginStart } from '@kbn/cps/public';

import type { KqlPluginStart } from '@kbn/kql/public';
import { MapsAppLocatorDefinition } from './locators/map_locator/locator_definition';
import { MapsAppTileMapLocatorDefinition } from './locators/tile_map_locator/locator_definition';
import { MapsAppRegionMapLocatorDefinition } from './locators/region_map_locator/locator_definition';
import { registerLicensedFeatures, setLicensingPluginStart } from './licensed_features';
import { registerSource } from './classes/sources/source_registry';
import { registerLayerWizardExternal } from './classes/layers/wizards/layer_wizard_registry';
import type { MapsSetupApi, MapsStartApi } from './api';
import { createLayerDescriptors, suggestEMSTermJoinConfig } from './api';
import type { MapsXPackConfig, MapsConfigType } from '../server/config';
import { APP_NAME, APP_ICON_SOLUTION, APP_ID } from '../common/constants';
import { mapsVisTypeAlias } from './maps_vis_type_alias';
import { featureCatalogueEntry } from './feature_catalogue_entry';
import {
  setIsCloudEnabled,
  setMapAppConfig,
  setSpaceId,
  setStartServices,
  untilPluginStartServicesReady,
} from './kibana_services';
import { MapInspectorView } from './inspector/map_adapter/map_inspector_view';
import { VectorTileInspectorView } from './inspector/vector_tile_adapter/vector_tile_inspector_view';

import { PassiveMapLazy, setupLensChoroplethChart } from './lens';
import { CONTENT_ID, LATEST_VERSION } from '../common/content_management';
import { setupMapEmbeddable } from './react_embeddable/setup_map_embeddable';
import { MapRendererLazy } from './react_embeddable/map_renderer/map_renderer_lazy';
import { registerUiActions } from './trigger_actions/register_ui_actions';
import { REGION_MAP_VIS_TYPE } from './legacy_visualizations/region_map/types';
import { TILE_MAP_VIS_TYPE } from './legacy_visualizations/tile_map/types';

export interface MapsPluginSetupDependencies {
  cloud?: CloudSetup;
  data: DataPublicPluginSetup;
  expressions: ReturnType<ExpressionsPublicPlugin['setup']>;
  inspector: InspectorSetupContract;
  home?: HomePublicPluginSetup;
  lens: LensPublicSetup;
  visualizations: VisualizationsSetup;
  embeddable: EmbeddableSetup;
  share: SharePluginSetup;
  licensing: LicensingPluginSetup;
  usageCollection?: UsageCollectionSetup;
  screenshotMode?: ScreenshotModePluginSetup;
  contentManagement: ContentManagementPublicSetup;
}

export interface MapsPluginStartDependencies {
  charts: ChartsPluginStart;
  cps?: CPSPluginStart;
  data: DataPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  kql: KqlPluginStart;
  embeddable: EmbeddableStart;
  fieldFormats: FieldFormatsStart;
  fileUpload: FileUploadPluginStart;
  inspector: InspectorStartContract;
  licensing: LicensingPluginStart;
  navigation: NavigationPublicPluginStart;
  uiActions: UiActionsStart;
  share: SharePluginStart;
  visualizations: VisualizationsStart;
  savedObjectsTagging?: SavedObjectTaggingPluginStart;
  presentationUtil: PresentationUtilPluginStart;
  spaces?: SpacesPluginStart;
  mapsEms: MapsEmsPluginPublicStart;
  contentManagement: ContentManagementPublicStart;
  screenshotMode?: ScreenshotModePluginSetup;
  usageCollection?: UsageCollectionSetup;
  serverless?: ServerlessPluginStart;
  expressions: ReturnType<ExpressionsPublicPlugin['start']>;
}

/**
 * These are the interfaces with your public contracts. You should export these
 * for other plugins to use in _their_ `SetupDeps`/`StartDeps` interfaces.
 * @public
 */
export type MapsPluginSetup = ReturnType<MapsPlugin['setup']>;
export type MapsPluginStart = ReturnType<MapsPlugin['start']>;

/** @internal */
export class MapsPlugin
  implements
    Plugin<
      MapsPluginSetup,
      MapsPluginStart,
      MapsPluginSetupDependencies,
      MapsPluginStartDependencies
    >
{
  readonly _initializerContext: PluginInitializerContext<MapsXPackConfig>;

  constructor(initializerContext: PluginInitializerContext<MapsXPackConfig>) {
    this._initializerContext = initializerContext;
  }

  public setup(
    core: CoreSetup<MapsPluginStartDependencies, MapsPluginStart>,
    plugins: MapsPluginSetupDependencies
  ): MapsSetupApi {
    registerLicensedFeatures(plugins.licensing);

    const config = this._initializerContext.config.get<MapsConfigType>();
    setMapAppConfig({
      ...config,

      // Override this when we know we are taking a screenshot (i.e. no user interaction)
      // to avoid a blank-canvas issue when rendering maps on a PDF
      preserveDrawingBuffer: plugins.screenshotMode?.isScreenshotMode()
        ? true
        : config.preserveDrawingBuffer,
    });

    const locator = plugins.share.url.locators.create(
      new MapsAppLocatorDefinition({
        useHash: core.uiSettings.get('state:storeInSessionStorage'),
      })
    );
    plugins.share.url.locators.create(
      new MapsAppTileMapLocatorDefinition({
        locator,
      })
    );
    plugins.share.url.locators.create(
      new MapsAppRegionMapLocatorDefinition({
        locator,
      })
    );

    plugins.inspector.registerView(VectorTileInspectorView);
    plugins.inspector.registerView(MapInspectorView);
    if (plugins.home) {
      plugins.home.featureCatalogue.register(featureCatalogueEntry);
    }
    plugins.visualizations.registerAlias(mapsVisTypeAlias);

    core.application.register({
      id: APP_ID,
      title: APP_NAME,
      order: 4000,
      icon: `plugins/${APP_ID}/icon.svg`,
      euiIconType: APP_ICON_SOLUTION,
      category: DEFAULT_APP_CATEGORIES.kibana,
      async mount(params: AppMountParameters) {
        const [, startServices, { renderApp }] = await Promise.all([
          untilPluginStartServicesReady(),
          core.getStartServices(),
          import('./render_app'),
        ]);
        const [coreStart, { spaces }] = startServices;
        const UsageTracker =
          plugins.usageCollection?.components.ApplicationUsageTrackingProvider ?? React.Fragment;
        const activeSpace = await spaces?.getActiveSpace();
        if (activeSpace) {
          setSpaceId(activeSpace.id);
        }
        return renderApp(params, { coreStart, AppUsageTracker: UsageTracker });
      },
    });

    plugins.contentManagement.registry.register({
      id: CONTENT_ID,
      version: {
        latest: LATEST_VERSION,
      },
      name: APP_NAME,
    });

    setupMapEmbeddable(plugins.embeddable);

    setupLensChoroplethChart(core, plugins.expressions, plugins.lens);

    // register wrapper around legacy tile_map and region_map visualizations
    plugins.visualizations.createBaseVisualizationAsync(REGION_MAP_VIS_TYPE, async () => {
      const [[, startPlugins], { regionMapVisType, createRegionMapFn, regionMapRenderer }] =
        await Promise.all([
          core.getStartServices(),
          import('./legacy_visualizations/async_module'),
        ]);
      if (!startPlugins.expressions.getFunction('regionmap')) {
        plugins.expressions.registerFunction(createRegionMapFn);
        plugins.expressions.registerRenderer(regionMapRenderer);
      }
      return regionMapVisType;
    });
    plugins.visualizations.createBaseVisualizationAsync(TILE_MAP_VIS_TYPE, async () => {
      const [
        [, startPlugins],
        { tileMapVisType, createTileMapFn, tileMapRenderer, GEOHASH_GRID, getGeoHashBucketAgg },
      ] = await Promise.all([
        core.getStartServices(),
        import('./legacy_visualizations/async_module'),
      ]);
      if (!startPlugins.expressions.getFunction('tilemap')) {
        plugins.data.search.aggs.types.registerLegacy(GEOHASH_GRID, getGeoHashBucketAgg);
        plugins.expressions.registerFunction(createTileMapFn);
        plugins.expressions.registerRenderer(tileMapRenderer);
      }
      return tileMapVisType;
    });

    setIsCloudEnabled(!!plugins.cloud?.isCloudEnabled);

    return {
      registerLayerWizard: registerLayerWizardExternal,
      registerSource,
    };
  }

  public start(core: CoreStart, plugins: MapsPluginStartDependencies): MapsStartApi {
    setLicensingPluginStart(plugins.licensing);
    setStartServices(core, plugins);

    registerUiActions(core, plugins);

    if (!core.application.capabilities.maps_v2.save) {
      plugins.visualizations.unRegisterAlias(APP_ID);
    }

    return {
      createLayerDescriptors,
      suggestEMSTermJoinConfig,
      Map: MapRendererLazy,
      PassiveMap: PassiveMapLazy,
    };
  }
}
