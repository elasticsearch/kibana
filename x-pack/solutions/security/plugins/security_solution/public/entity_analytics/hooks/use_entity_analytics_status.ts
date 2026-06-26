/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import type { StoreStatus } from '../../../common/api/entity_analytics';

export type EntityAnalyticsStatus =
  | 'not_installed'
  | 'enabling'
  | 'enabled'
  | 'disabled'
  | 'partially_enabled'
  | 'error';

interface UseEntityAnalyticsStatusParams {
  entityStoreStatus?: StoreStatus;
  isMutationLoading?: boolean;
}

const isStoreInstalled = (status?: StoreStatus): boolean => !!status && status !== 'not_installed';

const deriveEntityStoreOnlyStatus = (entityStoreStatus?: StoreStatus): EntityAnalyticsStatus => {
  if (!isStoreInstalled(entityStoreStatus)) {
    return 'not_installed';
  }
  if (entityStoreStatus === 'error') {
    return 'error';
  }
  return entityStoreStatus === 'running' ? 'enabled' : 'disabled';
};

export const deriveEntityAnalyticsStatus = ({
  entityStoreStatus,
  isMutationLoading,
}: UseEntityAnalyticsStatusParams): EntityAnalyticsStatus => {
  if (isMutationLoading) {
    return 'enabling';
  }

  if (entityStoreStatus === 'installing') {
    return 'enabling';
  }
  if (entityStoreStatus === 'error') {
    return 'error';
  }
  return deriveEntityStoreOnlyStatus(entityStoreStatus);
};

export const useEntityAnalyticsStatus = (
  params: UseEntityAnalyticsStatusParams
): EntityAnalyticsStatus => {
  const { entityStoreStatus, isMutationLoading } = params;

  return useMemo(
    () =>
      deriveEntityAnalyticsStatus({
        entityStoreStatus,
        isMutationLoading,
      }),
    [entityStoreStatus, isMutationLoading]
  );
};
