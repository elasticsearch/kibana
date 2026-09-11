/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Writable } from '@kbn/utility-types';
import { i18n } from '@kbn/i18n';
import type { SearchResponseWarning } from '@kbn/search-response-warnings';
import type { IVectorLayer } from '../vector_layer';
import { GeoJsonVectorLayer } from '../geojson_vector_layer';
import type { IVectorStyle } from '../../../styles/vector/vector_style';
import { VectorStyle } from '../../../styles/vector/vector_style';
import { getDefaultDynamicProperties } from '../../../styles/vector/vector_style_defaults';
import type { IDynamicStyleProperty } from '../../../styles/vector/properties/dynamic_style_property';
import type { IStyleProperty } from '../../../styles/vector/properties/style_property';
import {
  COUNT_PROP_NAME,
  GRID_RESOLUTION,
  LAYER_TYPE,
  AGG_TYPE,
  RENDER_AS,
  STYLE_TYPE,
  VECTOR_STYLES,
  LAYER_STYLE_TYPE,
  FIELD_ORIGIN,
} from '../../../../../common/constants';
import { ESGeoGridSource } from '../../../sources/es_geo_grid_source/es_geo_grid_source';
import { canSkipSourceUpdate } from '../../../util/can_skip_fetch';
import type { IESSource } from '../../../sources/es_source';
import type { ISource } from '../../../sources/source';
import type { DataRequestContext } from '../../../../actions';
import { DataRequestAbortError } from '../../../util/data_request';
import type {
  CustomIcon,
  VectorStyleDescriptor,
  SizeDynamicOptions,
  DynamicStylePropertyOptions,
  StylePropertyOptions,
  Timeslice,
  VectorLayerDescriptor,
  VectorSourceRequestMeta,
  VectorStylePropertiesDescriptor,
  ESGeoGridSourceDescriptor,
} from '../../../../../common/descriptor_types';
import type { IVectorSource } from '../../../sources/vector_source';
import type { LICENSED_FEATURES } from '../../../../licensed_features';
import type { ESSearchSource } from '../../../sources/es_search_source/es_search_source';
import { isSearchSourceAbortError } from '../../../sources/es_source/es_source';

const ACTIVE_COUNT_DATA_ID = 'ACTIVE_COUNT_DATA_ID';

function getAggType(
  dynamicProperty: IDynamicStyleProperty<DynamicStylePropertyOptions>
): AGG_TYPE.AVG | AGG_TYPE.TERMS {
  return dynamicProperty.isOrdinal() ? AGG_TYPE.AVG : AGG_TYPE.TERMS;
}

function getClusterSource(documentSource: IESSource, documentStyle: IVectorStyle): ESGeoGridSource {
  const clusterSourceDescriptor = ESGeoGridSource.createDescriptor({
    indexPatternId: documentSource.getIndexPatternId(),
    geoField: documentSource.getGeoFieldName(),
    requestType: RENDER_AS.POINT,
    resolution: GRID_RESOLUTION.COARSE,
  }) as Writable<ESGeoGridSourceDescriptor>;
  clusterSourceDescriptor.applyGlobalQuery = documentSource.getApplyGlobalQuery();
  clusterSourceDescriptor.applyGlobalTime = documentSource.getApplyGlobalTime();
  clusterSourceDescriptor.applyForceRefresh = documentSource.getApplyForceRefresh();
  clusterSourceDescriptor.metrics = [
    {
      type: AGG_TYPE.COUNT,
    },
    ...documentStyle.getDynamicPropertiesArray().map((dynamicProperty) => {
      return {
        type: getAggType(dynamicProperty),
        field: dynamicProperty.getFieldName(),
      };
    }),
  ];
  clusterSourceDescriptor.id = documentSource.getId();
  return new ESGeoGridSource(clusterSourceDescriptor);
}

function getClusterStyleDescriptor(
  documentStyle: IVectorStyle,
  clusterSource: ESGeoGridSource
): VectorStyleDescriptor {
  const defaultDynamicProperties = getDefaultDynamicProperties();
  const clusterStyleDescriptor: Omit<VectorStyleDescriptor, 'properties'> & {
    properties: Partial<VectorStylePropertiesDescriptor>;
  } = {
    type: LAYER_STYLE_TYPE.VECTOR,
    properties: {
      [VECTOR_STYLES.LABEL_TEXT]: {
        type: STYLE_TYPE.DYNAMIC,
        options: {
          ...defaultDynamicProperties[VECTOR_STYLES.LABEL_TEXT].options,
          field: {
            name: COUNT_PROP_NAME,
            origin: FIELD_ORIGIN.SOURCE,
          },
        },
      },
      [VECTOR_STYLES.ICON_SIZE]: {
        type: STYLE_TYPE.DYNAMIC,
        options: {
          ...(defaultDynamicProperties[VECTOR_STYLES.ICON_SIZE].options as SizeDynamicOptions),
          field: {
            name: COUNT_PROP_NAME,
            origin: FIELD_ORIGIN.SOURCE,
          },
        },
      },
    },
    isTimeAware: true,
  };
  documentStyle
    .getAllStyleProperties()
    .forEach((styleProperty: IStyleProperty<StylePropertyOptions>) => {
      const styleName = styleProperty.getStyleName();
      if (
        [VECTOR_STYLES.LABEL_TEXT, VECTOR_STYLES.ICON_SIZE].includes(styleName) &&
        (!styleProperty.isDynamic() || !styleProperty.isComplete())
      ) {
        // Do not migrate static label and icon size properties to provide unique cluster styling out of the box
        return;
      }

      if (
        styleName === VECTOR_STYLES.SYMBOLIZE_AS ||
        styleName === VECTOR_STYLES.LABEL_BORDER_SIZE
      ) {
        // copy none static/dynamic styles to cluster style
        clusterStyleDescriptor.properties[styleName] = {
          // @ts-expect-error
          options: { ...styleProperty.getOptions() },
        };
      } else if (styleProperty.isDynamic()) {
        // copy dynamic styles to cluster style
        const options = styleProperty.getOptions() as DynamicStylePropertyOptions;
        const field =
          options && options.field && options.field.name
            ? {
                ...options.field,
                name: clusterSource.getAggKey(
                  getAggType(styleProperty as IDynamicStyleProperty<DynamicStylePropertyOptions>),
                  options.field.name
                ),
              }
            : undefined;

        clusterStyleDescriptor.properties[styleName] = {
          type: STYLE_TYPE.DYNAMIC,
          // @ts-expect-error — style types are complex unions/intersections, TS expects fields not present
          // at runtime when cloning options
          options: {
            ...options,
            field,
          },
        };
      } else {
        // copy static styles to cluster style
        clusterStyleDescriptor.properties[styleName] = {
          type: STYLE_TYPE.STATIC,
          // @ts-expect-error — style types are complex unions/intersections, TS expects fields not present
          // at runtime when cloning options
          options: { ...styleProperty.getOptions() },
        };
      }
    });

  return clusterStyleDescriptor as VectorStyleDescriptor;
}

export interface BlendedVectorLayerArguments {
  chartsPaletteServiceGetColor?: (value: string) => string | null;
  source: IVectorSource;
  layerDescriptor: VectorLayerDescriptor;
  customIcons: CustomIcon[];
}

export class BlendedVectorLayer extends GeoJsonVectorLayer implements IVectorLayer {
  static createDescriptor(
    options: Partial<VectorLayerDescriptor>,
    mapColors: string[]
  ): VectorLayerDescriptor {
    const layerDescriptor = GeoJsonVectorLayer.createDescriptor(
      options,
      mapColors
    ) as Writable<VectorLayerDescriptor>;
    layerDescriptor.type = LAYER_TYPE.BLENDED_VECTOR;
    return layerDescriptor;
  }

  private _isClustered: boolean;
  private readonly _clusterSource: ESGeoGridSource;
  private readonly _clusterStyle: VectorStyle;
  private readonly _documentSource: ESSearchSource;
  private readonly _documentStyle: VectorStyle;

  constructor(options: BlendedVectorLayerArguments) {
    super({
      ...options,
      joins: [],
    });

    this._documentSource = this._source as ESSearchSource; // VectorLayer constructor sets _source as document source
    this._documentStyle = this._style; // VectorLayer constructor sets _style as document source

    this._clusterSource = getClusterSource(this._documentSource, this._documentStyle);
    const clusterStyleDescriptor = getClusterStyleDescriptor(
      this._documentStyle,
      this._clusterSource
    );
    this._clusterStyle = new VectorStyle(
      clusterStyleDescriptor,
      this._clusterSource,
      this,
      options.customIcons,
      options.chartsPaletteServiceGetColor
    );

    let isClustered = false;
    const countDataRequest = this.getDataRequest(ACTIVE_COUNT_DATA_ID);
    if (countDataRequest) {
      const requestData = countDataRequest.getData() as { isSyncClustered: boolean };
      if (requestData && requestData.isSyncClustered) {
        isClustered = true;
      }
    }
    this._isClustered = isClustered;
  }

  async getDisplayName(source?: ISource) {
    const displayName = await super.getDisplayName(source);
    return this._isClustered
      ? i18n.translate('xpack.maps.blendedVectorLayer.clusteredLayerName', {
          defaultMessage: 'Clustered {displayName}',
          values: { displayName },
        })
      : displayName;
  }

  getJoins() {
    return [];
  }

  hasJoins() {
    return false;
  }

  async cloneDescriptor(): Promise<VectorLayerDescriptor[]> {
    const clones = await super.cloneDescriptor();
    if (clones.length === 0) {
      return [];
    }
    const clonedDescriptor = clones[0] as Writable<VectorLayerDescriptor>;

    // Use super getDisplayName instead of instance getDisplayName to avoid getting 'Clustered Clone of Clustered'
    const displayName = await super.getDisplayName();
    clonedDescriptor.label = `Clone of ${displayName}`;

    // sourceDescriptor must be document source descriptor
    clonedDescriptor.sourceDescriptor = this._documentSource.cloneDescriptor();

    return [clonedDescriptor];
  }

  getSource = () => {
    return this._isClustered ? this._clusterSource : this._documentSource;
  };

  getSourceForEditing() {
    // Layer is based on this._documentSource
    // this._clusterSource is a derived source for rendering only.
    // Regardless of this._activeSource, this._documentSource should always be displayed in the editor
    return this._documentSource;
  }

  getCurrentStyle(): VectorStyle {
    return this._isClustered ? this._clusterStyle : this._documentStyle;
  }

  getStyleForEditing(): IVectorStyle {
    return this._documentStyle;
  }

  async syncData(syncContext: DataRequestContext) {
    const dataRequestId = ACTIVE_COUNT_DATA_ID;
    const requestToken = Symbol(`layer-active-count:${this.getId()}`);
    const requestMeta: VectorSourceRequestMeta = await this._getVectorSourceRequestMeta(
      syncContext.isForceRefresh,
      syncContext.dataFilters,
      this.getSource(),
      this.getCurrentStyle(),
      syncContext.isFeatureEditorOpenForLayer
    );
    const source = this.getSource();

    const canSkipSourceFetch = await canSkipSourceUpdate({
      source,
      prevDataRequest: this.getDataRequest(dataRequestId),
      nextRequestMeta: requestMeta,
      extentAware: source.isFilterByMapBounds(),
      getUpdateDueToTimeslice: (timeslice?: Timeslice) => {
        return this._getUpdateDueToTimesliceFromSourceRequestMeta(source, timeslice);
      },
    });

    let activeSource;
    let activeStyle;
    if (canSkipSourceFetch) {
      // Even when source fetch is skipped, need to call super._syncData to sync StyleMeta and formatters
      if (this._isClustered) {
        activeSource = this._clusterSource;
        activeStyle = this._clusterStyle;
      } else {
        activeSource = this._documentSource;
        activeStyle = this._documentStyle;
      }
    } else {
      let isSyncClustered;
      try {
        syncContext.startLoading(dataRequestId, requestToken, requestMeta);
        const warnings: SearchResponseWarning[] = [];
        isSyncClustered = !(await this._documentSource.canLoadAllDocuments(
          await this.getDisplayName(this._documentSource),
          requestMeta,
          syncContext.registerCancelCallback.bind(null, requestToken),
          syncContext.inspectorAdapters,
          (warning) => {
            warnings.push(warning);
          }
        ));
        syncContext.stopLoading(
          dataRequestId,
          requestToken,
          { isSyncClustered },
          { ...requestMeta, warnings }
        );
      } catch (error) {
        if (error instanceof DataRequestAbortError || isSearchSourceAbortError(error)) {
          syncContext.onLoadAbort(dataRequestId, requestToken);
        } else {
          syncContext.onLoadError(dataRequestId, requestToken, error);
        }
        return;
      }
      if (isSyncClustered) {
        this._isClustered = true;
        activeSource = this._clusterSource;
        activeStyle = this._clusterStyle;
      } else {
        this._isClustered = false;
        activeSource = this._documentSource;
        activeStyle = this._documentStyle;
      }
    }

    super._syncData(syncContext, activeSource, activeStyle);
  }

  async getLicensedFeatures(): Promise<LICENSED_FEATURES[]> {
    return [
      ...(await this._clusterSource.getLicensedFeatures()),
      ...(await this._documentSource.getLicensedFeatures()),
    ];
  }
}
