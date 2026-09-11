/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Adapters } from '@kbn/inspector-plugin/common/adapters';
import { asyncForEach } from '@kbn/std';
import type { FilterSpecification, Map as MbMap, LayerSpecification } from '@kbn/mapbox-gl';
import type { KibanaExecutionContext } from '@kbn/core/public';
import type { Query } from '@kbn/data-plugin/common';
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Position } from 'geojson';
import _ from 'lodash';
import { EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { Writable } from '@kbn/utility-types';
import type { ProjectRoutingOverrides } from '@kbn/presentation-publishing';
import { AbstractLayer } from '../layer';
import type { IVectorStyle } from '../../styles/vector/vector_style';
import { VectorStyle } from '../../styles/vector/vector_style';
import type { FieldFormatter, VECTOR_STYLES } from '../../../../common/constants';
import {
  AGG_TYPE,
  SOURCE_META_DATA_REQUEST_ID,
  SOURCE_FORMATTERS_DATA_REQUEST_ID,
  LAYER_TYPE,
  FIELD_ORIGIN,
  STYLE_TYPE,
} from '../../../../common/constants';
import { TermJoinTooltipProperty } from '../../tooltips/term_join_tooltip_property';
import { DataRequestAbortError } from '../../util/data_request';
import { canSkipStyleMetaUpdate, canSkipFormattersUpdate } from '../../util/can_skip_fetch';
import type { TimesliceMaskConfig } from '../../util/mb_filter_expressions';
import {
  getLabelFilterExpression,
  getFillFilterExpression,
  getLineFilterExpression,
  getPointFilterExpression,
} from '../../util/mb_filter_expressions';
import type {
  AbstractESJoinSourceDescriptor,
  AggDescriptor,
  CustomIcon,
  DynamicStylePropertyOptions,
  DataFilters,
  JoinDescriptor,
  StyleMetaDescriptor,
  VectorLayerDescriptor,
  VectorSourceRequestMeta,
  VectorStyleRequestMeta,
  JoinSourceDescriptor,
  StylePropertyField,
} from '../../../../common/descriptor_types';
import type { IVectorSource } from '../../sources/vector_source';
import { isESVectorTileSource } from '../../sources/es_source';
import type { LayerIcon, ILayer, LayerMessage } from '../layer';
import type { InnerJoin } from '../../joins/inner_join';
import { isSpatialJoin } from '../../joins/is_spatial_join';
import type { IField } from '../../fields/field';
import type { DataRequestContext } from '../../../actions';
import type { ITooltipProperty } from '../../tooltips/tooltip_property';
import type { IDynamicStyleProperty } from '../../styles/vector/properties/dynamic_style_property';
import { hasESSourceMethod } from '../../sources/es_source';
import type { IJoinSource, ITermJoinSource } from '../../sources/join_sources';
import { isTermJoinSource } from '../../sources/join_sources';
import type { IESAggSource } from '../../sources/es_agg_source';
import { buildVectorRequestMeta } from '../build_vector_request_meta';
import { getJoinAggKey } from '../../../../common/get_agg_key';
import { syncBoundsData } from './bounds_data';
import type { JoinState } from './types';
import { canSkipSourceUpdate } from '../../util/can_skip_fetch';
import type { PropertiesMap } from '../../../../common/elasticsearch_util';
import { Mask } from './mask';

const SUPPORTS_FEATURE_EDITING_REQUEST_ID = 'SUPPORTS_FEATURE_EDITING_REQUEST_ID';

export function isVectorLayer(layer: ILayer): layer is IVectorLayer {
  return (
    typeof (layer as IVectorLayer).addFeature === 'function' &&
    typeof (layer as IVectorLayer).canShowTooltip === 'function' &&
    typeof (layer as IVectorLayer).deleteFeature === 'function' &&
    typeof (layer as IVectorLayer).getFields === 'function' &&
    typeof (layer as IVectorLayer).getJoins === 'function' &&
    typeof (layer as IVectorLayer).getLeftJoinFields === 'function' &&
    typeof (layer as IVectorLayer).getMbTooltipLayerIds === 'function' &&
    typeof (layer as IVectorLayer).getValidJoins === 'function' &&
    typeof (layer as IVectorLayer).hasJoins === 'function' &&
    typeof (layer as IVectorLayer).supportsFeatureEditing === 'function'
  );
}

export function hasVectorLayerMethod(
  layer: ILayer,
  methodName: keyof IVectorLayer
): layer is Pick<IVectorLayer, typeof methodName> {
  return typeof (layer as IVectorLayer)[methodName] === 'function';
}

export interface VectorLayerArguments {
  source: IVectorSource;
  joins?: InnerJoin[];
  layerDescriptor: Partial<VectorLayerDescriptor>;
  customIcons: CustomIcon[];
  chartsPaletteServiceGetColor?: (value: string) => string | null;
}

export interface IVectorLayer extends ILayer {
  /*
   * IVectorLayer.getMbLayerIds returns a list of mapbox layers assoicated with this layer for identifing features with tooltips.
   * Must return ILayer.getMbLayerIds or a subset of ILayer.getMbLayerIds.
   */
  getMbTooltipLayerIds(): string[];

  getFields(): Promise<IField[]>;
  getStyleEditorFields(): Promise<IField[]>;
  getJoins(): InnerJoin[];
  getValidJoins(): InnerJoin[];
  getSource(): IVectorSource;
  getFeatureId(feature: Feature): string | number | undefined;
  getFeatureById(id: string | number): Feature | null;
  getPropertiesForTooltip(
    properties: GeoJsonProperties,
    executionContext: KibanaExecutionContext
  ): Promise<ITooltipProperty[]>;
  hasJoins(): boolean;
  canShowTooltip(): boolean;
  areTooltipsDisabled(): boolean;
  supportsFeatureEditing(): boolean;
  getLeftJoinFields(): Promise<IField[]>;
  addFeature(geometry: Geometry | Position[]): Promise<void>;
  deleteFeature(featureId: string): Promise<void>;
  getMasks(): Mask[];
}

export const noResultsIcon = (
  <EuiIcon size="m" color="subdued" type="minusCircle" aria-hidden={true} />
);
export const NO_RESULTS_ICON_AND_TOOLTIPCONTENT = {
  icon: noResultsIcon,
  tooltipContent: i18n.translate('xpack.maps.vectorLayer.noResultsFoundTooltip', {
    defaultMessage: `No results found.`,
  }),
};

export class AbstractVectorLayer extends AbstractLayer implements IVectorLayer {
  protected readonly _style: VectorStyle;
  private readonly _joins: InnerJoin[];
  protected readonly _descriptor: VectorLayerDescriptor;
  private readonly _masks: Mask[];

  static createDescriptor(
    options: Partial<VectorLayerDescriptor>,
    mapColors?: string[]
  ): VectorLayerDescriptor {
    const layerDescriptor = super.createDescriptor(options) as Writable<VectorLayerDescriptor>;
    layerDescriptor.type =
      layerDescriptor.type !== undefined ? layerDescriptor.type : LAYER_TYPE.GEOJSON_VECTOR;

    if (!options.style) {
      const styleProperties = VectorStyle.createDefaultStyleProperties(mapColors ? mapColors : []);
      layerDescriptor.style = VectorStyle.createDescriptor(styleProperties);
    }

    if (!options.joins) {
      layerDescriptor.joins = [];
    }

    layerDescriptor.disableTooltips = options.disableTooltips ?? false;

    return layerDescriptor;
  }

  constructor({
    layerDescriptor,
    source,
    joins = [],
    customIcons,
    chartsPaletteServiceGetColor,
  }: VectorLayerArguments) {
    super({
      layerDescriptor,
      source,
    });
    this._joins = joins;
    this._descriptor = AbstractVectorLayer.createDescriptor(layerDescriptor);
    this._style = new VectorStyle(
      this._descriptor.style ?? VectorStyle.createDescriptor(),
      source,
      this,
      customIcons,
      chartsPaletteServiceGetColor
    );
    this._masks = this._createMasks();
  }

  async cloneDescriptor(): Promise<VectorLayerDescriptor[]> {
    const clones = await super.cloneDescriptor();
    if (clones.length === 0) {
      return [];
    }

    const clonedDescriptor = clones[0] as VectorLayerDescriptor;
    if (clonedDescriptor.joins) {
      clonedDescriptor.joins.forEach((joinDescriptor: Partial<JoinDescriptor>) => {
        if (!joinDescriptor.right) {
          return;
        }
        const joinSourceDescriptor =
          joinDescriptor.right as Partial<AbstractESJoinSourceDescriptor>;
        const originalJoinId = joinSourceDescriptor.id ?? '';

        // right.id is uuid used to track requests in inspector
        const clonedJoinId = uuidv4();
        (joinDescriptor.right as Writable<JoinSourceDescriptor>).id = clonedJoinId;

        // Update all data driven styling properties using join fields
        if (clonedDescriptor.style && 'properties' in clonedDescriptor.style) {
          const metrics = joinSourceDescriptor.metrics ?? [{ type: AGG_TYPE.COUNT }];
          metrics.forEach((metricsDescriptor: AggDescriptor) => {
            const originalJoinKey = getJoinAggKey({
              aggType: metricsDescriptor.type,
              aggFieldName: 'field' in metricsDescriptor ? metricsDescriptor.field : '',
              rightSourceId: originalJoinId,
            });
            const newJoinKey = getJoinAggKey({
              aggType: metricsDescriptor.type,
              aggFieldName: 'field' in metricsDescriptor ? metricsDescriptor.field : '',
              rightSourceId: clonedJoinId,
            });

            Object.keys(clonedDescriptor.style?.properties ?? {}).forEach((key) => {
              const styleProp = clonedDescriptor.style!.properties[key as VECTOR_STYLES];
              if (styleProp && 'type' in styleProp && styleProp.type === STYLE_TYPE.DYNAMIC) {
                const options = styleProp.options as DynamicStylePropertyOptions;
                if (
                  options.field &&
                  options.field.origin === FIELD_ORIGIN.JOIN &&
                  options.field.name === originalJoinKey
                ) {
                  (options.field as Writable<StylePropertyField>).name = newJoinKey;
                }
              }
            });
          });
        }
      });
    }
    return [clonedDescriptor];
  }

  getSource(): IVectorSource {
    return super.getSource() as IVectorSource;
  }

  getStyleForEditing(): IVectorStyle {
    return this._style;
  }

  getStyle(): IVectorStyle {
    return this._style;
  }

  getCurrentStyle(): VectorStyle {
    return this._style;
  }

  getJoins() {
    return this._joins.slice();
  }

  getValidJoins() {
    return this.getJoins().filter((join) => {
      return join.hasCompleteConfig();
    });
  }

  supportsFeatureEditing(): boolean {
    const dataRequest = this.getDataRequest(SUPPORTS_FEATURE_EDITING_REQUEST_ID);
    const data = dataRequest?.getData() as { supportsFeatureEditing: boolean } | undefined;
    return data ? data.supportsFeatureEditing : false;
  }

  hasJoins() {
    return this.getValidJoins().length > 0;
  }

  _isLoadingJoins() {
    return this.getValidJoins().some((join) => {
      const joinDataRequest = this.getDataRequest(join.getSourceDataRequestId());
      return !joinDataRequest || joinDataRequest.isLoading();
    });
  }

  _getSourceErrorTitle() {
    return i18n.translate('xpack.maps.vectorLayer.sourceErrorTitle', {
      defaultMessage: `An error occurred when loading layer features`,
    });
  }

  getErrors(inspectorAdapters: Adapters): LayerMessage[] {
    const errors = super.getErrors(inspectorAdapters);

    this.getValidJoins().forEach((join) => {
      const joinDataRequest = this.getDataRequest(join.getSourceDataRequestId());
      const joinError = joinDataRequest?.renderError();
      if (joinError) {
        errors.push({
          title: i18n.translate('xpack.maps.vectorLayer.joinFetchErrorTitle', {
            defaultMessage: `An error occurred when loading join metrics`,
          }),
          body: joinError,
        });
      }
    });

    return errors;
  }

  getLayerIcon(isTocIcon: boolean): LayerIcon {
    throw new Error('Should implement AbstractVectorLayer#getLayerIcon');
  }

  getLayerTypeIconName() {
    return 'vectorSquare';
  }

  async hasLegendDetails() {
    return this.getCurrentStyle().hasLegendDetails();
  }

  renderLegendDetails() {
    return this.getCurrentStyle().renderLegendDetails();
  }

  async getBounds(getDataRequestContext: (layerId: string) => DataRequestContext) {
    return syncBoundsData({
      layerId: this.getId(),
      syncContext: getDataRequestContext(this.getId()),
      source: this.getSource(),
      sourceQuery: this.getQuery(),
    });
  }

  async getLeftJoinFields() {
    return await this.getSource().getLeftJoinFields();
  }

  _getJoinFields() {
    const joinFields: IField[] = [];
    this.getValidJoins().forEach((join) => {
      const fields = join.getJoinFields();
      joinFields.push(...fields);
    });
    return joinFields;
  }

  async getFields() {
    const sourceFields = await this.getSource().getFields();
    return [...sourceFields, ...this._getJoinFields()];
  }

  async getStyleEditorFields() {
    const sourceFields = await (this.getSourceForEditing() as IVectorSource).getFields();
    return [...sourceFields, ...this._getJoinFields()];
  }

  getIndexPatternIds() {
    const indexPatternIds = [];
    const source = this.getSource();
    if (hasESSourceMethod(source, 'getIndexPatternId')) {
      indexPatternIds.push(source.getIndexPatternId());
    }

    this.getValidJoins().forEach((join) => {
      const rightSource = join.getRightJoinSource();
      if (hasESSourceMethod(rightSource, 'getIndexPatternId')) {
        indexPatternIds.push(rightSource.getIndexPatternId());
      }
    });
    return indexPatternIds;
  }

  getQueryableIndexPatternIds() {
    const indexPatternIds = [];
    const source = this.getSource();
    if (source.getApplyGlobalQuery() && hasESSourceMethod(source, 'getIndexPatternId')) {
      indexPatternIds.push(source.getIndexPatternId());
    }

    this.getValidJoins().forEach((join) => {
      const rightSource = join.getRightJoinSource();
      if (
        rightSource.getApplyGlobalQuery() &&
        hasESSourceMethod(rightSource, 'getIndexPatternId')
      ) {
        indexPatternIds.push(rightSource.getIndexPatternId());
      }
    });
    return indexPatternIds;
  }

  async getProjectRoutingOverrides(): Promise<ProjectRoutingOverrides> {
    const overrides: ProjectRoutingOverrides = [];
    const source = this.getSource();
    if (hasESSourceMethod(source, 'getProjectRouting')) {
      const projectRouting = source.getProjectRouting?.();
      if (projectRouting) {
        overrides.push({
          name: await this.getDisplayName(),
          value: projectRouting,
        });
      }
    }

    asyncForEach(this.getValidJoins(), async (join) => {
      const joinSource = join.getRightJoinSource();
      if (joinSource && hasESSourceMethod(joinSource, 'getProjectRouting')) {
        const projectRouting = joinSource.getProjectRouting?.();
        if (projectRouting) {
          overrides.push({
            name: await this.getDisplayName(),
            value: projectRouting,
          });
        }
      }
    });

    return overrides.length > 0 ? overrides : undefined;
  }

  async isFilteredByGlobalTime(): Promise<boolean> {
    if (this.getSource().getApplyGlobalTime() && (await this.getSource().isTimeAware())) {
      return true;
    }

    const joinPromises = this.getValidJoins().map(async (join) => {
      return (
        join.getRightJoinSource().getApplyGlobalTime() &&
        (await join.getRightJoinSource().isTimeAware())
      );
    });
    return (await Promise.all(joinPromises)).some((isJoinTimeAware: boolean) => {
      return isJoinTimeAware;
    });
  }

  async _getVectorSourceRequestMeta(
    isForceRefresh: boolean,
    dataFilters: DataFilters,
    source: IVectorSource,
    style: IVectorStyle,
    isFeatureEditorOpenForLayer: boolean
  ): Promise<VectorSourceRequestMeta> {
    const fieldNames = [
      ...style.getSourceFieldNames(),
      ...this.getValidJoins()
        .filter((join) => {
          return !isSpatialJoin(join.toDescriptor());
        })
        .map((join) => join.getLeftField().getName()),
    ];

    const timesliceMaskFieldName = await source.getTimesliceMaskFieldName();
    if (timesliceMaskFieldName) {
      fieldNames.push(timesliceMaskFieldName);
    }
    return buildVectorRequestMeta(
      source,
      fieldNames,
      dataFilters,
      this.getQuery(),
      isForceRefresh,
      isFeatureEditorOpenForLayer
    );
  }

  async _syncSourceStyleMeta(
    syncContext: DataRequestContext,
    source: IVectorSource,
    style: IVectorStyle
  ) {
    const sourceQuery = this.getQuery();
    return this._syncStyleMeta({
      source,
      style,
      sourceQuery: sourceQuery ? sourceQuery : undefined,
      dataRequestId: SOURCE_META_DATA_REQUEST_ID,
      dynamicStyleProps: style.getDynamicPropertiesArray().filter((dynamicStyleProp) => {
        return (
          dynamicStyleProp.getFieldOrigin() === FIELD_ORIGIN.SOURCE &&
          dynamicStyleProp.isFieldMetaEnabled()
        );
      }),
      ...syncContext,
    });
  }

  async _syncStyleMeta({
    source,
    style,
    sourceQuery,
    dataRequestId,
    dynamicStyleProps,
    dataFilters,
    startLoading,
    stopLoading,
    onLoadError,
    onLoadAbort,
    registerCancelCallback,
    inspectorAdapters,
  }: {
    dataRequestId: string;
    dynamicStyleProps: Array<IDynamicStyleProperty<DynamicStylePropertyOptions>>;
    source: IVectorSource | IJoinSource;
    sourceQuery?: Query;
    style: IVectorStyle;
  } & DataRequestContext) {
    if (!hasESSourceMethod(source, 'loadStylePropsMeta') || dynamicStyleProps.length === 0) {
      return;
    }

    const dynamicStyleFields = dynamicStyleProps.map((dynamicStyleProp) => {
      return `${dynamicStyleProp.getFieldName()}${dynamicStyleProp.getStyleMetaHash()}`;
    });

    const nextMeta = {
      dynamicStyleFields: _.uniq(dynamicStyleFields).sort(),
      sourceQuery,
      isTimeAware: this.getCurrentStyle().isTimeAware() && (await source.isTimeAware()),
      timeFilters: dataFilters.timeFilters,
      searchSessionId: dataFilters.searchSessionId,
    } as VectorStyleRequestMeta;
    const prevDataRequest = this.getDataRequest(dataRequestId);
    const canSkipFetch = canSkipStyleMetaUpdate({ prevDataRequest, nextMeta });
    if (canSkipFetch) {
      return;
    }

    const requestToken = Symbol(`layer-${this.getId()}-${dataRequestId}`);
    try {
      startLoading(dataRequestId, requestToken, nextMeta);
      const layerName = await this.getDisplayName(source);

      const { styleMeta, warnings } = await source.loadStylePropsMeta({
        layerName,
        style,
        dynamicStyleProps,
        registerCancelCallback: registerCancelCallback.bind(null, requestToken),
        sourceQuery: nextMeta.sourceQuery,
        timeFilters: nextMeta.timeFilters,
        searchSessionId: dataFilters.searchSessionId,
        inspectorAdapters,
        executionContext: dataFilters.executionContext,
      });

      stopLoading(dataRequestId, requestToken, styleMeta, { ...nextMeta, warnings });
    } catch (error) {
      if (error instanceof DataRequestAbortError) {
        onLoadAbort(dataRequestId, requestToken);
      } else {
        onLoadError(dataRequestId, requestToken, error);
      }
      throw error;
    }
  }

  async _syncSourceFormatters(
    syncContext: DataRequestContext,
    source: IVectorSource,
    style: IVectorStyle
  ) {
    return this._syncFormatters({
      source,
      dataRequestId: SOURCE_FORMATTERS_DATA_REQUEST_ID,
      fields: style
        .getDynamicPropertiesArray()
        .filter((dynamicStyleProp) => {
          return dynamicStyleProp.getFieldOrigin() === FIELD_ORIGIN.SOURCE;
        })
        .map((dynamicStyleProp) => {
          return dynamicStyleProp.getField()!;
        }),
      ...syncContext,
    });
  }

  async _syncFormatters({
    source,
    dataRequestId,
    fields,
    startLoading,
    stopLoading,
    onLoadError,
  }: {
    dataRequestId: string;
    fields: IField[];
    source: IVectorSource | IJoinSource;
  } & DataRequestContext) {
    if (fields.length === 0) {
      return;
    }

    const fieldNames = fields.map((field) => {
      return field.getName();
    });
    const nextMeta = {
      fieldNames: _.uniq(fieldNames).sort(),
    };
    const prevDataRequest = this.getDataRequest(dataRequestId);
    const canSkipUpdate = canSkipFormattersUpdate({ prevDataRequest, nextMeta });
    if (canSkipUpdate) {
      return;
    }

    const requestToken = Symbol(`layer-${this.getId()}-${dataRequestId}`);
    try {
      startLoading(dataRequestId, requestToken, nextMeta);

      const formatters: { [key: string]: FieldFormatter | null } = {};
      const promises = fields
        .filter((field) => {
          return field.canValueBeFormatted();
        })
        .map(async (field) => {
          formatters[field.getName()] = await source.createFieldFormatter(field);
        });
      await Promise.all(promises);

      stopLoading(dataRequestId, requestToken, formatters, nextMeta);
    } catch (error) {
      onLoadError(dataRequestId, requestToken, error);
      throw error;
    }
  }

  async _syncJoin({
    join,
    joinIndex,
    featureCollection,
    startLoading,
    stopLoading,
    onLoadError,
    onLoadAbort,
    registerCancelCallback,
    dataFilters,
    isForceRefresh,
    isFeatureEditorOpenForLayer,
    inspectorAdapters,
  }: {
    join: InnerJoin;
    joinIndex: number;
    featureCollection?: FeatureCollection;
  } & DataRequestContext): Promise<JoinState> {
    const joinSource = join.getRightJoinSource();
    const sourceDataId = join.getSourceDataRequestId();
    const requestToken = Symbol(`layer-join-refresh:${this.getId()} - ${sourceDataId}`);

    const joinRequestMeta = buildVectorRequestMeta(
      joinSource,
      [], // fieldNames is empty because join sources only support metrics
      dataFilters,
      joinSource.getWhereQuery(),
      isForceRefresh,
      isFeatureEditorOpenForLayer
    );

    const prevDataRequest = this.getDataRequest(sourceDataId);
    const canSkipFetch = await canSkipSourceUpdate({
      source: joinSource,
      prevDataRequest,
      nextRequestMeta: joinRequestMeta,
      extentAware: false, // join-sources are spatially unaware. For spatial joins, spatial constraints are from vector source feature geometry and not map extent geometry
      getUpdateDueToTimeslice: () => {
        return true;
      },
    });

    if (canSkipFetch) {
      return {
        dataHasChanged: false,
        join,
        joinIndex,
        joinMetrics: prevDataRequest?.getData() as PropertiesMap,
      };
    }

    try {
      startLoading(sourceDataId, requestToken, joinRequestMeta);
      const { joinMetrics, warnings } = await joinSource.getJoinMetrics(
        joinRequestMeta,
        await this.getDisplayName(),
        registerCancelCallback.bind(null, requestToken),
        inspectorAdapters,
        featureCollection
      );
      stopLoading(sourceDataId, requestToken, joinMetrics, { warnings });
      return {
        dataHasChanged: true,
        join,
        joinIndex,
        joinMetrics,
      };
    } catch (error) {
      if (error instanceof DataRequestAbortError) {
        onLoadAbort(sourceDataId, requestToken);
      } else {
        onLoadError(sourceDataId, requestToken, error);
      }
      throw error;
    }
  }

  async _syncJoins(
    syncContext: DataRequestContext,
    style: IVectorStyle,
    featureCollection?: FeatureCollection
  ): Promise<JoinState[]> {
    const joinsWithIndex = this.getJoins()
      .map((join, index) => {
        return {
          join,
          joinIndex: index,
        };
      })
      .filter(({ join }) => {
        return join.hasCompleteConfig();
      });

    const joinStates: JoinState[] = [];
    await asyncForEach(joinsWithIndex, async ({ join, joinIndex }) => {
      await this._syncJoinStyleMeta(syncContext, join, style);
      await this._syncJoinFormatters(syncContext, join, style);
      const joinState = await this._syncJoin({
        join,
        joinIndex,
        featureCollection,
        ...syncContext,
      });
      joinStates.push(joinState);
    });
    return joinStates;
  }

  async _syncJoinStyleMeta(syncContext: DataRequestContext, join: InnerJoin, style: IVectorStyle) {
    const joinSource = join.getRightJoinSource();
    return this._syncStyleMeta({
      source: joinSource,
      style,
      sourceQuery: joinSource.getWhereQuery(),
      dataRequestId: join.getSourceMetaDataRequestId(),
      dynamicStyleProps: this.getCurrentStyle()
        .getDynamicPropertiesArray()
        .filter((dynamicStyleProp) => {
          const matchingField = joinSource.getFieldByName(dynamicStyleProp.getFieldName());
          return (
            dynamicStyleProp.getFieldOrigin() === FIELD_ORIGIN.JOIN &&
            !!matchingField &&
            dynamicStyleProp.isFieldMetaEnabled()
          );
        }),
      ...syncContext,
    });
  }

  async _syncJoinFormatters(syncContext: DataRequestContext, join: InnerJoin, style: IVectorStyle) {
    const joinSource = join.getRightJoinSource();
    return this._syncFormatters({
      source: joinSource,
      dataRequestId: join.getSourceFormattersDataRequestId(),
      fields: style
        .getDynamicPropertiesArray()
        .filter((dynamicStyleProp) => {
          const matchingField = joinSource.getFieldByName(dynamicStyleProp.getFieldName());
          return dynamicStyleProp.getFieldOrigin() === FIELD_ORIGIN.JOIN && !!matchingField;
        })
        .map((dynamicStyleProp) => {
          return dynamicStyleProp.getField()!;
        }),
      ...syncContext,
    });
  }

  async _syncSupportsFeatureEditing({
    syncContext,
    source,
  }: {
    syncContext: DataRequestContext;
    source: IVectorSource;
  }) {
    if (syncContext.dataFilters.isReadOnly) {
      return;
    }
    const { startLoading, stopLoading, onLoadError } = syncContext;
    const dataRequestId = SUPPORTS_FEATURE_EDITING_REQUEST_ID;
    const requestToken = Symbol(`layer-${this.getId()}-${dataRequestId}`);
    const prevDataRequest = this.getDataRequest(dataRequestId);
    if (prevDataRequest) {
      return;
    }
    try {
      startLoading(dataRequestId, requestToken);
      const supportsFeatureEditing = await source.supportsFeatureEditing();
      stopLoading(dataRequestId, requestToken, { supportsFeatureEditing });
    } catch (error) {
      onLoadError(dataRequestId, requestToken, error);
      throw error;
    }
  }

  _getJoinFilterExpression(): FilterSpecification | undefined {
    return undefined;
  }

  _createMasks() {
    const masks: Mask[] = [];
    const source = this.getSource();
    if ('getMetricFields' in (source as IESAggSource)) {
      const metricFields = (source as IESAggSource).getMetricFields();
      metricFields.forEach((metricField) => {
        const maskDescriptor = metricField.getMask();
        if (maskDescriptor) {
          masks.push(
            new Mask({
              esAggField: metricField,
              isGeometrySourceMvt: source.isMvt(),
              ...maskDescriptor,
            })
          );
        }
      });
    }

    this.getValidJoins().forEach((join) => {
      const rightSource = join.getRightJoinSource();
      if ('getMetricFields' in (rightSource as unknown as IESAggSource)) {
        const metricFields = (rightSource as unknown as IESAggSource).getMetricFields();
        metricFields.forEach((metricField) => {
          const maskDescriptor = metricField.getMask();
          if (maskDescriptor) {
            masks.push(
              new Mask({
                esAggField: metricField,
                isGeometrySourceMvt: source.isMvt(),
                ...maskDescriptor,
              })
            );
          }
        });
      }
    });

    return masks;
  }

  getMasks() {
    return this._masks;
  }

  // feature-state is not supported in filter expressions
  // https://github.com/mapbox/mapbox-gl-js/issues/8487
  // therefore, masking must be accomplished via setting opacity paint property (hack)
  _getAlphaExpression() {
    const maskCaseExpressions: unknown[] = [];
    this.getMasks().forEach((mask) => {
      // case expressions require 2 parts
      // 1) condition expression
      maskCaseExpressions.push(mask.getMatchMaskedExpression());
      // 2) output. 0 opacity styling "hides" feature
      maskCaseExpressions.push(0);
    });

    return maskCaseExpressions.length
      ? ['case', ...maskCaseExpressions, this.getAlpha()]
      : this.getAlpha();
  }

  _setMbPointsProperties(
    mbMap: MbMap,
    mvtSourceLayer?: string,
    timesliceMaskConfig?: TimesliceMaskConfig
  ) {
    const sourceId = this.getId();
    const labelLayerId = this._getMbLabelLayerId();
    const pointLayerId = this._getMbPointLayerId();
    const symbolLayerId = this._getMbSymbolLayerId();
    const pointLayer = mbMap.getLayer(pointLayerId);
    const symbolLayer = mbMap.getLayer(symbolLayerId);

    //
    // Create marker layer
    // "circle" layer type for points
    // "symbol" layer type for icons
    //
    let markerLayerId;
    if (this.getCurrentStyle().arePointsSymbolizedAsCircles()) {
      markerLayerId = pointLayerId;
      if (!pointLayer) {
        const mbLayer: LayerSpecification = {
          id: pointLayerId,
          type: 'circle',
          source: sourceId,
          paint: {},
        };

        if (mvtSourceLayer) {
          mbLayer['source-layer'] = mvtSourceLayer;
        }
        mbMap.addLayer(mbLayer, labelLayerId);
      }
      if (symbolLayer) {
        mbMap.setLayoutProperty(symbolLayerId, 'visibility', 'none');
      }
    } else {
      markerLayerId = symbolLayerId;
      if (!symbolLayer) {
        const mbLayer: LayerSpecification = {
          id: symbolLayerId,
          type: 'symbol',
          source: sourceId,
        };
        if (mvtSourceLayer) {
          mbLayer['source-layer'] = mvtSourceLayer;
        }
        mbMap.addLayer(mbLayer, labelLayerId);
      }
      if (pointLayer) {
        mbMap.setLayoutProperty(pointLayerId, 'visibility', 'none');
      }
    }

    const isSourceGeoJson = !this.getSource().isMvt();
    const filterExpr = getPointFilterExpression(
      isSourceGeoJson,
      isESVectorTileSource(this.getSource()),
      this._getJoinFilterExpression(),
      timesliceMaskConfig
    );
    if (!_.isEqual(filterExpr, mbMap.getFilter(markerLayerId))) {
      mbMap.setFilter(markerLayerId, filterExpr);
    }

    if (this.getCurrentStyle().arePointsSymbolizedAsCircles()) {
      this.getCurrentStyle().setMBPaintPropertiesForPoints({
        alpha: this._getAlphaExpression(),
        mbMap,
        pointLayerId: markerLayerId,
      });
    } else {
      this.getCurrentStyle().setMBSymbolPropertiesForPoints({
        alpha: this._getAlphaExpression(),
        mbMap,
        symbolLayerId: markerLayerId,
      });
    }

    this.syncVisibilityWithMb(mbMap, markerLayerId);
    mbMap.setLayerZoomRange(markerLayerId, this.getMinZoom(), this.getMaxZoom());
  }

  _setMbLinePolygonProperties(
    mbMap: MbMap,
    mvtSourceLayer?: string,
    timesliceMaskConfig?: TimesliceMaskConfig
  ) {
    const sourceId = this.getId();
    const labelLayerId = this._getMbLabelLayerId();
    const fillLayerId = this._getMbPolygonLayerId();
    const lineLayerId = this._getMbLineLayerId();

    if (!mbMap.getLayer(fillLayerId)) {
      const mbLayer: LayerSpecification = {
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {},
      };
      if (mvtSourceLayer) {
        mbLayer['source-layer'] = mvtSourceLayer;
      }
      mbMap.addLayer(mbLayer, labelLayerId);
    }
    if (!mbMap.getLayer(lineLayerId)) {
      const mbLayer: LayerSpecification = {
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {},
      };
      if (mvtSourceLayer) {
        mbLayer['source-layer'] = mvtSourceLayer;
      }
      mbMap.addLayer(mbLayer, labelLayerId);
    }

    this.getCurrentStyle().setMBPaintProperties({
      alpha: this._getAlphaExpression(),
      mbMap,
      fillLayerId,
      lineLayerId,
    });

    const joinFilter = this._getJoinFilterExpression();

    this.syncVisibilityWithMb(mbMap, fillLayerId);
    mbMap.setLayerZoomRange(fillLayerId, this.getMinZoom(), this.getMaxZoom());
    const fillFilterExpr = getFillFilterExpression(joinFilter, timesliceMaskConfig);
    if (!_.isEqual(fillFilterExpr, mbMap.getFilter(fillLayerId))) {
      mbMap.setFilter(fillLayerId, fillFilterExpr);
    }

    this.syncVisibilityWithMb(mbMap, lineLayerId);
    mbMap.setLayerZoomRange(lineLayerId, this.getMinZoom(), this.getMaxZoom());
    const lineFilterExpr = getLineFilterExpression(joinFilter, timesliceMaskConfig);
    if (!_.isEqual(lineFilterExpr, mbMap.getFilter(lineLayerId))) {
      mbMap.setFilter(lineLayerId, lineFilterExpr);
    }
  }

  _setMbLabelProperties(
    mbMap: MbMap,
    mvtSourceLayer?: string,
    timesliceMaskConfig?: TimesliceMaskConfig
  ) {
    const labelLayerId = this._getMbLabelLayerId();
    const labelLayer = mbMap.getLayer(labelLayerId);
    if (!labelLayer) {
      const mbLayer: LayerSpecification = {
        id: labelLayerId,
        type: 'symbol',
        source: this.getId(),
      };
      if (mvtSourceLayer) {
        mbLayer['source-layer'] = mvtSourceLayer;
      }
      mbMap.addLayer(mbLayer);
    }

    const isSourceGeoJson = !this.getSource().isMvt();
    const filterExpr = getLabelFilterExpression(
      isSourceGeoJson,
      isESVectorTileSource(this.getSource()),
      this._getJoinFilterExpression(),
      timesliceMaskConfig
    );
    if (!_.isEqual(filterExpr, mbMap.getFilter(labelLayerId))) {
      mbMap.setFilter(labelLayerId, filterExpr);
    }

    this.getCurrentStyle().setMBPropertiesForLabelText({
      alpha: this._getAlphaExpression(),
      mbMap,
      textLayerId: labelLayerId,
    });

    this.syncVisibilityWithMb(mbMap, labelLayerId);
  }

  _getMbPointLayerId() {
    return this.makeMbLayerId('circle');
  }

  _getMbLabelLayerId() {
    return this.makeMbLayerId('label');
  }

  _getMbSymbolLayerId() {
    return this.makeMbLayerId('symbol');
  }

  _getMbLineLayerId() {
    return this.makeMbLayerId('line');
  }

  _getMbPolygonLayerId() {
    return this.makeMbLayerId('fill');
  }

  getMbTooltipLayerIds() {
    return [
      this._getMbPointLayerId(),
      this._getMbLabelLayerId(),
      this._getMbSymbolLayerId(),
      this._getMbLineLayerId(),
      this._getMbPolygonLayerId(),
    ];
  }

  getMbLayerIds() {
    return this.getMbTooltipLayerIds();
  }

  ownsMbLayerId(mbLayerId: string) {
    return this.getMbLayerIds().includes(mbLayerId);
  }

  ownsMbSourceId(mbSourceId: string) {
    return this.getId() === mbSourceId;
  }

  /*
   * Replaces source property tooltips with join property tooltips
   * join property tooltips allow tooltips to
   *  1) Create filter from right source context
   *  2) Display tooltip with right source context
   */
  _addJoinsToSourceTooltips(tooltipsFromSource: ITooltipProperty[]) {
    for (let i = 0; i < tooltipsFromSource.length; i++) {
      const tooltipProperty = tooltipsFromSource[i];
      const matchingTermJoins: ITermJoinSource[] = [];
      for (let j = 0; j < this.getJoins().length; j++) {
        const join = this.getJoins()[j];
        const joinRightSource = join.getRightJoinSource();
        if (
          isTermJoinSource(joinRightSource) &&
          this.getJoins()[j].getLeftField().getName() === tooltipProperty.getPropertyKey()
        ) {
          matchingTermJoins.push(joinRightSource as ITermJoinSource);
        }
      }
      if (matchingTermJoins.length) {
        tooltipsFromSource[i] = new TermJoinTooltipProperty(tooltipProperty, matchingTermJoins);
      }
    }
  }

  async getPropertiesForTooltip(
    properties: GeoJsonProperties,
    executionContext: KibanaExecutionContext
  ) {
    const vectorSource = this.getSource();
    let allProperties = await vectorSource.getTooltipProperties(properties, executionContext);
    this._addJoinsToSourceTooltips(allProperties);

    for (let i = 0; i < this.getJoins().length; i++) {
      const propsFromJoin = await this.getJoins()[i].getTooltipProperties(
        properties,
        executionContext
      );
      allProperties = [...allProperties, ...propsFromJoin];
    }
    return allProperties;
  }

  /**
   * Check if there are any properties we can display in a tooltip. If `false` the "Show tooltips" switch
   * is disabled in Layer settings.
   * @returns {boolean}
   */
  canShowTooltip() {
    return this.getSource().hasTooltipProperties() || this.getJoins().length > 0;
  }

  /**
   * Users can toggle tooltips on hover or click in the Layer settings. Tooltips are enabled by default.
   * @returns {boolean}
   */
  areTooltipsDisabled(): boolean {
    return this._descriptor.disableTooltips ?? false;
  }

  getFeatureId(feature: Feature): string | number | undefined {
    throw new Error('Should implement AbstractVectorLayer#getFeatureId');
  }

  getFeatureById(id: string | number): Feature | null {
    throw new Error('Should implement AbstractVectorLayer#getFeatureById');
  }

  async getLicensedFeatures() {
    return await this._source.getLicensedFeatures();
  }

  async addFeature(geometry: Geometry | Position[]) {
    const layerSource = this.getSource();
    await layerSource.addFeature(geometry);
  }

  async deleteFeature(featureId: string) {
    const layerSource = this.getSource();
    await layerSource.deleteFeature(featureId);
  }

  async getStyleMetaDescriptorFromLocalFeatures(): Promise<StyleMetaDescriptor | null> {
    throw new Error('Should implement AbstractVectorLayer#getStyleMetaDescriptorFromLocalFeatures');
  }
}
