/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BasicEntityData } from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { AnomalyTableProviderChildrenProps } from '../../../../../common/components/ml/anomaly/anomaly_table_provider';

export interface FirstLastSeenData {
  date: string | null | undefined;
  isLoading: boolean;
}

export interface EntityAnomalies {
  isLoading: AnomalyTableProviderChildrenProps['isLoadingAnomaliesData'];
  anomalies: AnomalyTableProviderChildrenProps['anomaliesData'];
  jobNameById: AnomalyTableProviderChildrenProps['jobNameById'];
}

export interface ObservedEntityData<T> extends BasicEntityData {
  firstSeen: FirstLastSeenData;
  lastSeen: FirstLastSeenData;
  anomalies?: EntityAnomalies;
  details: T;
}
