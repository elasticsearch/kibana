/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import { METRIC_TYPE } from '@kbn/analytics';
import { i18n } from '@kbn/i18n';
import type {
  EmbeddableStateTransfer,
  EmbeddableEditorBreadcrumb,
} from '@kbn/embeddable-plugin/public';
import type { ScopedHistory } from '@kbn/core/public';
import type { OnSaveProps } from '@kbn/saved-objects-plugin/public';
import type { Writable } from '@kbn/utility-types';
import type { AdhocDataView, MapAttributes } from '../../../../server';
import {
  APP_ID,
  MAP_PATH,
  MAP_SAVED_OBJECT_TYPE,
  SOURCE_TYPES,
} from '../../../../common/constants';
import type { MapStore, MapStoreState } from '../../../reducers/store';
import { createMapStore } from '../../../reducers/store';
import type { MapSettings } from '../../../../common/descriptor_types';
import {
  getTimeFilters,
  getMapZoom,
  getMapCenter,
  getLayerListRaw,
  getLayerList,
  getQuery,
  getFilters,
  getMapSettings,
  getLayerListConfigOnly,
} from '../../../selectors/map_selectors';
import {
  setGotoWithCenter,
  setMapSettings,
  replaceLayerList,
  setIsLayerTOCOpen,
  setOpenTOCDetails,
  setHiddenLayers,
} from '../../../actions';
import { getIsLayerTOCOpen, getOpenTOCDetails } from '../../../selectors/ui_selectors';
import type { SharingSavedObjectProps } from './load_from_library';
import { loadFromLibrary } from './load_from_library';
import { saveToLibrary } from './save_to_library';
import {
  getCoreChrome,
  getIndexPatternService,
  getToasts,
  getSavedObjectsTagging,
  getTimeFilter,
  getUsageCollection,
  getServerless,
} from '../../../kibana_services';
import type { LayerDescriptor } from '../../../../common/descriptor_types';
import { copyPersistentState } from '../../../reducers/copy_persistent_state';
import { getBreadcrumbs } from './get_breadcrumbs';
import { DEFAULT_IS_LAYER_TOC_OPEN } from '../../../reducers/ui';
import { createBasemapLayerDescriptor } from '../../../classes/layers/create_basemap_layer_descriptor';
import { whenLicenseInitialized } from '../../../licensed_features';
import { setAutoOpenLayerWizardId } from '../../../actions/ui_actions';
import { LayerStatsCollector, MapSettingsCollector } from '../../../../common/telemetry';
import { getIndexPatternsFromIds } from '../../../index_pattern_util';
import { getByReferenceState, getByValueState } from '../../../react_embeddable/library_transforms';
import type {
  MapByReferenceState,
  MapByValueState,
  MapEmbeddableState,
} from '../../../../common/embeddable/types';

function setMapSettingsFromEncodedState(settings: Partial<MapSettings>) {
  const decodedCustomIcons = settings.customIcons
    ? // base64 decode svg string
      settings.customIcons.map((icon) => {
        return { ...icon, svg: Buffer.from(icon.svg, 'base64').toString('utf-8') };
      })
    : [];
  return setMapSettings({
    ...settings,
    // Set projection to 'mercator' to avoid changing existing maps
    projection: !settings.projection ? 'mercator' : settings.projection,
    customIcons: decodedCustomIcons,
  });
}

export class SavedMap {
  private _attributes: Writable<MapAttributes> | null = null;
  private _sharingSavedObjectProps: SharingSavedObjectProps | null = null;
  private readonly _defaultLayers: LayerDescriptor[];
  private readonly _embeddableId?: string;
  private _initialLayerListConfig: LayerDescriptor[] = [];
  private _mapEmbeddableState?: MapEmbeddableState;
  private readonly _onSaveCallback?: () => void;
  private _originatingApp?: string;
  private _originatingPath?: string;
  private readonly _breadcrumbs?: EmbeddableEditorBreadcrumb[];
  private readonly _stateTransfer?: EmbeddableStateTransfer;
  private readonly _store: MapStore;
  private _tags: string[] = [];
  private _defaultLayerWizard: string;
  private _managed: boolean;

  constructor({
    defaultLayers = [],
    mapEmbeddableState,
    embeddableId,
    onSaveCallback,
    originatingApp,
    stateTransfer,
    originatingPath,
    breadcrumbs,
    defaultLayerWizard,
  }: {
    defaultLayers?: LayerDescriptor[];
    mapEmbeddableState?: MapEmbeddableState;
    embeddableId?: string;
    onSaveCallback?: () => void;
    originatingApp?: string;
    stateTransfer?: EmbeddableStateTransfer;
    originatingPath?: string;
    breadcrumbs?: EmbeddableEditorBreadcrumb[];
    defaultLayerWizard?: string;
  }) {
    this._defaultLayers = defaultLayers;
    this._mapEmbeddableState = mapEmbeddableState;
    this._embeddableId = embeddableId;
    this._onSaveCallback = onSaveCallback;
    this._originatingApp = originatingApp;
    this._originatingPath = originatingPath;
    this._breadcrumbs = breadcrumbs;
    this._stateTransfer = stateTransfer;
    this._store = createMapStore();
    this._defaultLayerWizard = defaultLayerWizard || '';
    this._managed = false;
  }

  public getStore() {
    return this._store;
  }

  public async reset(mapEmbeddableState: MapEmbeddableState) {
    this._mapEmbeddableState = mapEmbeddableState;
    await this.whenReady();
  }

  async whenReady() {
    await whenLicenseInitialized();

    if ((this._mapEmbeddableState as MapByReferenceState)?.savedObjectId) {
      const { attributes, managed, references, sharingSavedObjectProps } = await loadFromLibrary(
        (this._mapEmbeddableState as MapByReferenceState).savedObjectId!
      );
      this._attributes = attributes;
      if (sharingSavedObjectProps) {
        this._sharingSavedObjectProps = sharingSavedObjectProps;
      }
      this._managed = managed;
      const savedObjectsTagging = getSavedObjectsTagging();
      if (savedObjectsTagging && references && references.length) {
        this._tags = savedObjectsTagging.ui.getTagIdsFromReferences(references);
      }
    } else {
      this._attributes = (this._mapEmbeddableState as MapByValueState)?.attributes
        ? (this._mapEmbeddableState as MapByValueState).attributes
        : {
            title: '',
          };
    }

    this._reportUsage();

    if (this._attributes?.adHocDataViews?.length) {
      const dataViewService = getIndexPatternService();
      const promises = this._attributes.adHocDataViews.map((spec) => {
        return dataViewService.create(spec);
      });
      await Promise.all(promises);
    }

    if (this._mapEmbeddableState?.mapSettings !== undefined) {
      this._store.dispatch(setMapSettingsFromEncodedState(this._mapEmbeddableState.mapSettings));
    } else if (this._attributes?.settings) {
      this._store.dispatch(setMapSettingsFromEncodedState(this._attributes.settings));
    }

    let isLayerTOCOpen = DEFAULT_IS_LAYER_TOC_OPEN;
    if (this._mapEmbeddableState?.isLayerTOCOpen !== undefined) {
      isLayerTOCOpen = this._mapEmbeddableState.isLayerTOCOpen;
    } else if (this._attributes?.isLayerTOCOpen !== undefined) {
      isLayerTOCOpen = this._attributes.isLayerTOCOpen;
    }
    this._store.dispatch(setIsLayerTOCOpen(isLayerTOCOpen));

    let openTOCDetails: string[] = [];
    if (this._mapEmbeddableState?.openTOCDetails !== undefined) {
      openTOCDetails = this._mapEmbeddableState.openTOCDetails;
    } else if (this._attributes?.openTOCDetails !== undefined) {
      openTOCDetails = this._attributes.openTOCDetails;
    }
    this._store.dispatch(setOpenTOCDetails(openTOCDetails));

    if (this._mapEmbeddableState?.mapCenter !== undefined) {
      this._store.dispatch(
        setGotoWithCenter({
          lat: this._mapEmbeddableState.mapCenter.lat,
          lon: this._mapEmbeddableState.mapCenter.lon,
          zoom: this._mapEmbeddableState.mapCenter.zoom,
        })
      );
    } else if (this._attributes?.center) {
      this._store.dispatch(
        setGotoWithCenter({
          lat: this._attributes.center.lat,
          lon: this._attributes.center.lon,
          zoom: this._attributes.zoom ?? 1,
        })
      );
    }

    const layerList: LayerDescriptor[] = (this._attributes.layers as LayerDescriptor[]) ?? [];
    if (layerList.length === 0) {
      const basemapLayerDescriptor = createBasemapLayerDescriptor();
      if (basemapLayerDescriptor) {
        layerList.push(basemapLayerDescriptor);
      }
      if (this._defaultLayers.length) {
        layerList.push(...this._defaultLayers);
      }
    }
    this._store.dispatch<any>(replaceLayerList(layerList));
    if (this._mapEmbeddableState?.hiddenLayers !== undefined) {
      this._store.dispatch<any>(setHiddenLayers(this._mapEmbeddableState.hiddenLayers));
    }
    this._initialLayerListConfig = copyPersistentState(layerList);

    if (this._defaultLayerWizard) {
      this._store.dispatch<any>(setAutoOpenLayerWizardId(this._defaultLayerWizard));
    }
  }

  hasUnsavedChanges = () => {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling hasUnsavedChanges');
    }

    const savedLayerList = this._attributes.layers;
    const layerListConfigOnly = getLayerListConfigOnly(this._store.getState());
    return !savedLayerList
      ? !_.isEqual(layerListConfigOnly, this._initialLayerListConfig)
      : !_.isEqual(layerListConfigOnly, savedLayerList);
  };

  private _getStateTransfer() {
    if (!this._stateTransfer) {
      throw new Error('stateTransfer not provided in constructor');
    }

    return this._stateTransfer;
  }

  private _getPageTitle(): string {
    if (!this._mapEmbeddableState) {
      return i18n.translate('xpack.maps.breadcrumbsCreate', {
        defaultMessage: 'Create',
      });
    }

    return this.isByValue()
      ? i18n.translate('xpack.maps.breadcrumbsEditByValue', {
          defaultMessage: 'Edit map',
        })
      : this._attributes!.title;
  }

  private _reportUsage(): void {
    const usageCollector = getUsageCollection();
    if (!usageCollector || !this._attributes) {
      return;
    }

    const mapSettingsStatsCollector = new MapSettingsCollector(this._attributes);

    const layerStatsCollector = new LayerStatsCollector(this._attributes);

    const uiCounterEvents = {
      layer: layerStatsCollector.getLayerCounts(),
      scaling: layerStatsCollector.getScalingCounts(),
      resolution: layerStatsCollector.getResolutionCounts(),
      join: layerStatsCollector.getJoinCounts(),
      ems_basemap: layerStatsCollector.getBasemapCounts(),
      settings: {
        custom_icons_count: mapSettingsStatsCollector.getCustomIconsCount(),
      },
    };

    for (const [eventType, eventTypeMetrics] of Object.entries(uiCounterEvents)) {
      for (const [eventName, count] of Object.entries(eventTypeMetrics)) {
        usageCollector.reportUiCounter(
          APP_ID,
          METRIC_TYPE.LOADED,
          `${eventType}_${eventName}`,
          count
        );
      }
    }
  }

  setBreadcrumbs(history: ScopedHistory) {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling hasUnsavedChanges');
    }

    if (getServerless()) {
      // TODO: https://github.com/elastic/kibana/issues/163488
      // for now, serverless breadcrumbs only set the title,
      // the rest of the breadcrumbs are handled by the serverless navigation
      // the serverless navigation is not yet aware of the byValue/originatingApp context
      getServerless()!.setBreadcrumbs({ text: this._getPageTitle() });
    } else {
      const breadcrumbs = getBreadcrumbs({
        pageTitle: this._getPageTitle(),
        isByValue: this.isByValue(),
        getHasUnsavedChanges: this.hasUnsavedChanges,
        originatingApp: this.hasSaveAndReturnConfig() ? this._originatingApp : undefined,
        incomingBreadcrumbs: this._breadcrumbs,
        getAppNameFromId: this._getStateTransfer().getAppNameFromId,
        history,
      });
      getCoreChrome().setBreadcrumbs(breadcrumbs, {
        project: { value: breadcrumbs, absolute: true },
      });
    }
  }

  public getSavedObjectId(): string | undefined {
    return (this._mapEmbeddableState as MapByReferenceState)?.savedObjectId;
  }

  public getOriginatingApp(): string | undefined {
    return this._originatingApp;
  }

  public getOriginatingAppName(): string | undefined {
    return this._originatingApp ? this.getAppNameFromId(this._originatingApp) : undefined;
  }

  public getOriginatingPath(): string | undefined {
    return this._originatingPath;
  }

  public getAppNameFromId = (appId: string): string | undefined => {
    return this._getStateTransfer().getAppNameFromId(appId);
  };

  public getTags(): string[] {
    return this._tags;
  }

  public hasSaveAndReturnConfig(): boolean {
    return Boolean(
      this._originatingApp &&
        this._originatingPath &&
        // TODO remove this check in editors (lens does this too)
        // instead, embeddable state transform should provide hasSaveAndReturnConfig
        !this._originatingPath.includes('/list/')
    );
  }

  public getTitle(): string {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await getTitle before calling getAttributes');
    }
    return this._attributes.title !== undefined ? this._attributes.title : '';
  }

  public getAttributes(): MapAttributes {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling getAttributes');
    }

    return this._attributes;
  }

  public getAutoFitToBounds(): boolean {
    return this._mapEmbeddableState?.mapSettings?.autoFitToDataBounds !== undefined
      ? this._mapEmbeddableState.mapSettings.autoFitToDataBounds
      : this._attributes?.settings?.autoFitToDataBounds ?? false;
  }

  public getSharingSavedObjectProps(): SharingSavedObjectProps | null {
    return this._sharingSavedObjectProps;
  }

  public isManaged(): boolean {
    return this._managed;
  }

  public isByValue(): boolean {
    const hasSavedObjectId = !!this.getSavedObjectId();
    return this.hasSaveAndReturnConfig() && !hasSavedObjectId;
  }

  public async save({
    newDescription,
    newTitle,
    newCopyOnSave,
    returnToOrigin,
    tags,
    saveByReference,
    dashboardId,
    history,
  }: OnSaveProps & {
    returnToOrigin?: boolean;
    tags?: string[];
    saveByReference: boolean;
    dashboardId?: string | null;
    history: ScopedHistory;
  }) {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling save');
    }

    const prevTitle = this._attributes.title;
    const prevDescription = this._attributes.description;
    this._attributes = {
      title: newTitle,
      ...(newDescription ? { description: newDescription } : {}),
      ...(await this._getStoreAttributes()),
    };

    let mapEmbeddableState: MapEmbeddableState | undefined;
    if (saveByReference) {
      try {
        const savedObjectsTagging = getSavedObjectsTagging();
        const tagReferences =
          savedObjectsTagging && tags ? savedObjectsTagging.ui.updateTagsReferences([], tags) : [];
        const { id: savedObjectId } = await saveToLibrary(
          this._attributes,
          tagReferences,
          newCopyOnSave
            ? undefined
            : (this._mapEmbeddableState as MapByReferenceState)?.savedObjectId
        );
        mapEmbeddableState = getByReferenceState(this._mapEmbeddableState, savedObjectId);
      } catch (e) {
        this._attributes.title = prevTitle;
        this._attributes.description = prevDescription;
        getToasts().addDanger({
          title: i18n.translate('xpack.maps.saveToLibraryError', {
            defaultMessage: `An error occurred while saving. Error: {errorMessage}`,
            values: {
              errorMessage: e.message,
            },
          }),
        });
        return;
      }
    } else {
      mapEmbeddableState = getByValueState(this._mapEmbeddableState, this._attributes);
    }

    if (tags) {
      this._tags = tags;
    }

    if (returnToOrigin) {
      if (!this._originatingApp) {
        getToasts().addDanger({
          title: i18n.translate('xpack.maps.topNav.saveErrorTitle', {
            defaultMessage: `Error saving ''{title}''`,
            values: { title: newTitle },
          }),
          text: i18n.translate('xpack.maps.topNav.saveErrorText', {
            defaultMessage: 'Unable to return to app without an originating app',
          }),
        });
        return;
      }
      await this._getStateTransfer().navigateToWithEmbeddablePackages(this._originatingApp, {
        state: [
          {
            embeddableId: newCopyOnSave ? undefined : this._embeddableId,
            type: MAP_SAVED_OBJECT_TYPE,
            serializedState: mapEmbeddableState,
          },
        ],
        path: this._originatingPath,
      });
      return;
    } else if (dashboardId) {
      await this._getStateTransfer().navigateToWithEmbeddablePackages('dashboards', {
        state: [
          {
            type: MAP_SAVED_OBJECT_TYPE,
            serializedState: mapEmbeddableState,
          },
        ],
        path: dashboardId === 'new' ? '#/create' : `#/view/${dashboardId}`,
      });
      return;
    }

    this._mapEmbeddableState = mapEmbeddableState;
    // break connection to originating application
    this._originatingApp = undefined;

    // remove editor state so the connection is still broken after reload
    this._getStateTransfer().clearEditorState(APP_ID);

    getToasts().addSuccess({
      title: i18n.translate('xpack.maps.topNav.saveSuccessMessage', {
        defaultMessage: `Saved ''{title}''`,
        values: { title: newTitle },
      }),
    });

    getCoreChrome().docTitle.change(newTitle);
    this.setBreadcrumbs(history);
    history.push(`/${MAP_PATH}/${this.getSavedObjectId()}${window.location.hash}`);

    if (this._onSaveCallback) {
      this._onSaveCallback();
    }

    return;
  }

  private async _getStoreAttributes() {
    const state: MapStoreState = this._store.getState();
    const mapSettings = getMapSettings(state);
    return {
      adHocDataViews: await this._getAdHocDataViews(),
      center: getMapCenter(state),
      filters: getFilters(state),
      isLayerTOCOpen: getIsLayerTOCOpen(state),
      layers: copyPersistentState(getLayerListRaw(state)),
      openTOCDetails: getOpenTOCDetails(state),
      query: getQuery(state),
      refreshInterval: getTimeFilter().getRefreshInterval(),
      settings: {
        ...mapSettings,
        // base64 encode custom icons to avoid svg strings breaking saved object stringification/parsing.
        customIcons: mapSettings.customIcons.map((icon) => {
          return { ...icon, svg: Buffer.from(icon.svg).toString('base64') };
        }),
      },
      timeFilters: getTimeFilters(state),
      zoom: getMapZoom(state),
    };
  }

  private async _getAdHocDataViews() {
    const dataViewIds: string[] = [];
    getLayerList(this._store.getState())
      // exclude adhoc data views from ESQL sources
      .filter((layer) => layer.getDescriptor().sourceDescriptor?.type !== SOURCE_TYPES.ESQL)
      .forEach((layer) => {
        dataViewIds.push(...layer.getIndexPatternIds());
      });

    const dataViews = await getIndexPatternsFromIds(_.uniq(dataViewIds));
    return dataViews
      .filter((dataView) => {
        return !dataView.isPersisted();
      })
      .map((dataView) => {
        const { allowHidden, id, name, timeFieldName, title } = dataView.toSpec(false);
        return {
          allowHidden,
          id,
          name,
          timeFieldName,
          title,
        } as AdhocDataView;
      });
  }
}
