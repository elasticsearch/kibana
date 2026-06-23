/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const LOGSTASH_DATA_VIEW = 'logstash-*';

export const LOGSTASH_ANCHOR_ID = 'AU_x3_BrGFA8no6QjjaI';

export const KBN_ARCHIVE_VISUALIZE = 'src/platform/test/functional/fixtures/kbn_archiver/visualize';

export const ES_ARCHIVE_DATE_NANOS = 'src/platform/test/functional/fixtures/es_archiver/date_nanos';

export const KBN_ARCHIVE_DATE_NANOS =
  'src/platform/test/functional/fixtures/kbn_archiver/date_nanos';

export const ES_ARCHIVE_DATE_NANOS_CUSTOM =
  'src/platform/test/functional/fixtures/es_archiver/date_nanos_custom';

export const KBN_ARCHIVE_DATE_NANOS_CUSTOM =
  'src/platform/test/functional/fixtures/kbn_archiver/date_nanos_custom';

export const DATE_NANOS_INDEX_PATTERN = 'date-nanos';

export const DATE_NANOS_CUSTOM_INDEX_PATTERN = 'date_nanos_custom_timestamp';

export const DEFAULT_TIME_RANGE = {
  from: '2015-09-19T06:31:44.000Z',
  to: '2015-09-23T18:31:44.000Z',
};

export const FILTER_FIELD_GEO_SRC = 'geo.src';
export const FILTER_VALUE_GEO_SRC_IN = 'IN';
export const FILTER_COLUMNS = ['extension', 'geo.src'];
