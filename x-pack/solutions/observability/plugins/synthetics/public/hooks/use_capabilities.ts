/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import {
  SYNTHETICS_API_URLS,
  type SyntheticsIndexPrivilegesResponse,
} from '../../common/constants';
import type { MonitorLocations } from '../../common/runtime_types';
import { apiService } from '../utils/api_service';

export const useCanEditSynthetics = () => {
  return !!useKibana().services?.application?.capabilities.uptime.save;
};

/**
 * Whether the current user can trigger manual test runs. True when they can edit
 * Synthetics (write) OR have been granted the run-only `canRunTestManually` sub-feature.
 */
export const useCanRunTestManually = () => {
  const capabilities = useKibana().services?.application?.capabilities.uptime;
  return !!(capabilities?.save || capabilities?.canRunTestManually);
};

export const useCanUsePublicLocationsPermission = (): boolean =>
  !!(useKibana().services?.application?.capabilities.uptime.elasticManagedLocationsEnabled ?? true);

export const useCanUsePublicLocations = (monLocations?: MonitorLocations) => {
  const canUsePublicLocations = useCanUsePublicLocationsPermission();
  const publicLocations = monLocations?.some((loc) => loc.isServiceManaged);

  if (!publicLocations) {
    return true;
  }

  return canUsePublicLocations;
};

export const useCanReadSyntheticsIndex = () => {
  // Search on `synthetics-*` can 200 with allow_no_indices even without index
  // `read`; data-view field_caps still 403s. `_has_privileges` is the real check.
  const { data, loading, status, error } = useFetcher<
    Promise<SyntheticsIndexPrivilegesResponse>
  >(() => {
    return apiService.get<SyntheticsIndexPrivilegesResponse>(SYNTHETICS_API_URLS.INDEX_PRIVILEGES);
  }, []);

  return {
    canRead: data?.canRead,
    error,
    loading,
    status,
  };
};
