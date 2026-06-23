/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface DataStream {
  index: string;
  dataset: string;
  namespace: string;
  type: string;
  package: string;
  package_version: string;
  last_activity_ms: number;
  size_in_bytes: number;
  size_in_bytes_formatted: number | string;
  dashboards: Array<{
    id: string;
    title: string;
  }>;
  serviceDetails: {
    environment: string;
    serviceName: string;
  } | null;
}

export type PackageDataStreamTypes = 'logs' | 'metrics' | 'traces' | 'synthetics' | 'profiles';
