/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { i18n } from '@kbn/i18n';
import type { CoreTheme, ThemeServiceStart } from '@kbn/core/public';
import { VIS_EVENT_TO_TRIGGER } from '@kbn/visualizations-plugin/public';
import type { ExpressionTagcloudFunctionDefinition } from '@kbn/expression-tagcloud-plugin/common';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { ExpressionFunctionTheme } from '@kbn/expressions-plugin/common';
import { buildExpression, buildExpressionFunction } from '@kbn/expressions-plugin/common';
import type { PaletteRegistry } from '@kbn/coloring';
import { getColorsFromMapping } from '@kbn/coloring';
import { IconChartTagcloud } from '@kbn/chart-icons';
import type { SystemPaletteExpressionFunctionDefinition } from '@kbn/charts-plugin/common';
import useObservable from 'react-use/lib/useObservable';
import { getKbnPalettes } from '@kbn/palettes';
import type { FormatFactory } from '@kbn/visualization-ui-components';
import { LENS_TAGCLOUD_ID } from '@kbn/lens-common';
import type { OperationMetadata, Visualization } from '../..';
import { getColorMappingDefaults } from '../../utils';
import type { TagcloudState } from './types';
import { getSuggestions } from './suggestions';
import { TagsDimensionEditor } from './tags_dimension_editor';
import { DEFAULT_STATE, TAGCLOUD_LABEL } from './constants';
import { getColorMappingTelemetryEvents } from '../../lens_ui_telemetry/color_telemetry_helpers';
import { convertToRuntimeState } from './runtime_state';
import { FlyoutToolbar } from '../../shared_components/flyout_toolbar';
import { TagcloudAppearanceSettings } from './tagcloud_toolbar';

const TAG_GROUP_ID = 'tags';
const METRIC_GROUP_ID = 'metric';

export const getTagcloudVisualization = ({
  paletteService,
  kibanaTheme,
  formatFactory,
}: {
  paletteService: PaletteRegistry;
  kibanaTheme: ThemeServiceStart;
  formatFactory: FormatFactory;
}): Visualization<TagcloudState> => ({
  id: LENS_TAGCLOUD_ID,

  getVisualizationTypeId() {
    return this.id;
  },
  visualizationTypes: [
    {
      id: LENS_TAGCLOUD_ID,
      icon: IconChartTagcloud,
      label: TAGCLOUD_LABEL,
      sortPriority: 12,
      description: i18n.translate('xpack.lens.tagcloud.visualizationDescription', {
        defaultMessage: 'Visualize text data frequency or importance.',
      }),
    },
  ],

  clearLayer(state) {
    const newState = {
      ...state,
      ...DEFAULT_STATE,
    };
    delete newState.tagAccessor;
    delete newState.valueAccessor;
    delete newState.palette;
    return newState;
  },

  getLayerIds(state) {
    return [state.layerId];
  },

  getDescription() {
    return {
      icon: IconChartTagcloud,
      label: TAGCLOUD_LABEL,
    };
  },

  getSuggestions,

  getSuggestionFromConvertToLensContext({ suggestions, context }) {
    return !suggestions.length
      ? undefined
      : {
          ...suggestions[0],
          visualizationState: {
            ...(suggestions[0].visualizationState as TagcloudState),
            ...(context.configuration as unknown as TagcloudState),
          },
        };
  },
  getMainPalette: (state) => {
    if (!state) return;

    return state.colorMapping
      ? { type: 'colorMapping', value: state.colorMapping }
      : state.palette
      ? { type: 'legacyPalette', value: state.palette }
      : undefined;
  },

  triggers: [VIS_EVENT_TO_TRIGGER.filter],

  initialize(addNewLayer, state, mainPalette, datasourceStates) {
    if (state) return convertToRuntimeState(state, datasourceStates);

    return {
      layerId: addNewLayer(),
      layerType: LayerTypes.DATA,
      ...DEFAULT_STATE,
      colorMapping:
        mainPalette?.type === 'colorMapping' ? mainPalette.value : getColorMappingDefaults(),
    };
  },

  convertToRuntimeState(state, datasourceStates) {
    return convertToRuntimeState(state, datasourceStates);
  },

  getConfiguration({ state }) {
    const canUseColorMapping = state.colorMapping ? true : false;
    let colors: string[] = [];
    if (canUseColorMapping) {
      kibanaTheme.theme$
        .subscribe({
          next(theme) {
            const palettes = getKbnPalettes(theme);
            colors = getColorsFromMapping(palettes, theme.darkMode, state.colorMapping);
          },
        })
        .unsubscribe();
    } else {
      colors = paletteService
        .get(state.palette?.name || 'default')
        .getCategoricalColors(10, state.palette?.params);
    }
    return {
      groups: [
        {
          groupId: TAG_GROUP_ID,
          groupLabel: i18n.translate('xpack.lens.tagcloud.tagLabel', {
            defaultMessage: 'Tags',
          }),
          layerId: state.layerId,
          accessors: state.tagAccessor
            ? [
                {
                  columnId: state.tagAccessor,
                  triggerIconType: 'colorBy',
                  palette: colors,
                },
              ]
            : [],
          supportsMoreColumns: !state.tagAccessor,
          filterOperations: (op: OperationMetadata) => op.isBucketed,
          enableDimensionEditor: true,
          required: true,
          requiredMinDimensionCount: 1,
          dataTestSubj: 'lnsTagcloud_tagDimensionPanel',
        },
        {
          groupId: METRIC_GROUP_ID,
          groupLabel: i18n.translate('xpack.lens.tagcloud.metricValueLabel', {
            defaultMessage: 'Metric',
          }),
          isMetricDimension: true,
          layerId: state.layerId,
          accessors: state.valueAccessor ? [{ columnId: state.valueAccessor }] : [],
          supportsMoreColumns: !state.valueAccessor,
          filterOperations: (op: OperationMetadata) => !op.isBucketed && op.dataType === 'number',
          enableDimensionEditor: true,
          required: true,
          requiredMinDimensionCount: 1,
          dataTestSubj: 'lnsTagcloud_valueDimensionPanel',
        },
      ],
    };
  },

  getSupportedLayers() {
    return [
      {
        type: LayerTypes.DATA,
        label: i18n.translate('xpack.lens.tagcloud.addLayer', {
          defaultMessage: 'Add visualization layer',
        }),
      },
    ];
  },

  getLayerType(layerId, state) {
    if (state?.layerId === layerId) {
      return LayerTypes.DATA;
    }
  },

  toExpression: (state, datasourceLayers, attributes, datasourceExpressionsByLayers = {}) => {
    if (!state.tagAccessor || !state.valueAccessor) {
      return null;
    }

    const datasourceExpression = datasourceExpressionsByLayers[state.layerId];
    return {
      type: 'expression',
      chain: [
        ...(datasourceExpression ? datasourceExpression.chain : []),
        buildExpressionFunction<ExpressionTagcloudFunctionDefinition>('tagcloud', {
          bucket: state.tagAccessor,
          metric: state.valueAccessor,
          maxFontSize: state.maxFontSize,
          minFontSize: state.minFontSize,
          orientation: state.orientation,
          palette: buildExpression([
            state.palette
              ? buildExpressionFunction<ExpressionFunctionTheme>('theme', {
                  variable: 'palette',
                  default: [
                    paletteService.get(state.palette.name).toExpression(state.palette.params),
                  ],
                })
              : buildExpressionFunction<SystemPaletteExpressionFunctionDefinition>(
                  'system_palette',
                  {
                    name: 'default',
                  }
                ),
          ]).toAst(),
          showLabel: state.showLabel,
          colorMapping: state.colorMapping ? JSON.stringify(state.colorMapping) : undefined,
        }).toAst(),
      ],
    };
  },

  toPreviewExpression: (state, datasourceLayers, datasourceExpressionsByLayers = {}) => {
    if (!state.tagAccessor || !state.valueAccessor) {
      return null;
    }

    const datasourceExpression = datasourceExpressionsByLayers[state.layerId];
    return {
      type: 'expression',
      chain: [
        ...(datasourceExpression ? datasourceExpression.chain : []),
        buildExpressionFunction<ExpressionTagcloudFunctionDefinition>('tagcloud', {
          bucket: state.tagAccessor,
          isPreview: true,
          metric: state.valueAccessor,
          maxFontSize: 18,
          minFontSize: 4,
          orientation: state.orientation,
          palette: buildExpression([
            state.palette
              ? buildExpressionFunction<ExpressionFunctionTheme>('theme', {
                  variable: 'palette',
                  default: [
                    paletteService.get(state.palette.name).toExpression(state.palette.params),
                  ],
                })
              : buildExpressionFunction<SystemPaletteExpressionFunctionDefinition>(
                  'system_palette',
                  {
                    name: 'default',
                  }
                ),
          ]).toAst(),
          showLabel: false,
          colorMapping: state.colorMapping ? JSON.stringify(state.colorMapping) : undefined,
        }).toAst(),
      ],
    };
  },

  setDimension({ columnId, groupId, prevState }) {
    const update: Partial<TagcloudState> = {};
    if (groupId === TAG_GROUP_ID) {
      update.tagAccessor = columnId;
    } else if (groupId === METRIC_GROUP_ID) {
      update.valueAccessor = columnId;
    }
    return {
      ...prevState,
      ...update,
    };
  },

  removeDimension({ prevState, layerId, columnId }) {
    const update = { ...prevState };

    if (prevState.tagAccessor === columnId) {
      delete update.tagAccessor;
    } else if (prevState.valueAccessor === columnId) {
      delete update.valueAccessor;
    }

    return update;
  },

  DimensionEditorComponent(props) {
    const theme = useObservable<CoreTheme>(kibanaTheme.theme$, kibanaTheme.getTheme());
    const palettes = getKbnPalettes(theme);

    if (props.groupId === TAG_GROUP_ID) {
      return (
        <TagsDimensionEditor
          isDarkMode={theme.darkMode}
          palettes={palettes}
          state={props.state}
          setState={props.setState}
          frame={props.frame}
          panelRef={props.panelRef}
          isInlineEditing={props.isInlineEditing}
          paletteService={paletteService}
          formatFactory={formatFactory}
        />
      );
    }
    return null;
  },

  FlyoutToolbarComponent(props) {
    return <FlyoutToolbar {...props} contentMap={{ style: TagcloudAppearanceSettings }} />;
  },

  getTelemetryEventsOnSave(state, prevState) {
    return getColorMappingTelemetryEvents(state?.colorMapping, prevState?.colorMapping);
  },
});
