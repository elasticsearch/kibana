/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const PLUGIN_ID = 'reporting';

/*
 * Storage
 */

// Used to index new documents
export const REPORTING_DATA_STREAM_ALIAS = '.kibana-reporting';
// Used to retrieve settings
export const REPORTING_DATA_STREAM_WILDCARD = '.kibana-reporting*';
// Index pattern of plain indices before Reporting used Data Stream storage
export const REPORTING_LEGACY_INDICES = '.reporting-*';
// Used to search for all reports and check for managing privileges
export const REPORTING_DATA_STREAM_WILDCARD_WITH_LEGACY = '.reporting-*,.kibana-reporting*';
// Name of component template which Kibana overrides for lifecycle settings
export const REPORTING_DATA_STREAM_COMPONENT_TEMPLATE = 'kibana-reporting@custom';
// Name of index template
export const REPORTING_DATA_STREAM_INDEX_TEMPLATE = '.kibana-reporting';
// Name of mapping meta field which contains the version of the index template
// see: https://github.com/elastic/elasticsearch/pull/133846
export const REPORTING_INDEX_TEMPLATE_MAPPING_META_FIELD = 'template_version';

/*
 * Telemetry
 */

// API Counters
export const API_USAGE_COUNTER_TYPE = 'reportingApi';
export const API_USAGE_ERROR_TYPE = 'reportingApiError';

// Event-Based Counters
export enum EventType {
  REPORT_CREATION = 'report_creation',
  REPORT_CLAIM = 'report_claim',
  REPORT_COMPLETION_CSV = 'report_completion_csv',
  REPORT_COMPLETION_SCREENSHOT = 'report_completion_screenshot',
  REPORT_ERROR = 'report_error',
  REPORT_DOWNLOAD = 'report_download',
  REPORT_DELETION = 'report_deletion',
  REPORT_NOTIFICATION = 'report_notification',
  REPORT_NOTIFICATION_ERROR = 'report_notification_error',
}
export enum FieldType {
  REPORT_ID = 'report_id',
  SCHEDULED_TASK_ID = 'scheduled_task_id',
  EXPORT_TYPE = 'export_type',
  OBJECT_TYPE = 'object_type',
  SCHEDULE_TYPE = 'schedule_type',
  IS_DEPRECATED = 'is_deprecated',
  IS_PUBLIC_API = 'is_public_api',
  DURATION_MS = 'duration_ms',
  ERROR_CODE = 'error_code',
  ERROR_MESSAGE = 'error_message',
  BYTE_SIZE = 'byte_size',
  NUM_PAGES = 'num_pages',
  SCREENSHOT_PIXELS = 'screenshot_pixels',
  SCREENSHOT_LAYOUT = 'screenshot_layout',
  CSV_ROWS = 'csv_rows',
  CSV_COLUMNS = 'csv_columns',
  ATTEMPT = 'attempt',
}
export enum ScheduleType {
  SINGLE = 'single',
  SCHEDULED = 'scheduled',
}

/*
 * APM
 */

export const REPORTING_TRANSACTION_TYPE = PLUGIN_ID;
