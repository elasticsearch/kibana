/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import {
  axisTitleSchemaProps,
  collapseBySchema,
  dslOnlyPanelInfoSchema,
  ignoringGlobalFiltersSchemaRaw,
  layerSettingsSchema,
  legendTruncateAfterLinesSchema,
  sharedPanelInfoSchema,
} from '../shared';
import { dataSourceEsqlTableSchema, dataSourceSchema } from '../data_source';
import {
  legendSizeSchema,
  legendVisibilitySchemaWithAuto,
  mergeAllBucketsWithChartDimensionSchema,
  mergeAllMetricsWithChartDimensionSchemaWithRefBasedOps,
  mergeAllMetricsWithChartDimensionSchemaWithStaticOps,
  xScaleSchema,
} from './shared';
import { esqlColumnWithFormatSchema } from '../metric_ops';
import { colorMappingSchema, staticColorSchema, autoColorSchema, AUTO_COLOR } from '../color';
import { filterSchema } from '../filter';
import { builderEnums } from '../enums';
import { cornerPositionSchema } from '../alignments';
import {
  DEFAULT_AREAS_FILL_OPACITY,
  DEFAULT_BARS_MINIMUM_HEIGHT,
  DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
  DEFAULT_DATA_LABELS_VISIBLE,
  DEFAULT_LINES_INTERPOLATION,
  DEFAULT_PARTIAL_BUCKETS_VISIBLE,
  DEFAULT_POINTS_VISIBILITY,
} from '../../transforms/charts/xy/defaults';
import { objectUnion } from './utils/object_union';

/**
 * Statistical functions that can be displayed in chart legend for data series
 */
export const statisticsSchema = schema.oneOf(
  [
    schema.literal('min'),
    schema.literal('max'),
    schema.literal('avg'),
    schema.literal('median'),
    schema.literal('range'),
    schema.literal('last_value'),
    schema.literal('last_non_null_value'),
    schema.literal('first_value'),
    schema.literal('first_non_null_value'),
    schema.literal('difference'),
    schema.literal('difference_percentage'),
    schema.literal('count'),
    schema.literal('total'),
    schema.literal('standard_deviation'),
    schema.literal('variance'),
    schema.literal('distinct_count'),
    schema.literal('current_and_last_value'),
  ],
  {
    meta: {
      description: 'Statistical functions that can be displayed in chart legend for data series',
    },
  }
);

// Should be kept in sync with the number of statistics options
export const statisticsOptionsSize = 17;

const domainRoundingSchema = schema.boolean({
  defaultValue: true,
  meta: {
    id: 'vis_api_domain_rounding',
    description:
      'Whether to round axis domain bounds outward to readable “nice” values (for example 1, 5, 10, 100) instead of exact data min/max.',
  },
});

const domainFullConfigSchema = schema.object(
  {
    type: schema.literal('full'),
    rounding: schema.maybe(domainRoundingSchema),
  },
  {
    meta: {
      id: 'vis_api_domain_full',
      description:
        'Uses the full chart domain, including baseline expansion when applicable (for example, includes zero for bar-like series).',
    },
  }
);

const domainFitConfigSchema = schema.object(
  {
    type: schema.literal('fit'),
    rounding: schema.maybe(domainRoundingSchema),
  },
  {
    meta: {
      id: 'vis_api_domain_fit',
      description:
        'Uses tight domain bounds from the observed data minimum to maximum, without baseline expansion.',
    },
  }
);

const domainCustomConfigSchema = schema.object(
  {
    type: schema.literal('custom'),
    min: schema.number({ meta: { description: 'Min domain value' } }),
    max: schema.number({ meta: { description: 'Max domain value' } }),
    rounding: schema.maybe(domainRoundingSchema),
  },
  {
    meta: {
      id: 'vis_api_domain_custom',
      description: 'Uses explicitly provided domain bounds (min and max).',
    },
  }
);

/**
 * Y-axis domain configuration defining how the axis bounds are calculated
 */
const yDomainSchema = schema.discriminatedUnion(
  'type',
  [domainFullConfigSchema, domainFitConfigSchema, domainCustomConfigSchema],
  {
    defaultValue: {
      type: 'full',
      rounding: true,
    },
    meta: {
      description: 'Y-axis domain configuration',
    },
  }
);
export type YDomainSchemaType = TypeOf<typeof yDomainSchema>;

/**
 * Y-axis scale type for data transformation
 */
const yScaleSchema = schema.oneOf(
  [schema.literal('linear'), schema.literal('log'), schema.literal('sqrt')],
  { meta: { description: 'Y-axis scale type for data transformation' } }
);
export type YScaleSchemaType = TypeOf<typeof yScaleSchema>;

/**
 * Common axis configuration properties shared across X and Y axes
 */
export const sharedAxisSchema = {
  title: schema.maybe(
    schema.object(axisTitleSchemaProps, { meta: { description: 'Axis title configuration' } })
  ),
  ticks: schema.maybe(
    schema.object(
      {
        visible: schema.boolean({ meta: { description: 'Show tick marks on the axis' } }),
      },
      { meta: { description: 'Axis tick marks configuration' } }
    )
  ),
  grid: schema.maybe(
    schema.object(
      {
        visible: schema.boolean({ meta: { description: 'Show grid lines for this axis' } }),
      },
      { meta: { description: 'Axis grid lines configuration' } }
    )
  ),
  labels: schema.maybe(
    schema.object(
      {
        /**
         * Orientation of the axis labels. Possible values:
         * - 'horizontal': Labels aligned horizontally
         * - 'vertical': Labels aligned vertically
         * - 'angled': Labels at an angle
         */
        orientation: schema.maybe(
          builderEnums.orientation({
            meta: {
              description: 'Orientation of the axis labels',
            },
          })
        ),
      },
      { meta: { description: 'Label configuration' } }
    )
  ),
};

const yAxisSchema = schema.object(
  {
    ...sharedAxisSchema,
    scale: schema.maybe(yScaleSchema),
    domain: schema.maybe(yDomainSchema),
  },
  {
    meta: {
      description:
        'Y-axis configuration with scale and bounds. The axis position is determined by the key: y renders on the start side (left in vertical charts), y2 on the end side (right in vertical charts).',
    },
  }
);
export type YAxisSchemaType = TypeOf<typeof yAxisSchema>;

const xAxisSchema = schema.object(
  {
    ...sharedAxisSchema,
    scale: schema.maybe(xScaleSchema),
    domain: schema.maybe(
      schema.oneOf([domainFitConfigSchema, domainCustomConfigSchema], {
        meta: {
          description: 'X-axis domain configuration',
        },
      })
    ),
  },
  {
    meta: { description: 'X-axis configuration' },
  }
);
export type XAxisSchemaType = TypeOf<typeof xAxisSchema>;

/**
 * Chart types available for data layers in XY visualizations
 */
export const xyDataLayerSharedSchema = {
  type: schema.oneOf(
    [
      schema.literal('area'),
      schema.literal('area_percentage'),
      schema.literal('area_stacked'),
      schema.literal('bar'),
      schema.literal('bar_horizontal'),
      schema.literal('bar_horizontal_stacked'),
      schema.literal('bar_horizontal_percentage'),
      schema.literal('bar_percentage'),
      schema.literal('bar_stacked'),
      schema.literal('line'),
    ],
    { meta: { description: 'Chart type for the data layer' } }
  ),
};

const legendSeriesHeaderSchema = schema.object(
  {
    visible: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, shows the legend table series header.' },
      })
    ),
    text: schema.maybe(
      schema.string({
        meta: { description: 'Legend table series header text.' },
      })
    ),
  },
  {
    meta: {
      id: 'xyLegendSeriesHeader',
      description: 'Legend table series header configuration.',
    },
  }
);

/**
 * Common legend configuration properties for positioning and statistics
 */
const sharedLegendSchema = {
  visibility: legendVisibilitySchemaWithAuto,
  statistics: schema.maybe(
    schema.arrayOf(statisticsSchema, {
      meta: { description: 'Statistics to display in legend' },
      maxSize: statisticsOptionsSize,
    })
  ),
  series_header: schema.maybe(legendSeriesHeaderSchema),
};

/**
 * Layout Schemas
 */
const legendTruncateEnabledSchema = schema.maybe(
  schema.boolean({
    meta: {
      description: 'Enable truncation of legend items',
    },
  })
);
const gridLayout = schema.object({
  type: schema.literal('grid'),
  truncate: schema.maybe(
    schema.object({
      max_lines: legendTruncateAfterLinesSchema,
      enabled: legendTruncateEnabledSchema,
    })
  ),
});
const listLayout = schema.object({
  type: schema.literal('list'),
});

const XY_API_LINE_INTERPOLATION = {
  LINEAR: 'linear',
  SMOOTH: 'smooth',
  STEPPED: 'stepped',
} as const;

export type XYApiLineInterpolation = typeof XY_API_LINE_INTERPOLATION;

const xyStylingSchema = schema.object(
  {
    // Chart-level (always present)
    overlays: schema.maybe(
      schema.object(
        {
          partial_buckets: schema.maybe(
            schema.object(
              {
                visible: schema.boolean({
                  defaultValue: DEFAULT_PARTIAL_BUCKETS_VISIBLE,
                  meta: { description: 'Show partial bucket indicators at time range edges' },
                }),
              },
              { meta: { description: 'Partial (incomplete) bucket indicator configuration' } }
            )
          ),
          current_time_marker: schema.maybe(
            schema.object(
              {
                visible: schema.boolean({
                  defaultValue: DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
                  meta: { description: 'Show current time marker line' },
                }),
              },
              { meta: { description: 'Current time marker configuration' } }
            )
          ),
        },
        {
          meta: {
            id: 'xyStylingOverlays',
            description: 'Visual overlays drawn on top of the chart canvas',
          },
        }
      )
    ),

    // Lines + areas shared (alphabetical)
    fitting: schema.maybe(
      schema.object(
        {
          type: schema.oneOf(
            [
              schema.literal('none'),
              schema.literal('zero'),
              schema.literal('linear'),
              schema.literal('carry'),
              schema.literal('lookahead'),
              schema.literal('average'),
              schema.literal('nearest'),
            ],
            { meta: { description: 'Fitting function type for missing data' } }
          ),
          emphasize: schema.maybe(
            schema.boolean({
              meta: {
                description:
                  'Visually distinguish fitted segments with a dashed line style and reduced area opacity',
              },
            })
          ),
          extend: schema.maybe(
            schema.oneOf(
              [schema.literal('none'), schema.literal('zero'), schema.literal('nearest')],
              {
                meta: {
                  description:
                    'How to render line and area edges when data does not cover the full X domain',
                },
              }
            )
          ),
        },
        {
          meta: {
            id: 'xyFitting',
            description: 'Missing data interpolation configuration for line and area series',
          },
        }
      )
    ),
    interpolation: schema.maybe(
      schema.oneOf(
        [
          schema.literal(XY_API_LINE_INTERPOLATION.LINEAR),
          schema.literal(XY_API_LINE_INTERPOLATION.SMOOTH),
          schema.literal(XY_API_LINE_INTERPOLATION.STEPPED),
        ],
        {
          defaultValue: DEFAULT_LINES_INTERPOLATION,
          meta: { description: 'Curve interpolation method for line and area series' },
        }
      )
    ),
    points: schema.maybe(
      schema.object(
        {
          visibility: schema.maybe(
            schema.oneOf(
              [schema.literal('auto'), schema.literal('visible'), schema.literal('hidden')],
              {
                defaultValue: DEFAULT_POINTS_VISIBILITY,
                meta: { description: 'Data point marker visibility on line and area series' },
              }
            )
          ),
        },
        {
          meta: {
            id: 'xyStylingPoints',
            description: 'Data point marker settings for line and area series',
          },
        }
      )
    ),

    // Series-type specific (alphabetical)
    areas: schema.maybe(
      schema.object(
        {
          fill_opacity: schema.maybe(
            schema.number({
              defaultValue: DEFAULT_AREAS_FILL_OPACITY,
              min: 0,
              max: 2,
              meta: { description: 'Area fill opacity (0-1 typical, max 2 for legacy)' },
            })
          ),
        },
        {
          meta: {
            id: 'xyStylingAreas',
            description: 'Area-specific rendering settings',
          },
        }
      )
    ),
    bars: schema.maybe(
      schema.object(
        {
          minimum_height: schema.maybe(
            schema.number({
              defaultValue: DEFAULT_BARS_MINIMUM_HEIGHT,
              min: 0,
              meta: { description: 'Minimum bar height in pixels' },
            })
          ),
          data_labels: schema.maybe(
            schema.object(
              {
                visible: schema.boolean({
                  defaultValue: DEFAULT_DATA_LABELS_VISIBLE,
                  meta: { description: 'Display value labels on bar data points' },
                }),
              },
              { meta: { description: 'Data label configuration for bar series' } }
            )
          ),
        },
        {
          meta: {
            id: 'xyStylingBars',
            description: 'Bar-specific rendering settings',
          },
        }
      )
    ),
  },
  {
    meta: {
      id: 'xyStyling',
      description: 'Visual styling options for the chart',
    },
  }
);

/**
 * Legend schema variants
 */
const xyLegendOutsideHorizontalSchema = schema.object(
  {
    ...sharedLegendSchema,
    placement: schema.maybe(schema.literal('outside')),
    layout: schema.maybe(schema.oneOf([gridLayout, listLayout])),
    position: schema.maybe(schema.oneOf([schema.literal('top'), schema.literal('bottom')])),
  },
  {
    meta: {
      id: 'xyLegendOutsideHorizontal',
      title: 'Outside horizontal',
      description: 'Outside legend positioned horizontal (top/bottom) of the chart',
    },
  }
);

const xyLegendOutsideVerticalSchema = schema.object(
  {
    ...sharedLegendSchema,
    placement: schema.maybe(schema.literal('outside')),
    layout: schema.maybe(gridLayout),
    position: schema.maybe(schema.oneOf([schema.literal('left'), schema.literal('right')])),
    size: legendSizeSchema,
  },
  {
    meta: {
      id: 'xyLegendOutsideVertical',
      title: 'Outside vertical',
      description: 'Outside legend positioned vertical (left/right) of the chart',
    },
  }
);

const xyLegendInsideSchema = schema.object(
  {
    ...sharedLegendSchema,
    placement: schema.literal('inside'),
    layout: schema.maybe(gridLayout),
    columns: schema.maybe(
      schema.number({ min: 1, max: 5, meta: { description: 'Number of legend columns' } })
    ),
    position: schema.maybe(
      cornerPositionSchema({
        meta: { description: 'Legend position inside the chart' },
      })
    ),
  },
  {
    meta: {
      id: 'xyLegendInside',
      title: 'Inside',
      description: 'Inside legend',
    },
  }
);

/**
 * Shared settings that apply to the entire XY chart visualization
 */
const xySharedSettings = {
  legend: schema.maybe(
    schema.oneOf(
      [xyLegendOutsideHorizontalSchema, xyLegendOutsideVerticalSchema, xyLegendInsideSchema],
      {
        meta: {
          id: 'xyLegend',
          title: 'Legend',
          description: 'Legend configuration for XY chart',
        },
      }
    )
  ),

  axis: schema.maybe(
    schema.object(
      {
        x: schema.maybe(xAxisSchema),
        y: schema.maybe(yAxisSchema),
        y2: schema.maybe(yAxisSchema),
      },
      {
        meta: {
          id: 'vis_api_xy_axis_config',
          title: 'Axis',
          description:
            'Axis configuration for X, Y, and Y2 axes. The Y axis is on the start (leading) side, the Y2 axis is on the end (trailing) side.',
        },
      }
    )
  ),
  styling: schema.maybe(xyStylingSchema),
};

const yMetricOnAxisSchema = schema.oneOf([schema.literal('y'), schema.literal('y2')], {
  defaultValue: 'y',
  meta: {
    description:
      'The Y axis this metric is plotted on. Values match the root axis configuration keys (axis.y, axis.y2). If omitted, defaults to the Y axis start (leading) side.',
  },
});
/**
 * Data layer configuration for standard (non-ES|QL) queries with breakdown and metrics
 */
const xyDataLayerSchemaNoESQL = schema.object(
  {
    ...layerSettingsSchema,
    ...dataSourceSchema,
    ...xyDataLayerSharedSchema,
    breakdown_by: schema.maybe(
      mergeAllBucketsWithChartDimensionSchema(
        {
          collapse_by: schema.maybe(collapseBySchema),
          color: schema.maybe(colorMappingSchema),
          aggregate_first: schema.maybe(
            schema.boolean({
              meta: {
                description:
                  'When `true`, aggregates data before splitting into series. Defaults to `false`.',
              },
            })
          ),
        },
        'xyBreakdown'
      )
    ),
    y: schema.arrayOf(
      mergeAllMetricsWithChartDimensionSchemaWithRefBasedOps(
        {
          axis: schema.maybe(yMetricOnAxisSchema),
          color: schema.maybe(
            schema.oneOf([staticColorSchema, autoColorSchema], {
              defaultValue: AUTO_COLOR,
            })
          ),
        },
        'xyY'
      ),
      { meta: { description: 'Array of metrics to display on Y-axis' }, maxSize: 100 }
    ),
    x: schema.maybe(mergeAllBucketsWithChartDimensionSchema({}, 'xyX')),
  },
  {
    meta: {
      id: 'xyLayerNoESQL',
      title: 'Layer (DSL)',
      description: 'Data layer for standard queries with metrics and buckets',
    },
  }
);

/**
 * Data layer configuration for ES|QL queries with column-based metrics
 */
const xyDataLayerSchemaESQL = schema.object(
  {
    ...layerSettingsSchema,
    ...dataSourceEsqlTableSchema,
    ...xyDataLayerSharedSchema,
    breakdown_by: schema.maybe(
      esqlColumnWithFormatSchema.extends(
        {
          color: schema.maybe(colorMappingSchema),
          collapse_by: schema.maybe(collapseBySchema),
        },
        { meta: { description: 'ES|QL column for breakdown' } }
      )
    ),
    y: schema.arrayOf(
      esqlColumnWithFormatSchema.extends(
        {
          axis: schema.maybe(yMetricOnAxisSchema),
          color: schema.maybe(
            schema.oneOf([staticColorSchema, autoColorSchema], {
              defaultValue: AUTO_COLOR,
            })
          ),
        },
        { meta: { description: 'ES|QL column for Y-axis metric' } }
      ),
      { meta: { description: 'Array of ES|QL columns for Y-axis metrics' }, maxSize: 100 }
    ),
    x: schema.maybe(esqlColumnWithFormatSchema),
  },
  {
    meta: {
      id: 'xyLayerESQL',
      title: 'Layer (ES|QL)',
      description: 'Data layer for ES|QL queries with column references',
    },
  }
);

const getListOfAvailableIcons = (description: string) =>
  schema.oneOf(
    [
      schema.literal('asterisk'),
      schema.literal('alert'),
      schema.literal('bell'),
      schema.literal('bolt'),
      schema.literal('bug'),
      schema.literal('circle'),
      schema.literal('editor_comment'),
      schema.literal('flag'),
      schema.literal('heart'),
      schema.literal('map_marker'),
      schema.literal('pin_filled'),
      schema.literal('star_empty'),
      schema.literal('star_filled'),
      schema.literal('tag'),
      schema.literal('triangle'),
    ],
    { meta: { description } }
  );

const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 10;

/**
 * Common visual configuration for reference lines
 */
const referenceLineLayerShared = {
  fill: schema.maybe(
    schema.oneOf([schema.literal('above'), schema.literal('below')], {
      meta: { description: 'Fill direction for reference line' },
    })
  ),
  text: schema.maybe(
    schema.object(
      {
        visible: schema.boolean({ meta: { description: 'Show text label on the reference line' } }),
      },
      { meta: { description: 'Reference line text label configuration' } }
    )
  ),
  icon: schema.maybe(getListOfAvailableIcons('Icon to display on the reference line')),
  stroke_width: schema.maybe(
    schema.number({
      meta: { description: 'Line width in pixels' },
      min: STROKE_WIDTH_MIN,
      max: STROKE_WIDTH_MAX,
    })
  ),
  stroke_dash: schema.maybe(
    schema.oneOf([schema.literal('solid'), schema.literal('dashed'), schema.literal('dotted')], {
      meta: { description: 'Line style' },
    })
  ),
  color: schema.maybe(
    schema.oneOf([staticColorSchema, autoColorSchema], {
      defaultValue: AUTO_COLOR,
    })
  ),
  position: schema.maybe(
    schema.oneOf([schema.literal('auto'), schema.literal('left'), schema.literal('right')], {
      meta: { description: 'Position of the icon and label relative to the reference line' },
    })
  ),
  axis: schema.maybe(
    schema.oneOf([schema.literal('x'), schema.literal('y'), schema.literal('y2')], {
      defaultValue: 'y',
      meta: {
        description:
          'The axis this reference line is drawn on. Values match the root axis configuration keys. If omitted, defaults to the primary Y axis.',
      },
    })
  ),
};

/**
 * Reference line layer for standard queries with threshold values
 */
const referenceLineLayerSchemaNoESQL = schema.object(
  {
    ...layerSettingsSchema,
    ...dataSourceSchema,
    type: schema.literal('reference_lines'),
    thresholds: schema.arrayOf(
      mergeAllMetricsWithChartDimensionSchemaWithStaticOps(referenceLineLayerShared, 'xyRefLine'),
      { meta: { description: 'Array of reference line thresholds' }, minSize: 1, maxSize: 100 }
    ),
  },
  {
    meta: {
      id: 'xyReferenceLineLayerNoESQL',
      title: 'Reference Line Layer (DSL)',
      description: 'Reference line layer for standard queries',
    },
  }
);

/**
 * Reference line layer for ES|QL queries with column-based thresholds
 */
const referenceLineLayerSchemaESQL = schema.object(
  {
    ...layerSettingsSchema,
    ...dataSourceEsqlTableSchema,
    type: schema.literal('reference_lines'),
    thresholds: schema.arrayOf(esqlColumnWithFormatSchema.extends(referenceLineLayerShared), {
      meta: { description: 'Array of ES|QL-based reference line thresholds' },
      minSize: 1,
      maxSize: 100,
    }),
  },
  {
    meta: {
      id: 'xyReferenceLineLayerESQL',
      title: 'Reference Line Layer (ES|QL)',
      description: 'Reference line layer for ES|QL queries',
    },
  }
);

/**
 * Common properties for all annotation types
 */
const annotationEventShared = {
  color: schema.maybe(
    schema.oneOf([staticColorSchema, autoColorSchema], {
      defaultValue: AUTO_COLOR,
    })
  ),
  visible: schema.maybe(schema.boolean({ meta: { description: 'Show the annotation' } })),
};

/**
 * Visual properties specific to point annotations
 */
const annotationPointShared = {
  ...annotationEventShared,
  icon: schema.maybe(getListOfAvailableIcons('Icon to display at the annotation point')),
  line: schema.maybe(
    schema.object(
      {
        stroke_width: schema.number({
          meta: { description: 'Vertical line width in pixels' },
          min: STROKE_WIDTH_MIN,
          max: STROKE_WIDTH_MAX,
        }),
        stroke_dash: schema.oneOf(
          [schema.literal('solid'), schema.literal('dashed'), schema.literal('dotted')],
          { meta: { description: 'Vertical line style' } }
        ),
      },
      { meta: { description: 'Vertical line configuration for point annotation' } }
    )
  ),
};

/**
 * Timestamp format for annotations (Unix timestamp or ISO date string)
 */
const annotationTimestampSchema = schema.oneOf([
  schema.number({ meta: { description: 'Unix timestamp in milliseconds' } }),
  schema.string({ meta: { description: 'ISO date string' } }),
]);

/**
 * Query-based annotation that finds events matching a filter
 */
const annotationQuery = schema.object(
  {
    ...annotationPointShared,
    type: schema.literal('query'),
    query: filterSchema,
    time_field: schema.string({ meta: { description: 'Field containing the timestamp' } }),
    label: schema.maybe(schema.string({ meta: { description: 'Label text for the annotation' } })),
    text: schema.maybe(
      schema.object(
        {
          visible: schema.boolean({ meta: { description: 'Show text label on the annotation' } }),
          field: schema.maybe(
            schema.string({
              meta: { description: 'Field name for text label source' },
            })
          ),
        },
        { meta: { description: 'Annotation text label configuration' } }
      )
    ),
    extra_fields: schema.maybe(
      schema.arrayOf(
        schema.string({ meta: { description: 'Additional field to include in tooltip' } }),
        { meta: { description: 'Additional fields for annotation tooltip' }, maxSize: 100 }
      )
    ),
  },
  {
    meta: {
      id: 'xyAnnotationQuery',
      description: 'Annotation from query results matching a filter',
    },
  }
);

/**
 * Manually specified point annotation at a specific timestamp
 */
const annotationManualEvent = schema.object(
  {
    ...annotationPointShared,
    type: schema.literal('point'),
    timestamp: annotationTimestampSchema,
    label: schema.maybe(schema.string({ meta: { description: 'Label text for the annotation' } })),
    text: schema.maybe(
      schema.object(
        {
          visible: schema.boolean({ meta: { description: 'Show text label on the annotation' } }),
        },
        { meta: { description: 'Annotation text label visibility' } }
      )
    ),
  },
  {
    meta: {
      id: 'xyAnnotationManualEvent',
      description: 'Manual point annotation at specific timestamp',
    },
  }
);

/**
 * Manually specified range annotation spanning a time interval
 */
const annotationManualRange = schema.object(
  {
    ...annotationEventShared,
    type: schema.literal('range'),
    interval: schema.object(
      {
        from: annotationTimestampSchema,
        to: annotationTimestampSchema,
      },
      { meta: { description: 'Time range for annotation' } }
    ),
    label: schema.maybe(schema.string({ meta: { description: 'Label text for the annotation' } })),
    fill: schema.maybe(
      schema.oneOf([schema.literal('inside'), schema.literal('outside')], {
        defaultValue: 'inside',
        meta: { description: 'Fill direction for range' },
      })
    ),
  },
  {
    meta: {
      id: 'xyAnnotationManualRange',
      description: 'Manual range annotation spanning time interval',
    },
  }
);

/**
 * Annotation layer containing query-based, point, and range annotations (by-value)
 */
const annotationLayerByValueSchema = schema.object(
  {
    ...ignoringGlobalFiltersSchemaRaw,
    // A by-value annotation layer does not require its own data source: manual
    // point-in-time/range annotations carry no field references and the Lens XY
    // renderer resolves the data view by falling back to the chart's data layers.
    // When omitted, the data view is re-derived from the sibling data layers when
    // converting back to Lens state. See
    // x-pack/.../lens/public/visualizations/xy/persistence.ts.
    data_source: schema.maybe(dataSourceSchema.data_source),
    type: schema.literal('annotations'),
    events: schema.arrayOf(
      schema.oneOf([annotationQuery, annotationManualEvent, annotationManualRange]),
      { meta: { description: 'Array of annotation configurations' }, minSize: 1, maxSize: 100 }
    ),
  },
  {
    meta: {
      id: 'xyAnnotationLayerNoESQL',
      title: 'Annotation Layer (DSL)',
      description: 'Layer containing annotations (query-based, points, and ranges)',
    },
  }
);

/**
 * By-reference annotation layer that links to a library annotation group
 */
const annotationByRefLayerSchema = schema.object(
  {
    type: schema.literal('annotation_group'),
    group_id: schema.string({
      meta: { description: 'ID of the linked annotation group from the library' },
    }),
  },
  {
    meta: {
      id: 'xyAnnotationByRefLayer',
      title: 'Annotation Layer (By Reference)',
      description: 'Reference to a library annotation group',
    },
  }
);

const annotationLayerSchema = objectUnion(
  [annotationLayerByValueSchema, annotationByRefLayerSchema],
  {
    meta: {
      id: 'xyAnnotationLayer',
      description: 'Annotation layer which can be defined by-value or by-reference',
    },
  }
);

const xyLayerUnionNoESQL = objectUnion(
  [
    xyDataLayerSchemaNoESQL,
    referenceLineLayerSchemaNoESQL,
    ...annotationLayerSchema.getUnionTypes(),
  ],
  {
    meta: {
      id: 'xyLayersNoESQL',
      description: 'XY chart layer types for DSL queries',
    },
  }
);

const xyLayerUnionESQL = objectUnion([xyDataLayerSchemaESQL], {
  meta: {
    id: 'xyLayersESQL',
    description: 'XY chart layer types for ES|QL queries',
  },
});

/**
 * XY chart state for DSL layers
 */
export const xyConfigSchemaNoESQL = schema.object(
  {
    type: schema.literal('xy'),
    ...sharedPanelInfoSchema,
    ...xySharedSettings,
    ...dslOnlyPanelInfoSchema,
    layers: schema.arrayOf(xyLayerUnionNoESQL, {
      minSize: 1,
      maxSize: 100,
      meta: { description: 'Chart layers' },
    }),
  },
  {
    meta: {
      id: 'xyChartNoESQL',
      title: 'XY Chart (DSL)',
      description: 'XY chart configuration for DSL queries',
    },
  }
);

/**
 * XY chart state for ES|QL layers only (reference lines are not supported)
 */
export const xyConfigSchemaESQL = schema.object(
  {
    type: schema.literal('xy'),
    ...sharedPanelInfoSchema,
    ...xySharedSettings,
    layers: schema.arrayOf(xyLayerUnionESQL, {
      minSize: 1,
      maxSize: 100,
      meta: { description: 'ES|QL chart layers' },
    }),
  },
  {
    meta: {
      id: 'xyChartESQL',
      title: 'XY Chart (ES|QL)',
      description: 'XY chart configuration for ES|QL queries',
    },
  }
);

/**
 * XY chart state
 */
export const xyConfigSchema = objectUnion([xyConfigSchemaNoESQL, xyConfigSchemaESQL], {
  meta: {
    id: 'xyChart',
    title: 'XY Chart',
    description: 'XY chart configuration',
  },
});

export type XYConfigNoESQL = TypeOf<typeof xyConfigSchemaNoESQL>;
export type XYConfigESQL = TypeOf<typeof xyConfigSchemaESQL>;
export type XYConfig = TypeOf<typeof xyConfigSchema>;
export type DataLayerTypeESQL = TypeOf<typeof xyDataLayerSchemaESQL>;
export type DataLayerTypeNoESQL = TypeOf<typeof xyDataLayerSchemaNoESQL>;
export type DataLayerType = DataLayerTypeNoESQL | DataLayerTypeESQL;
/**
 * @deprecated ES|QL reference lines are not yet supported
 */
export type ReferenceLineLayerTypeESQL = TypeOf<typeof referenceLineLayerSchemaESQL>;
export type ReferenceLineLayerTypeNoESQL = TypeOf<typeof referenceLineLayerSchemaNoESQL>;
export type ReferenceLineLayerType = ReferenceLineLayerTypeNoESQL | ReferenceLineLayerTypeESQL;
export type AnnotationLayerType = TypeOf<typeof annotationLayerSchema>;
export type AnnotationLayerByRefType = TypeOf<typeof annotationByRefLayerSchema>;
export type AnnotationLayerByValueType = TypeOf<typeof annotationLayerByValueSchema>;
/**
 * Reference line layers are not support but included to keep existing logic
 */
export type LayerTypeESQL = TypeOf<typeof xyLayerUnionESQL> | ReferenceLineLayerTypeESQL;
export type LayerTypeNoESQL =
  | DataLayerTypeNoESQL
  | ReferenceLineLayerTypeNoESQL
  | AnnotationLayerType;
export type XYLayer = LayerTypeNoESQL | LayerTypeESQL;

export type XYLegendOutsideHorizontal = TypeOf<typeof xyLegendOutsideHorizontalSchema>;
export type XYLegendOutsideVertical = TypeOf<typeof xyLegendOutsideVerticalSchema>;
export type XYLegendInside = TypeOf<typeof xyLegendInsideSchema>;
export type XYLegendStatistic = TypeOf<typeof statisticsSchema>;
export type XYLegendSize = TypeOf<typeof legendSizeSchema>;
