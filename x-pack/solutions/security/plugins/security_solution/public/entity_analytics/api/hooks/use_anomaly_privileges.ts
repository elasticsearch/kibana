/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityAppError } from '@kbn/securitysolution-t-grid';
import { useQuery } from '@kbn/react-query';
import type { EntityAnalyticsPrivileges } from '../../../../common/api/entity_analytics';
import { useEntityAnalyticsRoutes } from '../api';

export const ANOMALY_PRIVILEGES_QUERY_KEY = 'anomaly-privileges';

export const useAnomalyPrivileges = (enabled = true) => {
  const { fetchAnomalyPrivileges } = useEntityAnalyticsRoutes();
  return useQuery<EntityAnalyticsPrivileges, SecurityAppError>({
    queryKey: [ANOMALY_PRIVILEGES_QUERY_KEY],
    queryFn: fetchAnomalyPrivileges,
    enabled,
    retry: 0,
  });
};
