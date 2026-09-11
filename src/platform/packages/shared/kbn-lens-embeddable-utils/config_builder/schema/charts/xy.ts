/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import {
  axisTitleSchema,
  collapseBySchema,
  dslOnlyPanelInfoSchema,
  ignoringGlobalFiltersSchema,
  layerSettingsSchema,
  legendTruncateAfterLinesSchema,
  sharedPanelInfoSchema,
} from '../shared';
import { dataSourceEsqlTableSchema, dataSourceSchema } from '../data_source';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  getBucketsWithChartDimensionSchema,
  getMetricsWithChartDimensionSchemaWithRefBasedOps,
  getMetricsWithChartDimensionSchemaWithStaticOps,
  xScaleSchema,
} from './shared';
import { esqlColumnWithFormatSchema } from '../metric_ops';
import { colorMappingSchema, staticColorSchema, autoColorSchema, AUTO_COLOR } from '../color';
import { filterSchema } from '../filter';
import { cornerPositionSchema } from '../alignments';
import {
  DEFAULT_AREAS_FILL_OPACITY,
  DEFAULT_AREAS_FILL,
  DEFAULT_BARS_MINIMUM_HEIGHT,
  DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
  DEFAULT_DATA_LABELS_VISIBLE,
  DEFAULT_LINES_INTERPOLATION,
  DEFAULT_PARTIAL_BUCKETS_VISIBLE,
  DEFAULT_POINTS_VISIBILITY,
} from '../../transforms/charts/xy/defaults';
import { orientationSchema } from '../enums';

/**
 * Statistical functions that can be displayed in chart legend for data series
 */
export const statisticsSchema = z
  .union([
    z.literal('min'),
    z.literal('max'),
    z.literal('avg'),
    z.literal('median'),
    z.literal('range'),
    z.literal('last_value'),
    z.literal('last_non_null_value'),
    z.literal('first_value'),
    z.literal('first_non_null_value'),
    z.literal('difference'),
    z.literal('difference_percentage'),
    z.literal('count'),
    z.literal('total'),
    z.literal('standard_deviation'),
    z.literal('variance'),
    z.literal('distinct_count'),
    z.literal('current_and_last_value'),
  ])
  .meta({
    description: 'Statistical functions that can be displayed in chart legend for data series',
  });

// Should be kept in sync with the number of statistics options
export const statisticsOptionsSize = 17;

const domainRoundingSchema = z.boolean().default(true).meta({
  id: 'visApiDomainRounding',
  description:
    'Whether to round axis domain bounds outward to readable “nice” values (for example 1, 5, 10, 100) instead of exact data min/max.',
});

const domainFullConfigSchema = z
  .object({
    type: z.literal('full'),
    rounding: domainRoundingSchema.optional(),
  })
  .strict()
  .meta({
    id: 'visApiDomainFull',
    description:
      'Uses the full chart domain, including baseline expansion when applicable (for example, includes zero for bar-like series).',
  });

const domainFitConfigSchema = z
  .object({
    type: z.literal('fit'),
    rounding: domainRoundingSchema.optional(),
  })
  .strict()
  .meta({
    id: 'visApiDomainFit',
    description:
      'Uses tight domain bounds from the observed data minimum to maximum, without baseline expansion.',
  });

const domainCustomConfigSchema = z
  .object({
    type: z.literal('custom'),
    min: z.number().meta({ description: 'Min domain value' }),
    max: z.number().meta({ description: 'Max domain value' }),
    rounding: domainRoundingSchema.optional(),
  })
  .strict()
  .meta({
    id: 'visApiDomainCustom',
    description: 'Uses explicitly provided domain bounds (min and max).',
  });

/**
 * Y-axis domain configuration defining how the axis bounds are calculated
 */
const yDomainSchema = z
  .discriminatedUnion('type', [
    domainFullConfigSchema,
    domainFitConfigSchema,
    domainCustomConfigSchema,
  ])
  .default({
    type: 'full',
    rounding: true,
  })
  .meta({
    description: 'Y-axis domain configuration',
  });
export type YDomainSchemaType = z.output<typeof yDomainSchema>;

/**
 * Y-axis scale type for data transformation
 */
const yScaleSchema = z
  .union([z.literal('linear'), z.literal('log'), z.literal('sqrt')])
  .meta({ description: 'Y-axis scale type for data transformation' });
export type YScaleSchemaType = z.output<typeof yScaleSchema>;

/**
 * Common axis configuration properties shared across X and Y axes
 */
export const sharedAxisSchema = z
  .object({
    title: axisTitleSchema.optional().meta({ description: 'Axis title configuration' }),
    ticks: z
      .object({
        visible: z.boolean().meta({ description: 'Show tick marks on the axis' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Axis tick marks configuration' }),
    grid: z
      .object({
        visible: z.boolean().meta({ description: 'Show grid lines for this axis' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Axis grid lines configuration' }),
    labels: z
      .object({
        /**
         * Orientation of the axis labels. Possible values:
         * - 'horizontal': Labels aligned horizontally
         * - 'vertical': Labels aligned vertically
         * - 'angled': Labels at an angle
         */
        orientation: orientationSchema.optional().meta({
          description: 'Orientation of the axis labels',
        }),
      })
      .strict()
      .optional()
      .meta({ description: 'Label configuration' }),
  })
  .strict();

const yAxisSchema = sharedAxisSchema
  .extend({
    scale: yScaleSchema.optional(),
    domain: yDomainSchema.optional(),
  })
  .meta({
    description:
      'Y-axis configuration with scale and bounds. The axis position is determined by the key: y renders on the start side (left in vertical charts), y2 on the end side (right in vertical charts).',
  });
export type YAxisSchemaType = z.output<typeof yAxisSchema>;

const xAxisSchema = sharedAxisSchema
  .extend({
    scale: xScaleSchema.optional(),
    domain: z.union([domainFitConfigSchema, domainCustomConfigSchema]).optional().meta({
      description: 'X-axis domain configuration',
    }),
  })
  .meta({ description: 'X-axis configuration' });
export type XAxisSchemaType = z.output<typeof xAxisSchema>;

/**
 * Chart types available for data layers in XY visualizations
 */
export const xyDataLayerSharedShape = {
  type: z
    .union([
      z.literal('area'),
      z.literal('area_percentage'),
      z.literal('area_stacked'),
      z.literal('bar'),
      z.literal('bar_horizontal'),
      z.literal('bar_horizontal_stacked'),
      z.literal('bar_horizontal_percentage'),
      z.literal('bar_percentage'),
      z.literal('bar_stacked'),
      z.literal('line'),
    ])
    .meta({ description: 'Chart type for the data layer' }),
};

const legendSeriesHeaderSchema = z
  .object({
    visible: z
      .boolean()
      .optional()
      .meta({ description: 'When true, shows the legend table series header.' }),
    text: z.string().optional().meta({ description: 'Legend table series header text.' }),
  })
  .strict()
  .meta({
    id: 'visXyLegendSeriesHeader',
    description: 'Legend table series header configuration.',
  });

/**
 * Common legend configuration properties for positioning and statistics
 */
const sharedLegendSchema = z
  .object({
    visibility: legendVisibilitySchemaWithAuto,
    statistics: z
      .array(statisticsSchema)
      .max(statisticsOptionsSize)
      .optional()
      .meta({ description: 'Statistics to display in legend' }),
    series_header: legendSeriesHeaderSchema.optional(),
  })
  .strict();

/**
 * Layout Schemas
 */
const legendTruncateEnabledSchema = z.boolean().optional().meta({
  description: 'Enable truncation of legend items',
});
const gridLayout = z
  .object({
    type: z.literal('grid'),
    truncate: z
      .object({
        max_lines: legendTruncateAfterLinesSchema,
        enabled: legendTruncateEnabledSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
const listLayout = z
  .object({
    type: z.literal('list'),
  })
  .strict();

const XY_API_LINE_INTERPOLATION = {
  LINEAR: 'linear',
  SMOOTH: 'smooth',
  STEPPED: 'stepped',
} as const;

export type XYApiLineInterpolation = typeof XY_API_LINE_INTERPOLATION;

const xyStylingSchema = z
  .object({
    // Chart-level (always present)
    overlays: z
      .object({
        partial_buckets: z
          .object({
            visible: z
              .boolean()
              .default(DEFAULT_PARTIAL_BUCKETS_VISIBLE)
              .meta({ description: 'Show partial bucket indicators at time range edges' }),
          })
          .strict()
          .optional()
          .meta({ description: 'Partial (incomplete) bucket indicator configuration' }),
        current_time_marker: z
          .object({
            visible: z
              .boolean()
              .default(DEFAULT_CURRENT_TIME_MARKER_VISIBLE)
              .meta({ description: 'Show current time marker line' }),
          })
          .strict()
          .optional()
          .meta({ description: 'Current time marker configuration' }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visXyStylingOverlays',
        description: 'Visual overlays drawn on top of the chart canvas',
      }),

    // Lines + areas shared (alphabetical)
    fitting: z
      .object({
        type: z
          .union([
            z.literal('none'),
            z.literal('zero'),
            z.literal('linear'),
            z.literal('carry'),
            z.literal('lookahead'),
            z.literal('average'),
            z.literal('nearest'),
          ])
          .meta({ description: 'Fitting function type for missing data' }),
        emphasize: z.boolean().optional().meta({
          description:
            'Visually distinguish fitted segments with a dashed line style and reduced area opacity',
        }),
        extend: z
          .union([z.literal('none'), z.literal('zero'), z.literal('nearest')])
          .optional()
          .meta({
            description:
              'How to render line and area edges when data does not cover the full X domain',
          }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visXyFitting',
        description: 'Missing data interpolation configuration for line and area series',
      }),
    interpolation: z
      .union([
        z.literal(XY_API_LINE_INTERPOLATION.LINEAR),
        z.literal(XY_API_LINE_INTERPOLATION.SMOOTH),
        z.literal(XY_API_LINE_INTERPOLATION.STEPPED),
      ])
      .default(DEFAULT_LINES_INTERPOLATION)
      .optional()
      .meta({ description: 'Curve interpolation method for line and area series' }),
    points: z
      .object({
        visibility: z
          .union([z.literal('auto'), z.literal('visible'), z.literal('hidden')])
          .default(DEFAULT_POINTS_VISIBILITY)
          .optional()
          .meta({ description: 'Data point marker visibility on line and area series' }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visXyStylingPoints',
        description: 'Data point marker settings for line and area series',
      }),

    // Series-type specific (alphabetical)
    areas: z
      .object({
        fill_opacity: z
          .number()
          .min(0)
          .max(2)
          .default(DEFAULT_AREAS_FILL_OPACITY)
          .optional()
          .meta({ description: 'Area fill opacity (0-1 typical, max 2 for legacy)' }),
        fill: z
          .enum(['solid', 'gradient'])
          .default(DEFAULT_AREAS_FILL)
          .optional()
          .meta({
            description: 'Area fill type: solid or gradient. Defaults to solid.',
            openapi: {
              availability: {
                since: '9.6.0',
              },
            },
          }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visXyStylingAreas',
        description: 'Area-specific rendering settings',
      }),
    bars: z
      .object({
        minimum_height: z
          .number()
          .min(0)
          .default(DEFAULT_BARS_MINIMUM_HEIGHT)
          .optional()
          .meta({ description: 'Minimum bar height in pixels' }),
        data_labels: z
          .object({
            visible: z
              .boolean()
              .default(DEFAULT_DATA_LABELS_VISIBLE)
              .meta({ description: 'Display value labels on bar data points' }),
          })
          .strict()
          .optional()
          .meta({ description: 'Data label configuration for bar series' }),
      })
      .strict()
      .optional()
      .meta({
        id: 'visXyStylingBars',
        description: 'Bar-specific rendering settings',
      }),
  })
  .strict()
  .meta({
    id: 'visXyStyling',
    description: 'Visual styling options for the chart',
  });

/*
 * Legend schema variants
 */

const xyLegendOutsideHorizontalSchema = sharedLegendSchema
  .extend({
    placement: z.literal('outside').optional(),
    layout: z.union([gridLayout, listLayout]).optional(),
    position: z.enum(['top', 'bottom']).optional(),
  })
  .meta({
    id: 'visXyLegendOutsideHorizontal',
    title: 'Outside horizontal',
    description: 'Outside legend positioned horizontal (top/bottom) of the chart',
  });

const xyLegendOutsideVerticalSchema = sharedLegendSchema
  .extend({
    placement: z.literal('outside').optional(),
    layout: gridLayout.optional(),
    position: z.enum(['left', 'right']).optional(),
    size: legendSizeSchema,
  })
  .meta({
    id: 'visXyLegendOutsideVertical',
    title: 'Outside vertical',
    description: 'Outside legend positioned vertical (left/right) of the chart',
  });

const xyLegendInsideSchema = sharedLegendSchema
  .extend({
    placement: z.literal('inside'),
    layout: gridLayout.optional(),
    columns: z.number().min(1).max(5).optional().meta({ description: 'Number of legend columns' }),
    position: cornerPositionSchema.optional().meta({
      description: 'Legend position inside the chart',
    }),
  })
  .meta({
    id: 'visXyLegendInside',
    title: 'Inside',
    description: 'Inside legend',
  });

/**
 * Shared settings that apply to the entire XY chart visualization
 */
const xySharedSettings = {
  legend: z
    .union([xyLegendOutsideHorizontalSchema, xyLegendOutsideVerticalSchema, xyLegendInsideSchema])
    .optional()
    .meta({
      id: 'visXyLegend',
      title: 'Legend',
      description: 'Legend configuration for XY chart',
    }),

  axis: z
    .object({
      x: xAxisSchema.optional(),
      y: yAxisSchema.optional(),
      y2: yAxisSchema.optional(),
    })
    .strict()
    .optional()
    .meta({
      id: 'visApiXyAxisConfig',
      title: 'Axis',
      description:
        'Axis configuration for X, Y, and Y2 axes. The Y axis is on the start (leading) side, the Y2 axis is on the end (trailing) side.',
    }),
  styling: xyStylingSchema.optional(),
};

const yMetricOnAxisSchema = z
  .union([z.literal('y'), z.literal('y2')])
  .default('y')
  .meta({
    description:
      'The Y axis this metric is plotted on. Values match the root axis configuration keys (axis.y, axis.y2). If omitted, defaults to the Y axis start (leading) side.',
  });
/**
 * Data layer configuration for standard (non-ES|QL) queries with breakdown and metrics
 */
const xyDataLayerSchemaNoESQL = z
  .object({
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    ...xyDataLayerSharedShape,
    breakdown_by: getBucketsWithChartDimensionSchema('xyBreakdown')
      .and(
        z.object({
          collapse_by: collapseBySchema.optional(),
          color: colorMappingSchema.optional(),
          aggregate_first: z.boolean().optional().meta({
            description:
              'When `true`, aggregates data before splitting into series. Defaults to `false`.',
          }),
        })
      )
      .optional(),
    y: z
      .array(
        getMetricsWithChartDimensionSchemaWithRefBasedOps('xyY').and(
          z.object({
            axis: yMetricOnAxisSchema.optional(),
            color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
          })
        )
      )
      .max(100)
      .meta({ description: 'Array of metrics to display on Y-axis' }),
    x: getBucketsWithChartDimensionSchema('xyX').optional(),
  })
  .strict()
  .meta({
    id: 'visXyLayerNoESQL',
    title: 'Layer (DSL)',
    description: 'Data layer for standard queries with metrics and buckets',
  });

/**
 * Data layer configuration for ES|QL queries with column-based metrics
 */
const xyDataLayerSchemaESQL = z
  .object({
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    ...xyDataLayerSharedShape,
    breakdown_by: esqlColumnWithFormatSchema
      .extend({
        color: colorMappingSchema.optional(),
        collapse_by: collapseBySchema.optional(),
      })
      .strict()
      .optional()
      .meta({ description: 'ES|QL column for breakdown' }),
    y: z
      .array(
        esqlColumnWithFormatSchema
          .extend({
            axis: yMetricOnAxisSchema.optional(),
            color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
          })
          .strict()
          .meta({ description: 'ES|QL column for Y-axis metric' })
      )
      .max(100)
      .meta({ description: 'Array of ES|QL columns for Y-axis metrics' }),
    x: esqlColumnWithFormatSchema.optional(),
  })
  .strict()
  .meta({
    id: 'visXyLayerESQL',
    title: 'Layer (ES|QL)',
    description: 'Data layer for ES|QL queries with column references',
  });

const getListOfAvailableIcons = (description: string) =>
  z
    .union([
      z.literal('asterisk'),
      z.literal('alert'),
      z.literal('bell'),
      z.literal('bolt'),
      z.literal('bug'),
      z.literal('circle'),
      z.literal('editor_comment'),
      z.literal('flag'),
      z.literal('heart'),
      z.literal('map_marker'),
      z.literal('pin_filled'),
      z.literal('star_empty'),
      z.literal('star_filled'),
      z.literal('tag'),
      z.literal('triangle'),
    ])
    .meta({ description });

const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 10;

/**
 * Common visual configuration for reference lines
 */
const referenceLineLayerSharedShape = {
  fill: z
    .union([z.literal('above'), z.literal('below')])
    .optional()
    .meta({ description: 'Fill direction for reference line' }),
  text: z
    .object({
      visible: z.boolean().meta({ description: 'Show text label on the reference line' }),
    })
    .strict()
    .optional()
    .meta({ description: 'Reference line text label configuration' }),
  icon: getListOfAvailableIcons('Icon to display on the reference line').optional(),
  stroke_width: z
    .number()
    .min(STROKE_WIDTH_MIN)
    .max(STROKE_WIDTH_MAX)
    .optional()
    .meta({ description: 'Line width in pixels' }),
  stroke_dash: z
    .union([z.literal('solid'), z.literal('dashed'), z.literal('dotted')])
    .optional()
    .meta({ description: 'Line style' }),
  color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
  position: z
    .union([z.literal('auto'), z.literal('left'), z.literal('right')])
    .optional()
    .meta({ description: 'Position of the icon and label relative to the reference line' }),
  axis: z
    .union([z.literal('x'), z.literal('y'), z.literal('y2')])
    .default('y')
    .optional()
    .meta({
      description:
        'The axis this reference line is drawn on. Values match the root axis configuration keys. If omitted, defaults to the primary Y axis.',
    }),
};

/**
 * Reference line layer for standard queries with threshold values
 */
const referenceLineLayerSchemaNoESQL = z
  .object({
    ...layerSettingsSchema.shape,
    ...dataSourceSchema.shape,
    type: z.literal('reference_lines'),
    thresholds: z
      .array(
        getMetricsWithChartDimensionSchemaWithStaticOps('xyRefLine').and(
          z.object(referenceLineLayerSharedShape)
        )
      )
      .min(1)
      .max(100)
      .meta({ description: 'Array of reference line thresholds' }),
  })
  .strict()
  .meta({
    id: 'visXyReferenceLineLayerNoESQL',
    title: 'Reference Line Layer (DSL)',
    description: 'Reference line layer for standard queries',
  });

/**
 * Reference line layer for ES|QL queries with column-based thresholds
 */
const referenceLineLayerSchemaESQL = z
  .object({
    ...layerSettingsSchema.shape,
    ...dataSourceEsqlTableSchema.shape,
    type: z.literal('reference_lines'),
    thresholds: z
      .array(esqlColumnWithFormatSchema.extend(referenceLineLayerSharedShape))
      .min(1)
      .max(100)
      .meta({ description: 'Array of ES|QL-based reference line thresholds' }),
  })
  .strict()
  .meta({
    id: 'visXyReferenceLineLayerESQL',
    title: 'Reference Line Layer (ES|QL)',
    description: 'Reference line layer for ES|QL queries',
  });

/**
 * Common properties for all annotation types
 */
const annotationEventShared = {
  color: z.union([staticColorSchema, autoColorSchema]).default(AUTO_COLOR).optional(),
  visible: z.boolean().optional().meta({ description: 'Show the annotation' }),
};

/**
 * Visual properties specific to point annotations
 */
const annotationPointShared = {
  ...annotationEventShared,
  icon: getListOfAvailableIcons('Icon to display at the annotation point').optional(),
  line: z
    .object({
      stroke_width: z
        .number()
        .min(STROKE_WIDTH_MIN)
        .max(STROKE_WIDTH_MAX)
        .meta({ description: 'Vertical line width in pixels' }),
      stroke_dash: z
        .union([z.literal('solid'), z.literal('dashed'), z.literal('dotted')])
        .meta({ description: 'Vertical line style' }),
    })
    .strict()
    .optional()
    .meta({ description: 'Vertical line configuration for point annotation' }),
};

/**
 * Timestamp format for annotations (Unix timestamp or ISO date string)
 */
const annotationTimestampSchema = z.union([
  z.number().meta({ description: 'Unix timestamp in milliseconds' }),
  z.string().meta({ description: 'ISO date string' }),
]);

/**
 * Query-based annotation that finds events matching a filter
 */
const annotationQuery = z
  .object({
    ...annotationPointShared,
    type: z.literal('query'),
    query: filterSchema,
    time_field: z.string().meta({ description: 'Field containing the timestamp' }),
    label: z.string().optional().meta({ description: 'Label text for the annotation' }),
    text: z
      .object({
        visible: z.boolean().meta({ description: 'Show text label on the annotation' }),
        field: z.string().optional().meta({ description: 'Field name for text label source' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Annotation text label configuration' }),
    extra_fields: z
      .array(z.string().meta({ description: 'Additional field to include in tooltip' }))
      .max(100)
      .optional()
      .meta({ description: 'Additional fields for annotation tooltip' }),
  })
  .strict()
  .meta({
    id: 'visXyAnnotationQuery',
    description: 'Annotation from query results matching a filter',
  });

/**
 * Manually specified point annotation at a specific timestamp
 */
const annotationManualEvent = z
  .object({
    ...annotationPointShared,
    type: z.literal('point'),
    timestamp: annotationTimestampSchema,
    label: z.string().optional().meta({ description: 'Label text for the annotation' }),
    text: z
      .object({
        visible: z.boolean().meta({ description: 'Show text label on the annotation' }),
      })
      .strict()
      .optional()
      .meta({ description: 'Annotation text label visibility' }),
  })
  .strict()
  .meta({
    id: 'visXyAnnotationManualEvent',
    description: 'Manual point annotation at specific timestamp',
  });

/**
 * Manually specified range annotation spanning a time interval
 */
const annotationManualRange = z
  .object({
    ...annotationEventShared,
    type: z.literal('range'),
    interval: z
      .object({
        from: annotationTimestampSchema,
        to: annotationTimestampSchema,
      })
      .strict()
      .meta({ description: 'Time range for annotation' }),
    label: z.string().optional().meta({ description: 'Label text for the annotation' }),
    fill: z
      .union([z.literal('inside'), z.literal('outside')])
      .default('inside')
      .optional()
      .meta({ description: 'Fill direction for range' }),
  })
  .strict()
  .meta({
    id: 'visXyAnnotationManualRange',
    description: 'Manual range annotation spanning time interval',
  });

/**
 * Annotation layer containing query-based, point, and range annotations (by-value)
 */
const annotationLayerByValueSchema = z
  .object({
    ...ignoringGlobalFiltersSchema.shape,
    // A by-value annotation layer does not require its own data source: manual
    // point-in-time/range annotations carry no field references and the Lens XY
    // renderer resolves the data view by falling back to the chart's data layers.
    // When omitted, the data view is re-derived from the sibling data layers when
    // converting back to Lens state. See
    // x-pack/.../lens/public/visualizations/xy/persistence.ts.
    data_source: dataSourceSchema.shape.data_source.optional(),
    type: z.literal('annotations'),
    events: z
      .array(z.union([annotationQuery, annotationManualEvent, annotationManualRange]))
      .min(1)
      .max(100)
      .meta({ description: 'Array of annotation configurations' }),
  })
  .strict()
  .meta({
    id: 'visXyAnnotationLayerNoESQL',
    title: 'Annotation Layer (DSL)',
    description: 'Layer containing annotations (query-based, points, and ranges)',
  });

/**
 * By-reference annotation layer that links to a library annotation group
 */
const annotationByRefLayerSchema = z
  .object({
    type: z.literal('annotation_group'),
    group_id: z
      .string()
      .meta({ description: 'ID of the linked annotation group from the library' }),
  })
  .strict()
  .meta({
    id: 'visXyAnnotationByRefLayer',
    title: 'Annotation Layer (By Reference)',
    description: 'Reference to a library annotation group',
  });

const annotationLayerSchema = z
  .union([annotationLayerByValueSchema, annotationByRefLayerSchema])
  .meta({
    id: 'visXyAnnotationLayer',
    description: 'Annotation layer which can be defined by-value or by-reference',
  });

const xyLayerUnionNoESQL = z
  .union([
    xyDataLayerSchemaNoESQL,
    referenceLineLayerSchemaNoESQL,
    annotationLayerByValueSchema,
    annotationByRefLayerSchema,
  ])
  .meta({
    id: 'visXyLayersNoESQL',
    description: 'XY chart layer types for DSL queries',
  });

const xyLayerUnionESQL = xyDataLayerSchemaESQL.meta({
  id: 'visXyLayersESQL',
  description: 'XY chart layer types for ES|QL queries',
});

/**
 * XY chart state for DSL layers
 */
export const xyConfigSchemaNoESQL = z
  .object({
    type: z.literal('xy'),
    ...sharedPanelInfoSchema.shape,
    ...xySharedSettings,
    ...dslOnlyPanelInfoSchema.shape,
    layers: z.array(xyLayerUnionNoESQL).min(1).max(100).meta({ description: 'Chart layers' }),
  })
  .meta({
    id: 'visXyChartNoESQL',
    title: 'XY Chart (DSL)',
    description: 'XY chart configuration for DSL queries',
  });

/**
 * XY chart state for ES|QL layers only (reference lines are not supported)
 */
export const xyConfigSchemaESQL = z
  .object({
    type: z.literal('xy'),
    ...sharedPanelInfoSchema.shape,
    ...xySharedSettings,
    layers: z.array(xyLayerUnionESQL).min(1).max(100).meta({ description: 'ES|QL chart layers' }),
  })
  .meta({
    id: 'visXyChartESQL',
    title: 'XY Chart (ES|QL)',
    description: 'XY chart configuration for ES|QL queries',
  });

/**
 * XY chart state
 */
export const xyConfigSchema = z.union([xyConfigSchemaNoESQL, xyConfigSchemaESQL]).meta({
  id: 'visXyChart',
  title: 'XY Chart',
  description: 'XY chart configuration',
});

export type XYConfigNoESQL = z.output<typeof xyConfigSchemaNoESQL>;
export type XYConfigESQL = z.output<typeof xyConfigSchemaESQL>;
export type XYConfig = z.output<typeof xyConfigSchema>;
export type XYConfigInput = z.input<typeof xyConfigSchema>;
export type DataLayerTypeESQL = z.output<typeof xyDataLayerSchemaESQL>;
export type DataLayerTypeNoESQL = z.output<typeof xyDataLayerSchemaNoESQL>;
export type DataLayerType = DataLayerTypeNoESQL | DataLayerTypeESQL;
/**
 * @deprecated ES|QL reference lines are not yet supported
 */
export type ReferenceLineLayerTypeESQL = z.output<typeof referenceLineLayerSchemaESQL>;
export type ReferenceLineLayerTypeNoESQL = z.output<typeof referenceLineLayerSchemaNoESQL>;
export type ReferenceLineLayerType = ReferenceLineLayerTypeNoESQL | ReferenceLineLayerTypeESQL;
export type AnnotationLayerType = z.output<typeof annotationLayerSchema>;
export type AnnotationLayerByRefType = z.output<typeof annotationByRefLayerSchema>;
export type AnnotationLayerByValueType = z.output<typeof annotationLayerByValueSchema>;
/**
 * Reference line layers are not support but included to keep existing logic
 */
export type LayerTypeESQL = z.output<typeof xyLayerUnionESQL> | ReferenceLineLayerTypeESQL;
export type LayerTypeNoESQL =
  | DataLayerTypeNoESQL
  | ReferenceLineLayerTypeNoESQL
  | AnnotationLayerType;
export type XYLayer = LayerTypeNoESQL | LayerTypeESQL;

export type XYLegendOutsideHorizontal = z.output<typeof xyLegendOutsideHorizontalSchema>;
export type XYLegendOutsideVertical = z.output<typeof xyLegendOutsideVerticalSchema>;
export type XYLegendInside = z.output<typeof xyLegendInsideSchema>;
export type XYLegendStatistic = z.output<typeof statisticsSchema>;
export type XYLegendSize = z.output<typeof legendSizeSchema>;
