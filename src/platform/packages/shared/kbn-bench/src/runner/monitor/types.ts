/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

type ProcMetricType =
  | 'heapUsage'
  | 'heapUsed'
  | 'heapTotal'
  | 'external'
  | 'arrayBuffers'
  | 'cpuUsage'
  | 'rss'
  | 'rssMax'
  | 'tailRss'
  | 'tailHeapUsed'
  | 'tailHeapTotal'
  | 'tailExternal'
  | 'tailArrayBuffers'
  | 'gcTotal'
  | 'gcMajor'
  | 'gcMinor'
  | 'gcIncremental'
  | 'gcWeakCb';

export interface ProcStatsMeta {
  pid: number;
  argv: string[];
}

export interface ProcStats extends ProcStatsMeta, Record<ProcMetricType, number> {}

export type RunProcStats = Record<Exclude<ProcMetricType, 'heapUsage'>, number>;

export interface ProcStatSample extends ProcStats {
  time: number;
}
