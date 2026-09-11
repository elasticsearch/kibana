/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import {
  IconChartArea,
  IconChartLine,
  IconChartAreaStacked,
  IconChartBarHorizontalStacked,
  IconChartBarHorizontalPercentage,
  IconChartAreaPercentage,
  IconChartBar,
  IconChartBarStacked,
  IconChartBarPercentage,
  IconChartBarHorizontal,
} from '@kbn/chart-icons';

export type {
  XYLayerConfig,
  XYVisualizationState,
  XYByValueAnnotationLayerConfig,
  XYByReferenceAnnotationLayerConfig,
  XYAnnotationLayerConfig,
  XYDataLayerConfig,
  XYPointsLayerConfig,
  XYReferenceLineLayerConfig,
  SeriesType,
  YConfig,
  AxisConfig,
  ValidXYDataLayerConfig,
  YAxisMode,
} from '@kbn/lens-common';

import type { VisualizationType } from '@kbn/lens-common';
import { SeriesTypes } from '@kbn/lens-common';

export const defaultSeriesType = SeriesTypes.BAR_STACKED;

const barShared = {
  sortPriority: 1,
  description: i18n.translate('xpack.lens.bar.visualizationDescription', {
    defaultMessage: 'Compare categories or groups of data with bars.',
  }),
};

const areaShared = {
  sortPriority: 3,
  description: i18n.translate('xpack.lens.area.visualizationDescription', {
    defaultMessage: 'Compare distributions of cumulative data trends.',
  }),
};

const lineShared = {
  id: 'line',
  icon: IconChartLine,
  label: i18n.translate('xpack.lens.xyVisualization.lineLabel', {
    defaultMessage: 'Line',
  }),
  sortPriority: 2,
  description: i18n.translate('xpack.lens.line.visualizationDescription', {
    defaultMessage: 'Reveal variations in data over time.',
  }),
};

export const visualizationSubtypes: VisualizationType[] = [
  {
    id: 'bar',
    icon: IconChartBar,
    label: i18n.translate('xpack.lens.xyVisualization.barLabel', {
      defaultMessage: 'Bar vertical',
    }),
    ...barShared,
  },
  {
    id: 'bar_horizontal',
    icon: IconChartBarHorizontal,
    label: i18n.translate('xpack.lens.xyVisualization.barHorizontalLabel', {
      defaultMessage: 'H. Bar',
    }),
    fullLabel: i18n.translate('xpack.lens.xyVisualization.barHorizontalFullLabel', {
      defaultMessage: 'Bar horizontal',
    }),
    ...barShared,
  },
  {
    id: 'bar_stacked',
    icon: IconChartBarStacked,
    label: i18n.translate('xpack.lens.xyVisualization.stackedBarLabel', {
      defaultMessage: 'Bar vertical stacked',
    }),
    ...barShared,
  },
  {
    id: 'bar_percentage_stacked',
    icon: IconChartBarPercentage,
    label: i18n.translate('xpack.lens.xyVisualization.stackedPercentageBarLabel', {
      defaultMessage: 'Bar vertical percentage',
    }),
    ...barShared,
  },
  {
    id: 'bar_horizontal_stacked',
    icon: IconChartBarHorizontalStacked,
    label: i18n.translate('xpack.lens.xyVisualization.stackedBarHorizontalLabel', {
      defaultMessage: 'H. Stacked bar',
    }),
    fullLabel: i18n.translate('xpack.lens.xyVisualization.stackedBarHorizontalFullLabel', {
      defaultMessage: 'Bar horizontal stacked',
    }),
    ...barShared,
  },
  {
    id: 'bar_horizontal_percentage_stacked',
    icon: IconChartBarHorizontalPercentage,
    label: i18n.translate('xpack.lens.xyVisualization.stackedPercentageBarHorizontalLabel', {
      defaultMessage: 'H. Percentage bar',
    }),
    fullLabel: i18n.translate(
      'xpack.lens.xyVisualization.stackedPercentageBarHorizontalFullLabel',
      {
        defaultMessage: 'Bar horizontal percentage',
      }
    ),
    ...barShared,
  },
  {
    id: 'area',
    icon: IconChartArea,
    label: i18n.translate('xpack.lens.xyVisualization.areaLabel', {
      defaultMessage: 'Area',
    }),
    ...areaShared,
  },
  {
    id: 'area_stacked',
    icon: IconChartAreaStacked,
    label: i18n.translate('xpack.lens.xyVisualization.stackedAreaLabel', {
      defaultMessage: 'Area stacked',
    }),
    ...areaShared,
  },
  {
    id: 'area_percentage_stacked',
    icon: IconChartAreaPercentage,
    label: i18n.translate('xpack.lens.xyVisualization.stackedPercentageAreaLabel', {
      defaultMessage: 'Area percentage',
    }),
    ...areaShared,
  },
  lineShared,
];

export const visualizationTypes: VisualizationType[] = [
  {
    id: 'bar',
    subtypes: [
      'bar',
      'bar_stacked',
      'bar_percentage_stacked',
      'bar_horizontal',
      'bar_horizontal_stacked',
      'bar_horizontal_percentage_stacked',
    ],
    icon: IconChartBar,
    label: i18n.translate('xpack.lens.xyVisualization.barLabel', {
      defaultMessage: 'Bar',
    }),
    ...barShared,
    getCompatibleSubtype: (seriesType?: string) => {
      if (seriesType === 'area') {
        return 'bar';
      } else if (seriesType === 'area_stacked') {
        return 'bar_stacked';
      } else if (seriesType === 'area_percentage_stacked') {
        return 'bar_percentage_stacked';
      }
    },
  },
  {
    id: 'area',
    icon: IconChartArea,
    label: i18n.translate('xpack.lens.xyVisualization.areaLabel', {
      defaultMessage: 'Area',
    }),
    sortPriority: 3,
    description: i18n.translate('xpack.lens.area.visualizationDescription', {
      defaultMessage: 'Compare distributions of cumulative data trends.',
    }),
    subtypes: ['area', 'area_stacked', 'area_percentage_stacked'],
    getCompatibleSubtype: (seriesType?: string) => {
      if (seriesType === 'bar') {
        return 'area';
      } else if (seriesType === 'bar_stacked') {
        return 'area_stacked';
      } else if (seriesType === 'bar_percentage_stacked') {
        return 'area_percentage_stacked';
      }
    },
  },
  {
    ...lineShared,
    subtypes: ['line'],
  },
];
