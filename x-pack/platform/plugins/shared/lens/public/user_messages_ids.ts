/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PRECISION_ERROR_ACCURACY_MODE_ENABLED = 'layer_settings_accuracy_mode_enabled';
export const PRECISION_ERROR_ACCURACY_MODE_DISABLED = 'layer_settings_accuracy_mode_disabled';
export const PRECISION_ERROR_ASC_COUNT_PRECISION = 'precision_error_asc_count_precision';
export const TSDB_UNSUPPORTED_COUNTER_OP = 'tsdb_unsupported_counter_op';
export const LAYER_SETTINGS_RANDOM_SAMPLING_INFO = 'random_sampling_info';
export const LAYER_SETTINGS_IGNORE_GLOBAL_FILTERS = 'ignoring-global-filters-layers';
export const EDITOR_MISSING_VIS_TYPE = 'editor_missing_vis_type';
export const EDITOR_UNKNOWN_VIS_TYPE = 'editor_unknown_vis_type';
export const EDITOR_UNKNOWN_DATASOURCE_TYPE = 'editor_unknown_datasource_type';
export const EDITOR_MISSING_DATAVIEW = 'editor_missing_dataview';
export const EDITOR_MISSING_EXPRESSION_DATAVIEW = 'editor_missing_expression_dataview';
export const EDITOR_INVALID_DIMENSION = 'editor_invalid_dimension';
export const TIMESHIFT_LT_INTERVAL = 'timeshift_smaller_then_interval';
export const TIMESHIFT_NOT_MULTIPLE_INTERVAL = 'timeshift_not_multiple_interval';
export const TERMS_WITH_MULTIPLE_TIMESHIFT = 'terms_with_multiple_timeshift';
export const TERMS_MULTI_TERMS_AND_SCRIPTED_FIELDS = 'terms_wit_multiple_terms_scripted_fields';

export const REDUCED_TIME_RANGE_NO_DATE_HISTOGRAM = 'reduced_time_range_no_date_histogram';
export const REDUCED_TIME_RANGE_DEFAULT_DATE_FIELD = 'reduced_time_range_default_date_field';

export const FIELD_NOT_FOUND = 'field_not_found';
export const FIELD_WRONG_TYPE = 'field_wrong_type';

export const UNSUPPORTED_DOWNSAMPLED_INDEX_AGG_PREFIX =
  'unsupported_aggregation_on_downsampled_index-';
/**
 * A warning object for a search response with incomplete ES results
 * ES returns incomplete results when:
 * 1) Set timeout flag on search and the timeout expires on cluster
 * 2) Some shard failures on a cluster
 * 3) skipped remote(s) (skip_unavailable=true)
 *   a. all shards failed
 *   b. disconnected/not-connected
 */
export const INCOMPLETE_ES_RESULTS = 'incomplete_es_results';

export const CALCULATIONS_DATE_HISTOGRAM_REQUIRED = 'calculations_date_histogram_required';
export const CALCULATIONS_MISSING_COLUMN_REFERENCE = 'calculations_missing_column_reference';
export const CALCULATIONS_WRONG_DIMENSION_CONFIG = 'calculations_wrong_dimension_configuration';

export const TIME_SHIFT_MULTIPLE_DATE_HISTOGRAMS = 'time_shift_multiple_date_histograms';

export const INTERVAL_OP_MISSING_UI_SETTINGS_HISTOGRAM_BAR_TARGET =
  'missing_ui_settings_histogram_bar_target';
export const INTERVAL_OP_MISSING_TIME_RANGE = 'interval_op_missing_time_range';
export const INTERVAL_OP_MISSING_DATE_HISTOGRAM_TO_COMPUTE_INTERVAL =
  'missing_date_histogram_to_compute_interval';

export const TIMERANGE_OP_DATAVIEW_NOT_TIME_BASED = 'timerange_op_dataview_not_time_based';
export const TIMERANGE_OP_MISSING_TIME_RANGE = 'timerange_op_missing_time_range';

export const LAST_VALUE_OP_SORT_FIELD_NOT_FOUND = 'last_value_op_sort_field_not_found';
export const LAST_VALUE_OP_SORT_FIELD_INVALID_TYPE = 'last_value_op_sort_field_invalid_type';
export const FORMULA_LAYER_ONLY_STATIC_VALUES = 'formula_layer_only_static_values';
export const STATIC_VALUE_NOT_VALID_NUMBER = 'static_value_not_valid_number';

/** Annotations require a time based chart to work. Add a date histogram. */
export const ANNOTATION_MISSING_DATE_HISTOGRAM = 'annotation_missing_date_histogram';
export const ANNOTATION_DATAVIEW_NOT_FOUND = 'annotation_dataview_not_found';
export const ANNOTATION_MISSING_TIME_FIELD = 'annotation_missing_time_field';
export const ANNOTATION_MISSING_TOOLTIP_FIELD = 'annotation_missing_tooltip_field';
export const ANNOTATION_TIME_FIELD_NOT_FOUND = 'annotation_time_field_not_found_in_dataview';
export const ANNOTATION_TEXT_FIELD_NOT_FOUND = 'annotation_text_field_not_found_in_dataview';
export const ANNOTATION_INVALID_FILTER_QUERY = 'annotation_invalid_filter_query';

export const XY_BREAKDOWN_MISSING_AXIS = 'xy_breakdown_missing_axis';
export const XY_Y_MISSING_AXIS = 'xy_y_missing_axis';
export const XY_X_WRONG_DATA_TYPE = 'xy_x_wrong_data_type';
export const XY_Y_WRONG_DATA_TYPE = 'xy_y_wrong_data_type';
export const XY_RENDER_ARRAY_VALUES = 'xy_rendering_values_array';
export const XY_MIXED_LOG_SCALE = 'xy_mixed_log_scale-groupid-';
export const XY_MIXED_LOG_SCALE_DIMENSION = 'xy_mixed_log_scale-dimension-';

export const PIE_TOO_MANY_DIMENSIONS = 'pie_too_many_dimensions';
export const PIE_RENDER_ARRAY_VALUES = 'pie_rendering_values_array';

export const WAFFLE_SMALL_VALUES = 'waffle_small_values';

export const METRIC_NUMERIC_MAX = 'metric_max_numeric';

export const HEATMAP_X_MISSING_AXIS = 'heatmap_x_missing_axis';
export const HEATMAP_RENDER_ARRAY_VALUES = 'heatmap_rendering_values_array';

export const GAUGE_MIN_GT_MAX = 'gauge_min_gt_max';
export const GAUGE_MIN_GT_METRIC = 'gauge_min_gt_metric';
export const GAUGE_MIN_GT_GOAL = 'gauge_min_gt_goal';
export const GAUGE_MIN_NE_MAX = 'gauge_min_ne_max';
export const GAUGE_METRIC_GT_MAX = 'gauge_metric_gt_max';
export const GAUGE_GOAL_GT_MAX = 'gauge_goal_gt_max';

export const TEXT_BASED_LANGUAGE_ERROR = 'text_based_lang_error';

export const URL_CONFLICT = 'url-conflict';
export const MISSING_TIME_RANGE_ON_EMBEDDABLE = 'missing-time-range-on-embeddable';

export const DATATABLE_COLOR_MISMATCH = 'datatable_color_mismatch';
