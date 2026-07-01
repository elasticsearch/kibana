/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataSourceType } from '../common/datasource_types';

/**
 * User-visible label for a data source type (flyout, tables).
 */
export function getDataSourceTypeVerbose(type: DataSourceType): string {
  return messages[type];
}

// todo localize
const messages: Record<DataSourceType, string> = {
  s3: 'Amazon S3',
  gcs: 'Google Cloud Storage',
  azure: 'Azure',
};
