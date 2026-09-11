/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { DatatableUtilitiesService } from '@kbn/data-plugin/common';
import { AnnotationEditorControls } from '@kbn/event-annotation-components';
import type { EventAnnotationConfig } from '@kbn/event-annotation-common';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { DataViewsPublicPluginStart, DataView } from '@kbn/data-views-plugin/public';
import moment from 'moment';
import { search } from '@kbn/data-plugin/public';
import type {
  LensAppServices,
  FramePublicAPI,
  VisualizationDimensionEditorProps,
  XYVisualizationState,
  XYAnnotationLayerConfig,
  XYDataLayerConfig,
} from '@kbn/lens-common';
import { LENS_APP_NAME } from '../../../../../common/constants';
import { DONT_CLOSE_DIMENSION_CONTAINER_ON_CLICK_CLASS, isEsqlChart } from '../../../../utils';
import { updateLayer } from '../../toolbar';
import { isDataLayer } from '../../visualization_helpers';

export const AnnotationsPanel = (
  props: VisualizationDimensionEditorProps<XYVisualizationState> & {
    datatableUtilities: DatatableUtilitiesService;
    dataViewsService: DataViewsPublicPluginStart;
  }
) => {
  const { state, setState, layerId, accessor, frame } = props;

  // we don't listen to the state prop after the initial render, because we don't want to
  // slow the annotation settings UI updates down on a full Redux state update
  const [localState, setLocalState] = useState<XYVisualizationState>(state);

  const index = localState.layers.findIndex((l) => l.layerId === layerId);
  const localLayer = localState.layers.find(
    (l) => l.layerId === layerId
  ) as XYAnnotationLayerConfig;

  const currentAnnotation = localLayer.annotations?.find((c) => c.id === accessor);

  const setAnnotation = useCallback(
    (annotation: EventAnnotationConfig) => {
      if (annotation == null) {
        return;
      }
      const newConfigs = [...(localLayer.annotations || [])];
      const existingIndex = newConfigs.findIndex((c) => c.id === accessor);
      if (existingIndex !== -1) {
        newConfigs[existingIndex] = annotation;
      } else {
        throw new Error(
          'should never happen because annotation is created before config panel is opened'
        );
      }

      const newState = updateLayer(localState, { ...localLayer, annotations: newConfigs }, index);

      setLocalState(newState); // keep track up updates for controls state
      setState(newState); // notify the rest of the world, but don't wait
    },
    [localLayer, localState, index, setState, accessor]
  );

  // ES|QL charts do not expose data views: restrict the editor to manual annotations
  const hideQueryBasedControls = isEsqlChart(frame.datasourceLayers);

  const [currentDataView, setCurrentDataView] = useState<DataView>();

  useEffect(() => {
    const updateDataView = async () => {
      let dataView: DataView | undefined;
      const availableIds = await props.dataViewsService.getIds();
      if (availableIds.includes(localLayer.indexPatternId)) {
        dataView = await props.dataViewsService.get(localLayer.indexPatternId);
      } else {
        const spec = frame.dataViews.indexPatterns[localLayer.indexPatternId]?.spec;
        if (spec) {
          dataView = await props.dataViewsService.create(spec);
        }
      }
      setCurrentDataView(dataView);
    };

    updateDataView();
  }, [frame.dataViews.indexPatterns, localLayer.indexPatternId, props.dataViewsService]);

  const queryInputServices = useKibana<LensAppServices>().services;

  if (!currentAnnotation) {
    throw new Error('Annotation not found... this should never happen!');
  }

  return currentDataView || hideQueryBasedControls ? (
    <div className="lnsIndexPatternDimensionEditor--padded">
      <AnnotationEditorControls
        annotation={currentAnnotation}
        onAnnotationChange={(newAnnotation) => setAnnotation(newAnnotation)}
        dataView={currentDataView}
        hideQueryBasedControls={hideQueryBasedControls}
        getDefaultRangeEnd={(rangeStart) =>
          getEndTimestamp(
            props.datatableUtilities,
            rangeStart,
            frame,
            localState.layers.filter(isDataLayer)
          )
        }
        queryInputServices={queryInputServices}
        calendarClassName={DONT_CLOSE_DIMENSION_CONTAINER_ON_CLICK_CLASS}
        appName={LENS_APP_NAME}
      />
    </div>
  ) : null;
};

const getEndTimestamp = (
  datatableUtilities: DatatableUtilitiesService,
  startTime: string,
  { activeData, absDateRange }: FramePublicAPI,
  dataLayers: XYDataLayerConfig[]
) => {
  const startTimeNumber = moment(startTime).valueOf();
  const dateRangeFraction =
    (moment(absDateRange.toDate).valueOf() - moment(absDateRange.fromDate).valueOf()) * 0.1;
  const fallbackValue = moment(startTimeNumber + dateRangeFraction).toISOString();
  const dataLayersId = dataLayers.map(({ layerId }) => layerId);
  if (
    !dataLayersId.length ||
    !activeData ||
    Object.entries(activeData)
      .filter(([key]) => dataLayersId.includes(key))
      .every(([, { rows }]) => !rows || !rows.length)
  ) {
    return fallbackValue;
  }
  const xColumn = activeData?.[dataLayersId[0]].columns.find(
    (column) => column.id === dataLayers[0].xAccessor
  );
  if (!xColumn) {
    return fallbackValue;
  }

  const dateInterval = datatableUtilities.getDateHistogramMeta(xColumn)?.interval;
  if (!dateInterval) return fallbackValue;
  const intervalDuration = search.aggs.parseInterval(dateInterval);
  if (!intervalDuration) return fallbackValue;
  return moment(startTimeNumber + 3 * intervalDuration.as('milliseconds')).toISOString();
};
