/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_DATASOURCE_ID } from '@kbn/lens-common';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { euiThemeVars } from '@kbn/ui-theme';
import type { Ast } from '@kbn/interpreter';
import type { PaletteOutput, PaletteRegistry } from '@kbn/coloring';
import { CUSTOM_PALETTE, getOverridePaletteStops } from '@kbn/coloring';
import type { CustomPaletteState } from '@kbn/charts-plugin/common';
import { ColorMode } from '@kbn/charts-plugin/common';
import { VIS_EVENT_TO_TRIGGER } from '@kbn/visualizations-plugin/public';
import { IconChartMetric } from '@kbn/chart-icons';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type {
  ExpressionFunctionFont,
  FontWeight,
  TextAlignment,
} from '@kbn/expressions-plugin/common';
import { buildExpression, buildExpressionFunction } from '@kbn/expressions-plugin/common';
import type { ExpressionFunctionVisDimension } from '@kbn/visualizations-plugin/common';
import type { MetricVisExpressionFunctionDefinition } from '@kbn/expression-legacy-metric-vis-plugin/common';
import type {
  Visualization,
  OperationMetadata,
  DatasourceLayers,
  FramePublicAPI,
  LegacyMetricState,
} from '@kbn/lens-common';
import { getSuggestions } from './metric_suggestions';
import { MetricDimensionEditor } from './dimension_editor';
import { DEFAULT_TITLE_POSITION } from './metric_config_panel/title_position_option';
import { DEFAULT_TITLE_SIZE } from './metric_config_panel/size_options';
import { DEFAULT_TEXT_ALIGNMENT } from './metric_config_panel/align_options';
import { FlyoutToolbar } from '../../shared_components/flyout_toolbar';
import { LegacyMetricTitlesAndTextSettings } from './metric_config_panel';

interface MetricConfig extends Omit<LegacyMetricState, 'palette' | 'colorMode'> {
  title: string;
  description: string;
  metricTitle: string;
  mode: 'reduced' | 'full';
  colorMode: ColorMode;
  palette: PaletteOutput<CustomPaletteState>;
}

export const legacyMetricSupportedTypes = new Set(['string', 'boolean', 'number', 'ip', 'date']);

const getFontSizeAndUnit = (fontSize: string) => {
  const [size, sizeUnit] = fontSize.split(/(\d+)/).filter(Boolean);
  return {
    size: Number(size),
    sizeUnit,
  };
};

const toExpression = (
  paletteService: PaletteRegistry,
  state: LegacyMetricState,
  datasourceLayers: DatasourceLayers,
  attributes?: Partial<Omit<MetricConfig, keyof LegacyMetricState>>,
  datasourceExpressionsByLayers: Record<string, Ast> | undefined = {}
): Ast | null => {
  if (!state.accessor) {
    return null;
  }

  const [datasource] = Object.values(datasourceLayers);
  const datasourceExpression = datasourceExpressionsByLayers[state.layerId];
  const operation = datasource && datasource.getOperationForColumnId(state.accessor);

  const stops = getOverridePaletteStops(paletteService, state.palette) ?? [];
  const isCustomPalette = state.palette?.params?.name === CUSTOM_PALETTE;

  const canColor = operation?.dataType === 'number';

  const paletteParams = {
    ...state.palette?.params,
    colors: stops.map(({ color }) => color),
    // Only custom palettes ship explicit thresholds. Named (predefined) palettes carry no
    // user-defined range, so we send empty stops and let the renderer distribute the palette
    // uniformly across the live data range (matching the metric/datatable charts).
    stops: isCustomPalette ? stops.map(({ stop }) => stop) : [],
    reverse: false,
  };

  const fontSizes: Record<string, { size: number; sizeUnit: string }> = {
    xs: getFontSizeAndUnit(euiThemeVars.euiFontSizeXS),
    s: getFontSizeAndUnit(euiThemeVars.euiFontSizeS),
    m: getFontSizeAndUnit(euiThemeVars.euiFontSizeM),
    l: getFontSizeAndUnit(euiThemeVars.euiFontSizeL),
    xl: getFontSizeAndUnit(euiThemeVars.euiFontSizeXL),
    xxl: getFontSizeAndUnit(euiThemeVars.euiFontSizeXXL),
  };

  const labelFont = fontSizes[state?.size || DEFAULT_TITLE_SIZE];
  const labelToMetricFontSizeMap: Record<string, number> = {
    xs: fontSizes.xs.size * 2,
    s: fontSizes.m.size * 2.5,
    m: fontSizes.l.size * 2.5,
    l: fontSizes.xl.size * 2.5,
    xl: fontSizes.xxl.size * 2.5,
    xxl: fontSizes.xxl.size * 3,
  };
  const metricFontSize = labelToMetricFontSizeMap[state?.size || DEFAULT_TITLE_SIZE];

  const fontFn = buildExpressionFunction<ExpressionFunctionFont>('font', {
    align: (state?.textAlign || DEFAULT_TEXT_ALIGNMENT) as TextAlignment,
    size: metricFontSize,
    weight: '600' as FontWeight,
    lHeight: metricFontSize * 1.5,
    sizeUnit: labelFont.sizeUnit,
  });

  const labelFontFn = buildExpressionFunction<ExpressionFunctionFont>('font', {
    align: (state?.textAlign || DEFAULT_TEXT_ALIGNMENT) as TextAlignment,
    size: labelFont.size,
    lHeight: labelFont.size * 1.5,
    sizeUnit: labelFont.sizeUnit,
  });

  const visdimensionFn = buildExpressionFunction<ExpressionFunctionVisDimension>('visdimension', {
    accessor: state.accessor,
  });

  const legacyMetricVisFn = buildExpressionFunction<MetricVisExpressionFunctionDefinition>(
    'legacyMetricVis',
    {
      autoScaleMetricAlignment: state?.autoScaleMetricAlignment,
      labelPosition: state?.titlePosition || DEFAULT_TITLE_POSITION,
      font: buildExpression([fontFn]),
      labelFont: buildExpression([labelFontFn]),
      metric: buildExpression([visdimensionFn]),
      showLabels: !attributes?.mode || attributes?.mode === 'full',
      colorMode: !canColor ? ColorMode.None : state?.colorMode || ColorMode.None,
      autoScale: true,
      colorFullBackground: true,
      palette:
        state?.colorMode && state?.colorMode !== ColorMode.None
          ? paletteService.get(CUSTOM_PALETTE).toExpression(paletteParams)
          : undefined,
      percentageMode: false,
    }
  );

  return {
    type: 'expression',
    chain: [...(datasourceExpression?.chain ?? []), legacyMetricVisFn.toAst()],
  };
};

export const getLegacyMetricVisualization = ({
  paletteService,
}: {
  paletteService: PaletteRegistry;
}): Visualization<LegacyMetricState> => ({
  id: 'lnsLegacyMetric',

  getVisualizationTypeId() {
    return this.id;
  },
  visualizationTypes: [
    {
      id: 'lnsLegacyMetric',
      icon: IconChartMetric,
      label: i18n.translate('xpack.lens.legacyMetric.label', {
        defaultMessage: 'Legacy Metric',
      }),
      isDeprecated: true,
      sortPriority: 100,
      description: i18n.translate('xpack.lens.legacyMetric.visualizationDescription', {
        defaultMessage: 'Present individual key metrics or KPIs.',
      }),
    },
  ],
  hideFromChartSwitch(frame: FramePublicAPI) {
    return Object.values(frame.datasourceLayers).some(
      (datasource) => datasource && datasource.datasourceId === LENS_DATASOURCE_ID.TEXT_BASED
    );
  },

  clearLayer(state) {
    return {
      ...state,
      accessor: undefined,
    };
  },

  getLayerIds(state) {
    return [state.layerId];
  },

  getDescription() {
    return {
      icon: IconChartMetric,
      label: i18n.translate('xpack.lens.legacyMetric.label', {
        defaultMessage: 'Legacy Metric',
      }),
    };
  },

  getSuggestions,

  initialize(addNewLayer, state) {
    return (
      state || {
        layerId: addNewLayer(),
        accessor: undefined,
        layerType: LayerTypes.DATA,
      }
    );
  },
  triggers: [VIS_EVENT_TO_TRIGGER.filter],

  getConfiguration(props) {
    const hasColoring = props.state.palette != null;
    const stops = getOverridePaletteStops(paletteService, props.state.palette);

    return {
      groups: [
        {
          groupId: 'metric',
          dataTestSubj: 'lnsLegacyMetric_metricDimensionPanel',
          paramEditorCustomProps: {
            headingLabel: i18n.translate('xpack.lens.metric.headingLabel', {
              defaultMessage: 'Value',
            }),
          },
          isMetricDimension: true,
          groupLabel: i18n.translate('xpack.lens.metric.label', {
            defaultMessage: 'Metric',
          }),
          layerId: props.state.layerId,
          accessors: props.state.accessor
            ? [
                {
                  columnId: props.state.accessor,
                  triggerIconType: hasColoring ? 'colorBy' : undefined,
                  palette: hasColoring ? stops?.map(({ color }) => color) : undefined,
                },
              ]
            : [],
          supportsMoreColumns: !props.state.accessor,
          filterOperations: (op: OperationMetadata) =>
            !op.isBucketed && legacyMetricSupportedTypes.has(op.dataType),
          enableDimensionEditor: true,
          requiredMinDimensionCount: 1,
        },
      ],
    };
  },

  getSupportedLayers() {
    return [
      {
        type: LayerTypes.DATA,
        label: i18n.translate('xpack.lens.legacyMetric.addLayer', {
          defaultMessage: 'Visualization',
        }),
      },
    ];
  },

  getLayerType(layerId, state) {
    if (state?.layerId === layerId) {
      return state.layerType;
    }
  },

  toExpression: (state, datasourceLayers, attributes, datasourceExpressionsByLayers) =>
    toExpression(
      paletteService,
      state,
      datasourceLayers,
      { ...attributes },
      datasourceExpressionsByLayers
    ),

  toPreviewExpression: (state, datasourceLayers, datasourceExpressionsByLayers) =>
    toExpression(
      paletteService,
      state,
      datasourceLayers,
      { mode: 'reduced' },
      datasourceExpressionsByLayers
    ),

  setDimension({ prevState, columnId }) {
    return { ...prevState, accessor: columnId };
  },

  removeDimension({ prevState }) {
    return { ...prevState, accessor: undefined, colorMode: ColorMode.None, palette: undefined };
  },

  FlyoutToolbarComponent(props) {
    return <FlyoutToolbar {...props} contentMap={{ style: LegacyMetricTitlesAndTextSettings }} />;
  },

  DimensionEditorComponent(props) {
    return <MetricDimensionEditor {...props} paletteService={paletteService} />;
  },

  getVisualizationInfo(state: LegacyMetricState) {
    const dimensions = [];
    if (state.accessor) {
      dimensions.push({
        id: state.accessor,
        name: i18n.translate('xpack.lens.metric.label', {
          defaultMessage: 'Metric',
        }),
        dimensionType: 'metric',
      });
    }

    const hasColoring = state.palette != null;
    const stops = getOverridePaletteStops(paletteService, state.palette);

    return {
      layers: [
        {
          layerId: state.layerId,
          layerType: state.layerType,
          chartType: 'metric',
          ...this.getDescription(state),
          dimensions,
          palette: hasColoring ? stops?.map(({ color }) => color) : undefined,
        },
      ],
    };
  },
});
