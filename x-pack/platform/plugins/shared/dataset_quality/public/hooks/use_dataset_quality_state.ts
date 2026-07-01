/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useSelector } from '@xstate/react';
import { useDatasetQualityContext } from '../components/dataset_quality/context';

export const useDatasetQualityState = () => {
  const { service } = useDatasetQualityContext();

  const { datasetUserPrivileges, datasets } = useSelector(service, (state) => state.context) ?? {};

  const statsLoading = useSelector(
    service,
    (state) =>
      state.matches('initializing') || state.matches({ main: { stats: { datasets: 'fetching' } } })
  );

  const canUserReadFailureStore = Boolean(
    Object.values(datasetUserPrivileges?.datasetsPrivilages ?? {})?.some(
      (privilege) => privilege.canReadFailureStore
    )
  );

  // The wildcard privilege check (e.g. `logs-*-*`) returns `canMonitor: false` when a role
  // negates any matching index (negated/complement patterns), even though the user can still
  // monitor individual data streams. So we also consider the privileges returned per data stream.
  const canUserMonitorAnyDataset = Boolean(
    Object.values(datasetUserPrivileges?.datasetsPrivilages ?? {})?.some(
      (privilege) => privilege.canMonitor
    ) || (datasets ?? [])?.some((dataStream) => dataStream.userPrivileges?.canMonitor)
  );

  const canUserReadAnyDataset = Boolean(
    Object.values(datasetUserPrivileges?.datasetsPrivilages ?? {})?.some(
      (privilege) => privilege.canRead
    )
  );

  return {
    statsLoading,
    canUserReadFailureStore,
    canUserMonitorAnyDataset,
    canUserReadAnyDataset,
  };
};
