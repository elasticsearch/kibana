/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

/**
 * Shared "Open in a Discover tab" label, used by any consumer that surfaces a
 * navigation affordance to Discover (currently unified-doc-viewer's traces flyout
 * and unified-chart-section-viewer's metrics-grid Lens action). Centralized here
 * rather than in a UI library to avoid an inverted dependency where chart code
 * pulls in the doc-viewer package solely to read a string.
 */
export const OPEN_IN_DISCOVER_TAB_LABEL = i18n.translate('discover.openInDiscoverTabLabel', {
  defaultMessage: 'Open in a Discover tab',
});

export const CONTEXT_DEFAULT_SIZE_SETTING = 'context:defaultSize';
export const CONTEXT_STEP_SETTING = 'context:step';
export const CONTEXT_TIE_BREAKER_FIELDS_SETTING = 'context:tieBreakerFields';
export const DEFAULT_COLUMNS_SETTING = 'defaultColumns';
export const DOC_HIDE_TIME_COLUMN_SETTING = 'doc_table:hideTimeColumn';
export const FIELDS_LIMIT_SETTING = 'fields:popularLimit';
export const HIDE_ANNOUNCEMENTS = 'hideAnnouncements';
export const IS_ESQL_DEFAULT_FEATURE_FLAG_KEY = 'discover.isEsqlDefault';
export const MAX_DOC_FIELDS_DISPLAYED = 'discover:maxDocFieldsDisplayed';
export const MODIFY_COLUMNS_ON_SWITCH = 'discover:modifyColumnsOnSwitch';
export const ROW_HEIGHT_OPTION = 'discover:rowHeightOption';
export const SAMPLE_ROWS_PER_PAGE_SETTING = 'discover:sampleRowsPerPage';
export const SAMPLE_SIZE_SETTING = 'discover:sampleSize';
//
// Do not change constant value - part of public REST APIs
//
export const SEARCH_EMBEDDABLE_TYPE = 'discover_session';
export const SEARCH_ON_PAGE_LOAD_SETTING = 'discover:searchOnPageLoad';
export const SHOW_FIELD_STATISTICS = 'discover:showFieldStatistics';
export const SHOW_MULTIFIELDS = 'discover:showMultiFields';
export const SORT_DEFAULT_ORDER_SETTING = 'discover:sort:defaultOrder';
export enum DataGridDensity {
  COMPACT = 'compact',
  EXPANDED = 'expanded',
  NORMAL = 'normal',
}

export enum UnifiedHistogramSuggestionType {
  unsupported = 'unsupported',
  lensSuggestion = 'lensSuggestion',
  histogramForESQL = 'histogramForESQL',
  histogramForDataView = 'histogramForDataView',
}
