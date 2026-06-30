/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const MULTI_TAB_DISCOVER_SESSION_NAME = 'Multi-tab Discover session';

export const PERSISTED_TAB = {
  label: 'Persisted data view',
  query: 'test',
  time: { from: 'Sep 20, 2015 @ 00:00:00.000', to: 'Sep 22, 2015 @ 00:00:00.000' },
  timeISO: { start: '2015-09-20T00:00:00.000Z', end: '2015-09-22T00:00:00.000Z' },
  dataView: 'logstash-*',
  column1: 'referer',
  column2: 'bytes',
  hitCount: '9',
  chartIntervalTitle: 'Hour',
  chartIntervalValue: 'h',
};

export const AD_HOC_TAB = {
  label: 'Ad hoc data view',
  query: 'extension : jpg',
  time: { from: 'Sep 20, 2015 @ 06:00:00.000', to: 'Sep 22, 2015 @ 06:00:00.000' },
  timeISO: { start: '2015-09-20T06:00:00.000Z', end: '2015-09-22T06:00:00.000Z' },
  dataView: 'logs*',
  column1: 'geo.src',
  column2: 'bytes',
  hitCount: '6,045',
};

export const ESQL_TAB = {
  label: 'ES|QL',
  query: 'FROM logstash-* | SORT @timestamp DESC | LIMIT 50',
  time: { from: 'Sep 20, 2015 @ 12:00:00.000', to: 'Sep 22, 2015 @ 12:00:00.000' },
  timeISO: { start: '2015-09-20T12:00:00.000Z', end: '2015-09-22T12:00:00.000Z' },
  visShape: 'Line',
  hitCount: '50',
};
